import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import {
  buildExportFiles,
  patchYaml,
} from "../src/core/exportPipeline";
import { parseDag } from "../src/core/parse";
import type { Dag } from "../src/core/schema";
import type { Engine, Row } from "../src/core/engine";

function fixtureDag(source: string): Dag {
  const result = parseDag(source);
  if (!result.ok) throw new Error("fixture failed to parse");
  return result.dag;
}

const FIXTURE = `# Pipeline metadata
version: v1.0.0
pipeline_name: Test Pipeline # display name
option_sets:
  colors:
    values: [red, blue]
schemas:
  people:
    name: VARCHAR
    '...colors': VARCHAR
nodes:
  raw:
    kind: file
    description: Raw input
    schema: people
    export: true
  derived:
    kind: operation_result
    description: Derived output
    export: true
  scratch:
    kind: operation_result
    description: Not exported
  words:
    kind: data_literal
    description: Bare-string literal
    column: word
    data:
    - PTO
    - PTA
  people_notes:
    kind: data_literal
    description: Keyed literal
    data:
    - name: Ann
      note: ok
operations:
  make_derived:
    description: Makes derived from raw
    inputs: [raw]
    query: SELECT * FROM raw
    output: derived
`;

// The shared prefix and suffix; whatever lies between them is what changed.
function changedSpan(before: string, after: string): [number, number] {
  let head = 0;
  while (head < before.length && before[head] === after[head]) head++;
  let tail = 0;
  while (
    tail < before.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail++;
  }
  return [head, before.length - tail];
}

describe("patchYaml", () => {
  // Flow lists and a mid-line comment: this fails if the export re-serializes.
  it("preserves comments, key order and option_sets byte for byte", () => {
    expect(patchYaml(FIXTURE)).toBe(FIXTURE);
  });

  function literalData(dag: ReturnType<typeof fixtureDag>, name: string): unknown {
    const node = dag.nodes[name];
    if (node?.kind !== "data_literal") throw new Error(`${name} is not a data_literal`);
    return node.data;
  }

  it("edits a bare-string literal's data: block and nothing else", () => {
    const out = patchYaml(FIXTURE, { words: ["PTO", "NEW WORD"] });

    const [start, end] = changedSpan(FIXTURE, out);
    // The changed span sits strictly inside "words"'s own data: block.
    expect(start).toBeGreaterThanOrEqual(FIXTURE.indexOf("data:\n    - PTO"));
    expect(end).toBeLessThanOrEqual(FIXTURE.indexOf("people_notes:"));

    const dag = fixtureDag(out);
    expect(literalData(dag, "words")).toEqual(["PTO", "NEW WORD"]);
    // Untouched nodes parse to exactly what they did before.
    expect(literalData(dag, "people_notes")).toEqual([{ name: "Ann", note: "ok" }]);
    expect(dag.nodes.raw).toEqual(fixtureDag(FIXTURE).nodes.raw);
  });

  it("edits a keyed literal's data: block and nothing else", () => {
    const out = patchYaml(FIXTURE, {
      people_notes: [{ name: "Ann", note: "checked" }, { name: "Bob", note: "" }],
    });

    const [start, end] = changedSpan(FIXTURE, out);
    expect(start).toBeGreaterThanOrEqual(FIXTURE.indexOf("data:\n    - name: Ann"));
    expect(end).toBeLessThanOrEqual(FIXTURE.indexOf("operations:"));

    const dag = fixtureDag(out);
    expect(literalData(dag, "people_notes")).toEqual([
      { name: "Ann", note: "checked" },
      { name: "Bob", note: "" },
    ]);
    expect(literalData(dag, "words")).toEqual(["PTO", "PTA"]);
  });

  it("edits two nodes at once, each isolated to its own data: block", () => {
    const out = patchYaml(FIXTURE, {
      words: [],
      people_notes: [{ name: "Cate", note: "new" }],
    });

    const dag = fixtureDag(out);
    expect(literalData(dag, "words")).toEqual([]);
    expect(literalData(dag, "people_notes")).toEqual([{ name: "Cate", note: "new" }]);
    // Every node this test didn't touch reparses identically to the source.
    const before = fixtureDag(FIXTURE);
    for (const name of ["raw", "derived", "scratch"] as const) {
      expect(dag.nodes[name]).toEqual(before.nodes[name]);
    }
  });

  // Ending the splice at yaml's value range ate this comment and the next node's indent.
  it("keeps a comment after the block, and the node following it", () => {
    const source = [
      "nodes:",
      "  words:",
      "    kind: data_literal",
      "    description: Words",
      "    column: word",
      "    data:",
      "    - one",
      "    # why these",
      "  after:",
      "    kind: file",
      "    description: Later",
      "",
    ].join("\n");

    const out = patchYaml(source, { words: ["two", "three"] });

    expect(out).toContain("    # why these");
    expect(out).toContain("\n  after:");
    expect(parse(out).nodes.after).toEqual({
      kind: "file",
      description: "Later",
    });
    expect(parse(out).nodes.words.data).toEqual(["two", "three"]);
  });

  it("empties a block without disturbing the key that follows it", () => {
    const source = [
      "nodes:",
      "  words:",
      "    kind: data_literal",
      "    data:",
      "    - one",
      "    description: Words",
      "",
    ].join("\n");

    const out = patchYaml(source, { words: [] });

    expect(parse(out).nodes.words).toEqual({
      kind: "data_literal",
      data: [],
      description: "Words",
    });
  });

  // The byte-fidelity claim only means something against real, hand-formatted YAML.
  it("patches the real data/schema.yaml with only the edited block moving", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(
      new URL("../data/schema.yaml", import.meta.url),
      "utf8",
    );
    const before = parseDag(source);
    if (!before.ok) throw new Error("data/schema.yaml failed to parse");
    if (before.dag.nodes.excluded_words?.kind !== "data_literal") {
      throw new Error("data/schema.yaml no longer has an excluded_words data_literal");
    }

    const out = patchYaml(source, { excluded_words: ["PTO", "NEWWORD"] });
    const after = parseDag(out);
    if (!after.ok) throw new Error("patched data/schema.yaml failed to parse");
    if (after.dag.nodes.excluded_words?.kind !== "data_literal") {
      throw new Error("patched excluded_words is no longer a data_literal");
    }
    expect(after.dag.nodes.excluded_words.data).toEqual(["PTO", "NEWWORD"]);

    // Compared as bytes, not re-parsed: parsing mints fresh operation ids every time.
    const [start, end] = changedSpan(source, out);
    const dataStart = source.indexOf("data:", source.indexOf("excluded_words:"));
    const nextNode = source.indexOf("relevant_organizations:");
    expect(start).toBeGreaterThanOrEqual(dataStart);
    expect(end).toBeLessThanOrEqual(nextNode);
  });
});

// A minimal Engine double: only what buildExportFiles actually calls.
function fakeEngine(tables: Record<string, { columns: string[]; rows: Row[] }>): Engine {
  return {
    async query(sql) {
      const counted = sql.match(
        /information_schema\.tables WHERE table_name = '((?:[^']|'')*)'/,
      );
      if (counted) {
        const name = counted[1].replace(/''/g, "'");
        return [{ n: tables[name] ? "1" : "0" }];
      }
      const selected = sql.match(/^SELECT \* FROM "((?:[^"]|"")*)"$/);
      if (selected) {
        const name = selected[1].replace(/""/g, '"');
        return tables[name]?.rows ?? [];
      }
      throw new Error(`fakeEngine: unexpected query — ${sql}`);
    },
    async columns(name) {
      const table = tables[name];
      if (!table) throw new Error(`fakeEngine: no such table — ${name}`);
      return table.columns;
    },
    loadCsv: () => {
      throw new Error("fakeEngine: loadCsv not implemented");
    },
    createEmpty: () => {
      throw new Error("fakeEngine: createEmpty not implemented");
    },
    describeQuery: () => {
      throw new Error("fakeEngine: describeQuery not implemented");
    },
    parse: () => {
      throw new Error("fakeEngine: parse not implemented");
    },
    forget: () => {},
  };
}

describe("buildExportFiles", () => {
  it("includes the CSV for an export:true node with a table, skips one without, and skips export:false entirely", async () => {
    const result = parseDag(FIXTURE);
    if (!result.ok) throw new Error("fixture failed to parse");
    const { dag } = result;

    const engine = fakeEngine({
      raw: { columns: ["name", "color"], rows: [{ name: "Ann", color: "red" }] },
      // "derived" is export:true but never ran; "scratch" is export:false yet has a table.
      scratch: { columns: ["x"], rows: [{ x: "1" }] },
    });

    const files = await buildExportFiles(engine, dag, FIXTURE);

    expect(files.map((f) => f.name)).toEqual(["Test Pipeline.yaml", "raw.csv"]);
    expect(files[1].content).toBe("name,color\nAnn,red");
  });

  it("exports just the YAML when nothing has been run", async () => {
    const result = parseDag(FIXTURE);
    if (!result.ok) throw new Error("fixture failed to parse");
    const { dag } = result;

    const files = await buildExportFiles(fakeEngine({}), dag, FIXTURE);

    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("Test Pipeline.yaml");
    expect(files[0].content).toBe(FIXTURE);
  });

  it("patches the exported YAML's data: block from the run store's literal edits", async () => {
    const dag = fixtureDag(FIXTURE);
    const results = {
      [dag.nodes.words.id]: { literal: [{ word: "PTO" }, { word: "NEWWORD" }] },
    };

    const files = await buildExportFiles(fakeEngine({}), dag, FIXTURE, results);

    expect(files[0].content).not.toBe(FIXTURE);
    const patched = fixtureDag(files[0].content);
    const words = patched.nodes.words;
    if (words.kind !== "data_literal") throw new Error("words is not a data_literal");
    // A bare-string node round-trips as bare strings, not promoted to records.
    expect(words.data).toEqual(["PTO", "NEWWORD"]);
  });
});

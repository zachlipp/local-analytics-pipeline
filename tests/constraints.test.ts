import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  baseType,
  checkUnique,
  columnTypes,
  duplicateMessage,
  uniqueColumns,
} from "@core/constraints";
import { buildPipeline } from "@core/pipeline";
import { runPipeline } from "@core/runPipeline";
import { DagSchema, type Dag } from "@core/schema";
import { materializeShapes } from "@core/shapes";
import { declaredSchema, declaredTypes } from "@core/shapes";
import type { NodeResult } from "@core/status";
import { nodeEngine, type NodeEngine } from "../src/node/engine";

let engine: NodeEngine;
beforeAll(async () => {
  engine = await nodeEngine();
});
afterAll(() => engine.close());

describe("reading the constraint off a type", () => {
  it("finds UNIQUE after the type", () => {
    expect(uniqueColumns({ ein: "VARCHAR UNIQUE", name: "VARCHAR" })).toEqual([
      "ein",
    ]);
  });

  it("does not mistake a type that merely contains the letters", () => {
    expect(uniqueColumns({ ein: "UNIQUEIDENTIFIER" })).toEqual([]);
  });

  it("leaves DuckDB the type and nothing else", () => {
    expect(baseType("VARCHAR UNIQUE")).toBe("VARCHAR");
    expect(baseType("VARCHAR UNIQUE NOT NULL")).toBe("VARCHAR NOT NULL");
    expect(baseType("DECIMAL(18, 2)")).toBe("DECIMAL(18, 2)");
  });

  it("strips a whole schema at once", () => {
    expect(columnTypes({ ein: "VARCHAR UNIQUE", n: "INTEGER" })).toEqual({
      ein: "VARCHAR",
      n: "INTEGER",
    });
  });
});

describe("what a node hands DuckDB", () => {
  const schemas = { grantees: { ein: "VARCHAR UNIQUE", name: "VARCHAR" } };
  const node = (raw: Record<string, unknown>) =>
    DagSchema.parse({
      pipeline_name: "t",
      version: "v0.1.0",
      schemas,
      nodes: { n: { description: "", ...raw } },
      operations: {},
    }).nodes.n;

  it("never sees the constraint", () => {
    expect(declaredTypes(node({ kind: "file", schema: "grantees" }), schemas)).toEqual({
      ein: "VARCHAR",
      name: "VARCHAR",
    });
  });

  it("but the checks still do", () => {
    expect(declaredSchema(node({ kind: "file", schema: "grantees" }), schemas)).toEqual(
      schemas.grantees,
    );
  });

  it("and an operation_result may name one for them", () => {
    expect(
      declaredSchema(node({ kind: "operation_result", schema: "grantees" }), schemas),
    ).toEqual(schemas.grantees);
  });
});

describe("checkUnique", () => {
  it("says nothing about a column with no repeats", async () => {
    await engine.loadCsv("clean", "ein\n1\n2\n3\n", { ein: "VARCHAR" });
    expect(await checkUnique(engine, "clean", ["ein"])).toBeUndefined();
  });

  it("does not count nulls as duplicates of each other", async () => {
    await engine.loadCsv("nulls", "ein,name\n,A\n,B\n1,C\n", {
      ein: "VARCHAR",
      name: "VARCHAR",
    });
    expect(await checkUnique(engine, "nulls", ["ein"])).toBeUndefined();
  });

  // Grouped, not ordered within a group: nothing gives a row its position in
  // the file yet, so there is no file order left to preserve.
  it("returns every offending row whole, grouped by the value they share", async () => {
    await engine.loadCsv(
      "dupes",
      "ein,name\n1,A\n2,B\n1,C\n3,D\n2,E\n",
      { ein: "VARCHAR", name: "VARCHAR" },
    );
    const found = await checkUnique(engine, "dupes", ["ein"]);
    expect(found).toMatchObject({ column: "ein", count: 4, values: 2 });
    expect(found?.rows.map((row) => row.ein)).toEqual(["1", "1", "2", "2"]);
    expect(found?.rows.map((row) => row.name).sort()).toEqual([
      "A",
      "B",
      "C",
      "E",
    ]);
  });

  it("caps how many it keeps but still counts them all", async () => {
    const rows = Array.from({ length: 30 }, () => "1,x").join("\n");
    await engine.loadCsv("many", `ein,name\n${rows}\n`, {
      ein: "VARCHAR",
      name: "VARCHAR",
    });
    const found = await checkUnique(engine, "many", ["ein"], 5);
    expect(found?.count).toBe(30);
    expect(found?.rows).toHaveLength(5);
    expect(duplicateMessage("many", found!)).toContain("The first 5 are below.");
  });

  it("sends the reader to the node the author named, when there is one", async () => {
    await engine.loadCsv("named", "ein\n1\n1\n", { ein: "VARCHAR" });
    const found = (await checkUnique(engine, "named", ["ein"]))!;
    expect(duplicateMessage("named", found)).toContain(
      "Fix them where the data comes from",
    );
    expect(duplicateMessage("named", found, "standardized_names")).toContain(
      "Fix them in “standardized_names”, then run again.",
    );
  });

  it("refuses to check a column the table does not have", async () => {
    await engine.loadCsv("shapeless", "ein\n1\n", { ein: "VARCHAR" });
    await expect(checkUnique(engine, "shapeless", ["name"])).rejects.toThrow(
      /“name”.*unique, but “shapeless” has no such column/,
    );
  });
});

// One file, one operation that unions it with itself so the result repeats
// every ein — the shape of the real failure, where the source is fine and the
// operation is what breaks the constraint.
function dag(): Dag {
  return DagSchema.parse({
    pipeline_name: "test",
    version: "v0.1.0",
    schemas: {
      grants: { ein: "VARCHAR", amount: "DOUBLE" },
      grantee_records: { ein: "VARCHAR UNIQUE", amount: "DOUBLE" },
    },
    nodes: {
      grants: { kind: "file", schema: "grants", description: "" },
      grantee_records: {
        kind: "operation_result",
        schema: "grantee_records",
        description: "",
      },
    },
    operations: {
      aggregate: {
        description: "",
        inputs: ["grants"],
        output: "grantee_records",
        query:
          "SELECT ein, amount FROM grants UNION ALL SELECT ein, amount FROM grants",
      },
    },
  }) as Dag;
}

async function run(parsed: Dag, csv: string) {
  const patches: Record<string, NodeResult> = {};
  const outcome = await runPipeline(
    engine,
    buildPipeline(parsed),
    parsed,
    { [parsed.nodes.grants.id]: { file: { name: "g.csv", text: csv } } },
    (id, patch) => (patches[id] = { ...patches[id], ...patch }),
    "grantee_records",
  );
  return { outcome, patches };
}

describe("a run that breaks a uniqueness constraint", () => {
  it("fails on the operation, naming the column and the count", async () => {
    const parsed = dag();
    const { outcome, patches } = await run(parsed, "ein,amount\n1,10\n2,20\n");

    expect(outcome).toMatchObject({ ok: false, failed: "grantee_records" });
    const patch = patches[parsed.nodes.grantee_records.id];
    expect(patch.invalid).toContain("“ein” has to be unique in “grantee_records”");
    expect(patch.invalid).toContain("4 rows share 2 values");
  });

  it("keeps the duplicated rows whole, for the preview", async () => {
    const parsed = dag();
    const { patches } = await run(parsed, "ein,amount\n1,10\n2,20\n");

    const rows = patches[parsed.nodes.grantee_records.id].violations ?? [];
    expect(rows.map((row) => [row.ein, row.amount])).toEqual([
      ["1", "10"],
      ["1", "10"],
      ["2", "20"],
      ["2", "20"],
    ]);
  });

  it("is INVALID rather than ERROR: the table built, its rows are wrong", async () => {
    const parsed = dag();
    const { patches } = await run(parsed, "ein,amount\n1,10\n2,20\n");

    const patch = patches[parsed.nodes.grantee_records.id];
    expect(patch.error).toBeUndefined();
    expect(patch.table).toBe("grantee_records");
  });

  it("passes cleanly once nothing repeats", async () => {
    const parsed = dag();
    parsed.operations.aggregate.query = "SELECT ein, amount FROM grants";
    const { outcome, patches } = await run(parsed, "ein,amount\n1,10\n2,20\n");

    expect(outcome).toMatchObject({ ok: true });
    expect(patches[parsed.nodes.grantee_records.id].invalid).toBeUndefined();
  });
});

describe("validation, before anything is uploaded", () => {
  it("reports a unique column the operation never selects", async () => {
    const parsed = dag();
    parsed.operations.aggregate.query = "SELECT amount FROM grants";
    const report = await materializeShapes(engine, buildPipeline(parsed), parsed);

    expect(report.issues.map((issue) => issue.message)).toEqual([
      expect.stringContaining("Declares “ein” unique"),
    ]);
  });

  it("is silent when the operation does select it", async () => {
    const report = await materializeShapes(engine, buildPipeline(dag()), dag());
    expect(report.issues).toEqual([]);
  });
});

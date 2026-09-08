import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  checkFix,
  editableFix,
  fixOf,
  fixRecord,
  sameFields,
} from "@core/fix";
import { buildPipeline } from "@core/pipeline";
import { DagSchema, type Dag } from "@core/schema";
import { materializeShapes, type Columns } from "@core/shapes";
import { nodeEngine, type NodeEngine } from "../src/node/engine";

let engine: NodeEngine;
beforeAll(async () => {
  engine = await nodeEngine();
});
afterAll(() => engine.close());

// One operation whose output is constrained, and three candidate places to
// send someone when it breaks.
function dag(fix?: Record<string, unknown>): Dag {
  return DagSchema.parse({
    pipeline_name: "test",
    version: "v0.1.0",
    schemas: {
      grants: { ein: "VARCHAR", name: "VARCHAR" },
      grantees: { ein: "VARCHAR UNIQUE", name: "VARCHAR" },
    },
    nodes: {
      grants: { kind: "file", schema: "grants", description: "" },
      names: {
        kind: "data_literal",
        description: "",
        data: [{ ein: "1", raw_name: "HERO", standard_name: "Healthcare" }],
      },
      focuses: {
        kind: "data_entry",
        description: "",
        input: "grants",
        key: "ein",
        options: ["arts"],
      },
      grantee_records: {
        kind: "operation_result",
        description: "",
        schema: "grantees",
        ...(fix ? { fix } : {}),
      },
    },
    operations: {
      aggregate: {
        description: "",
        inputs: ["grants", "names"],
        output: "grantee_records",
        query: "SELECT ein, name FROM grants",
      },
    },
  }) as Dag;
}

async function shapes(parsed: Dag): Promise<Map<string, Columns>> {
  return (await materializeShapes(engine, buildPipeline(parsed), parsed)).built;
}

const KEYS = { node: "names", keys: { ein: "ein", raw_name: "name" } };

describe("fix:", () => {
  it("is absent until an author writes one", () => {
    expect(fixOf(dag().nodes.grantee_records)).toBeUndefined();
  });

  it("defaults to no mapping, which is still a place to go", () => {
    expect(fixOf(dag({ node: "names" }).nodes.grantee_records)).toEqual({
      node: "names",
      keys: {},
    });
  });

  it("opens a data_literal in place, carrying the mapping", () => {
    const parsed = dag(KEYS);
    expect(editableFix(parsed, parsed.nodes.grantee_records)).toEqual({
      name: "names",
      node: parsed.nodes.names,
      keys: { ein: "ein", raw_name: "name" },
    });
  });

  it("opens a data_entry in place", () => {
    const parsed = dag({ node: "focuses" });
    expect(editableFix(parsed, parsed.nodes.grantee_records)?.name).toBe(
      "focuses",
    );
  });

  // A file is a legitimate place to send someone, but there is nothing to edit
  // on the page — the message names it and the slide stays as it was.
  it("offers no editor for a kind that has none", () => {
    const parsed = dag({ node: "grants" });
    expect(editableFix(parsed, parsed.nodes.grantee_records)).toBeUndefined();
  });

  it("does not create an input edge", () => {
    const pipeline = buildPipeline(dag(KEYS));
    expect(pipeline.nodes.get("grantee_records")!.inputs).toEqual([
      "grants",
      "names",
    ]);
    expect(pipeline.nodes.get("names")!.outputs).toEqual(["grantee_records"]);
  });
});

describe("the record a failing row starts", () => {
  const offender = { ein: "20-8129476", name: "ND Autism Center", n: "19" };
  const columns = ["ein", "raw_name", "standard_name"];

  it("fills the mapped columns and leaves the judgement alone", () => {
    expect(fixRecord(KEYS.keys, offender, columns)).toEqual({
      ein: "20-8129476",
      raw_name: "ND Autism Center",
    });
  });

  it("writes a missing value as blank rather than as null", () => {
    expect(fixRecord({ raw_name: "name" }, { name: null }, columns)).toEqual({
      raw_name: "",
    });
  });

  it("drops a column the fix node does not have", () => {
    expect(fixRecord({ nope: "ein" }, offender, columns)).toEqual({});
  });

  it("recognises the row it already made, ignoring the fields left blank", () => {
    const filled = fixRecord(KEYS.keys, offender, columns);
    const existing = { ...filled, standard_name: "North Dakota Autism Center" };
    expect(sameFields(existing, filled)).toBe(true);
    expect(sameFields({ ...existing, ein: "other" }, filled)).toBe(false);
  });
});

describe("checkFix", () => {
  it("is silent when the names resolve", async () => {
    const parsed = dag(KEYS);
    expect(checkFix(parsed, await shapes(parsed))).toEqual([]);
  });

  it("is silent when there is no fix at all", async () => {
    const parsed = dag();
    expect(checkFix(parsed, await shapes(parsed))).toEqual([]);
  });

  it("fails a node no name defines", async () => {
    const parsed = dag({ node: "standardised_names" });
    const problems = checkFix(parsed, await shapes(parsed));
    expect(problems).toMatchObject([
      { node: "grantee_records", kind: "unknown_node" },
    ]);
    expect(problems[0].message).toContain("“standardised_names”");
  });

  it("fails a mapping into a node with no rows to add", async () => {
    const parsed = dag({ node: "focuses", keys: { ein: "ein" } });
    expect(checkFix(parsed, await shapes(parsed))).toMatchObject([
      { node: "grantee_records", kind: "not_editable", names: ["focuses"] },
    ]);
  });

  it("fails a left-hand column the fix node does not have", async () => {
    const parsed = dag({ node: "names", keys: { legal_name: "name" } });
    expect(checkFix(parsed, await shapes(parsed))).toMatchObject([
      { kind: "missing_target", names: ["legal_name"] },
    ]);
  });

  it("fails a right-hand column the failing table does not have", async () => {
    const parsed = dag({ node: "names", keys: { raw_name: "org_name" } });
    expect(checkFix(parsed, await shapes(parsed))).toMatchObject([
      { kind: "missing_source", names: ["org_name"] },
    ]);
  });

  // Two mistakes in one block are two things to go and change.
  it("reports both sides at once", async () => {
    const parsed = dag({ node: "names", keys: { legal_name: "org_name" } });
    expect(
      checkFix(parsed, await shapes(parsed)).map((p) => p.kind),
    ).toEqual(["missing_target", "missing_source"]);
  });
});

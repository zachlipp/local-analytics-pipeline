import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Engine } from "@core/engine";
import { buildPipeline } from "@core/pipeline";
import { DagSchema, NodeSchema, type Node } from "@core/schema";
import { materializeShapes, nodeShape } from "@core/shapes";
import { nodeEngine, type NodeEngine } from "../src/node/engine";

function node(raw: Record<string, unknown>): Node {
  return NodeSchema.parse({ description: "", ...raw });
}

describe("nodeShape", () => {
  it("unions a literal's keys in declaration order", () => {
    const shape = nodeShape(
      node({
        kind: "data_literal",
        data: [{ ein: "1", name: "A" }, { ein: "2", note: "moved" }],
      }),
      {},
    );
    expect(Object.keys(shape)).toEqual(["ein", "name", "note"]);
    expect(shape.name).toBe("VARCHAR");
  });

  it("names a bare-string literal's one column after the node", () => {
    const shape = nodeShape(
      node({ kind: "data_literal", column: "word", data: ["PTO", "PTA"] }),
      {},
    );
    expect(shape).toEqual({ word: "VARCHAR" });
  });

  it("gives a user input a single cell", () => {
    expect(nodeShape(node({ kind: "user_input" }), {})).toEqual({
      value: "VARCHAR",
    });
  });

  it("gives an entry grid its key, its frozen columns, then its options", () => {
    const shape = nodeShape(
      node({
        kind: "data_entry",
        input: "source",
        key: "ein",
        frozen: ["ein", "organization_name"],
        options: ["arts", "youth"],
      }),
      {},
    );
    expect(Object.keys(shape)).toEqual([
      "ein",
      "organization_name",
      "arts",
      "youth",
    ]);
  });

  it("takes a file's columns from the schema it names", () => {
    const shape = nodeShape(
      node({ kind: "file", schema: "grants" }),
      { grants: { ein: "VARCHAR", amount: "DOUBLE" } },
    );
    expect(shape).toEqual({ ein: "VARCHAR", amount: "DOUBLE" });
  });

  it("refuses a file with no schema, and one naming a schema that isn't there", () => {
    expect(() => nodeShape(node({ kind: "file" }), {})).toThrow(/schema/);
    expect(() =>
      nodeShape(node({ kind: "file", schema: "nope" }), {}),
    ).toThrow(/nope/);
  });

  it("refuses to guess an operation's output", () => {
    expect(() => nodeShape(node({ kind: "operation_result" }), {})).toThrow();
  });
});

const CHAIN = {
  pipeline_name: "chain",
  version: "v0.1.0",
  schemas: { source: { ein: "VARCHAR", amount: "INTEGER" } },
  nodes: {
    grants: { kind: "file", schema: "source", description: "" },
    totals: { kind: "operation_result", description: "" },
    flagged: { kind: "operation_result", description: "" },
  },
  operations: {
    total_by_org: {
      description: "",
      inputs: ["grants"],
      output: "totals",
      query: "SELECT ein, SUM(amount) AS total FROM grants GROUP BY ein",
    },
    flag_large: {
      description: "",
      inputs: ["totals"],
      output: "flagged",
      query: "SELECT ein, total > 100 AS large FROM totals",
    },
  },
};

describe("materializeShapes", () => {
  let engine: NodeEngine;
  beforeAll(async () => {
    engine = await nodeEngine();
  });
  afterAll(() => engine.close());

  async function run(raw: unknown) {
    const dag = DagSchema.parse(raw);
    return materializeShapes(engine as Engine, buildPipeline(dag), dag);
  }

  it("infers an operation's output, then the operation reading it", async () => {
    const report = await run(CHAIN);

    expect(report.issues).toEqual([]);
    expect(report.built.get("totals")).toEqual({
      ein: "VARCHAR",
      total: "HUGEINT",
    });
    expect(report.built.get("flagged")).toEqual({
      ein: "VARCHAR",
      large: "BOOLEAN",
    });
  });

  it("names the operation and repeats DuckDB's message when a query won't bind", async () => {
    const broken = structuredClone(CHAIN);
    broken.operations.flag_large.query = "SELECT ein, totl FROM totals";

    const report = await run(broken);

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].operation).toBe("flag_large");
    expect(report.issues[0].node).toBe("flagged");
    expect(report.issues[0].message).toMatch(/totl/);
    expect(report.built.has("flagged")).toBe(false);
  });

  it("collects every failure rather than stopping at the first", async () => {
    const broken = structuredClone(CHAIN);
    broken.operations.total_by_org.query = "SELECT ein, SUM(amt) FROM grants";
    broken.operations.flag_large.query = "SELECT FROM WHERE";

    const report = await run(broken);

    expect(report.issues.map((i) => i.operation).sort()).toEqual([
      "flag_large",
      "total_by_org",
    ]);
  });
});

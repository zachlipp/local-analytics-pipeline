import { describe, expect, it } from "vitest";
import { compareInputs } from "@core/checkInputs";
import { checkReads } from "@core/checkReads";
import { DagSchema, NodeSchema, type Dag } from "@core/schema";
import { isDocument, scriptPath, select } from "@core/scripts";
import { nodeShape } from "@core/shapes";
import { missingScripts } from "../src/node/scripts";

function node(raw: Record<string, unknown>) {
  return NodeSchema.parse({ description: "", ...raw });
}

function dag(nodes: Record<string, unknown>): Dag {
  return DagSchema.parse({
    pipeline_name: "t",
    version: "v0.1.0",
    schemas: { coords: { ein: "VARCHAR" } },
    nodes,
    operations: {},
  });
}

describe("script nodes", () => {
  it("takes a bare name and refuses a path", () => {
    expect(() =>
      node({ kind: "script", src: "src/nodes/scripts/geocode.ts", input: "a" }),
    ).toThrow();
    expect(() => node({ kind: "script", src: "geocode", input: "a" })).not.toThrow();
  });

  it("resolves a name to the one script directory", () => {
    expect(scriptPath("geocode")).toBe("src/nodes/scripts/geocode.ts");
  });

  it("has columns when it declares a schema and none when it does not", () => {
    const schemas = { coords: { ein: "VARCHAR", latitude: "DOUBLE" } };
    const rows = node({ kind: "script", src: "geocode", input: "a", schema: "coords" });
    const document = node({ kind: "script", src: "geojson", input: "a" });

    expect(nodeShape(rows, schemas)).toEqual(schemas.coords);
    expect(nodeShape(document, schemas)).toBeUndefined();
  });

  it("does not record external requests unless the node says so", () => {
    const quiet = node({ kind: "script", src: "geojson", input: "a" });
    const noisy = node({ kind: "script", src: "geocode", input: "a", network: true });

    expect(quiet.kind === "script" && quiet.network).toBe(false);
    expect(noisy.kind === "script" && noisy.network).toBe(true);
  });
});

describe("reading a script from SQL", () => {
  const graph = dag({
    a: { kind: "operation_result", description: "" },
    rows: { kind: "script", src: "geocode", input: "a", schema: "coords", description: "" },
    file: { kind: "script", src: "geojson", input: "a", description: "" },
  });

  const operation = { id: "x", description: "", inputs: ["file"], query: "", output: "out" };

  it("rejects an operation that queries a document script", () => {
    const problems = compareInputs("op", operation, graph, [{ name: "file" }]);
    expect(problems.map((p) => p.kind)).toContain("not_a_table");
  });

  it("allows one that queries a script returning rows", () => {
    const problems = compareInputs(
      "op",
      { ...operation, inputs: ["rows"] },
      graph,
      [{ name: "rows" }],
    );
    expect(problems.map((p) => p.kind)).not.toContain("not_a_table");
  });
});

describe("missingScripts", () => {
  it("finds a node naming a module that is not there", () => {
    const graph = dag({
      here: { kind: "script", src: "geocode", input: "a", description: "" },
      gone: { kind: "script", src: "nothingIsHere", input: "a", description: "" },
    });

    expect(missingScripts(graph).map((m) => m.node)).toEqual(["gone"]);
  });
});

describe("isDocument", () => {
  it("reads rows as rows and a document as a document", () => {
    expect(isDocument([{ ein: "1" }])).toBe(false);
    expect(isDocument({ filename: "a", mediaType: "text/plain", body: "" })).toBe(true);
  });
});

describe("select", () => {
  const rows = [
    { ein: "1", name: "One", city: "Fargo" },
    { ein: "2", name: "Two", city: "" },
  ];

  it("narrows a row to the columns it names", () => {
    expect(select(rows, ["ein"], ["city"])).toEqual([
      { ein: "1", city: "Fargo" },
      { ein: "2" },
    ]);
  });

  it("refuses a column the input does not have, and says what it does", () => {
    expect(() => select(rows, ["ein", "zipcode"])).toThrow(/no zipcode/);
    expect(() => select(rows, ["ein", "zipcode"])).toThrow(/ein, name, city/);
  });

  it("refuses a required column that is blank, naming the rows", () => {
    expect(() => select(rows, ["ein", "city"])).toThrow(/city on row 2/);
  });

  it("trims, and reads a blank optional column as absent", () => {
    expect(select([{ ein: " 1 ", city: "  " }], ["ein"], ["city"])).toEqual([
      { ein: "1" },
    ]);
  });

  it("has nothing to check when the input is empty", () => {
    expect(select([], ["whatever"])).toEqual([]);
  });
});

describe("checkReads", () => {
  const graph = dag({
    source: { kind: "operation_result", description: "" },
    reader: {
      kind: "script",
      src: "geocode",
      input: "source",
      reads: ["ein", "zipcode"],
      description: "",
    },
  });

  it("reports a column the input table does not have", () => {
    const built = new Map([["source", { ein: "VARCHAR", zip: "VARCHAR" }]]);
    expect(checkReads(graph, built)).toEqual([
      { node: "reader", input: "source", missing: ["zipcode"], available: ["ein", "zip"] },
    ]);
  });

  it("says nothing when every column is there", () => {
    const built = new Map([["source", { ein: "VARCHAR", zipcode: "VARCHAR" }]]);
    expect(checkReads(graph, built)).toEqual([]);
  });

  it("stays quiet about an input that was never built", () => {
    expect(checkReads(graph, new Map())).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import {
  blankLiteralRecord,
  isBareLiteral,
  literalRecords,
  literalRecordsToCsv,
  literalYamlRows,
} from "../src/core/dataLiteral";
import { NodeSchema, type DataLiteralNode } from "../src/core/schema";

function literal(raw: Record<string, unknown> = {}): DataLiteralNode {
  return NodeSchema.parse({
    kind: "data_literal",
    description: "",
    data: [],
    ...raw,
  }) as DataLiteralNode;
}

describe("isBareLiteral", () => {
  it("is true for bare strings, false once any row is keyed", () => {
    expect(isBareLiteral(literal({ data: ["PTO", "PTA"] }))).toBe(true);
    expect(isBareLiteral(literal({ data: [{ ein: "1" }] }))).toBe(false);
    expect(isBareLiteral(literal({ data: [] }))).toBe(true);
  });
});

describe("literalRecords", () => {
  it("wraps a bare string under the node's column", () => {
    const node = literal({ column: "word", data: ["PTO", "PTA"] });
    expect(literalRecords(node)).toEqual([{ word: "PTO" }, { word: "PTA" }]);
  });

  it("fills a missing key with an empty string, matching literalCsv", () => {
    const node = literal({
      data: [{ name: "A", ein: "1" }, { name: "B", ein: "2", note: "x" }],
    });
    expect(literalRecords(node)).toEqual([
      { name: "A", ein: "1", note: "" },
      { name: "B", ein: "2", note: "x" },
    ]);
  });
});

describe("blankLiteralRecord", () => {
  it("carries the node's fixed fields, each empty", () => {
    const node = literal({ data: [{ name: "A", ein: "1" }] });
    expect(blankLiteralRecord(node)).toEqual({ name: "", ein: "" });
  });

  it("uses the node's column for a bare literal, even with no rows yet", () => {
    expect(blankLiteralRecord(literal({ column: "word", data: [] }))).toEqual({
      word: "",
    });
  });
});

describe("literalRecordsToCsv", () => {
  it("uses the node's declared columns as the header, not the edited row's own keys", () => {
    const node = literal({ data: [{ name: "A", ein: "1" }] });
    expect(literalRecordsToCsv(node, [{ name: "B", ein: "2" }])).toBe(
      "name,ein\nB,2",
    );
  });
});

describe("literalYamlRows", () => {
  it("serializes edited rows back to bare strings when the node was bare", () => {
    const node = literal({ column: "word", data: ["PTO"] });
    expect(literalYamlRows(node, [{ word: "PTA" }, { word: "PTSA" }])).toEqual([
      "PTA",
      "PTSA",
    ]);
  });

  it("serializes edited rows as keyed records when the node was keyed", () => {
    const node = literal({ data: [{ name: "A", ein: "1" }] });
    expect(literalYamlRows(node, [{ name: "B", ein: "2" }])).toEqual([
      { name: "B", ein: "2" },
    ]);
  });
});

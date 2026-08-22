import { describe, expect, test } from "vitest";
import { checkSchemas } from "@core/schemaErrors";

function summaries(schemas: Record<string, Record<string, string>>): string[] {
  return checkSchemas(schemas).map((error) => `${error.schema}: ${error.summary}`);
}

describe("checkSchemas", () => {
  test("a plain lowercase schema is silent", () => {
    expect(summaries({ grants: { ein: "VARCHAR", amount: "DOUBLE" } })).toEqual([]);
  });

  test("underscores and digits are fine", () => {
    expect(summaries({ s: { ein_2: "VARCHAR", _private: "VARCHAR" } })).toEqual([]);
  });

  test("a capitalised column is reported with its name", () => {
    expect(summaries({ irs: { EIN: "VARCHAR", ein: "VARCHAR" } })).toEqual([
      "irs: Capital letters: EIN",
    ]);
  });

  test("every capitalised column is named, not just the first", () => {
    expect(summaries({ irs: { LAT: "DOUBLE", LNG: "DOUBLE" } })).toEqual([
      "irs: Capital letters: LAT, LNG",
    ]);
  });

  test("a column needing quotes is reported separately from a capitalised one", () => {
    expect(summaries({ s: { "org name": "VARCHAR" } })).toEqual([
      "s: Needs quoting: org name",
    ]);
  });

  test("a schema with no columns is reported", () => {
    expect(summaries({ empty: {} })).toEqual(["empty: No columns"]);
  });

  test("an empty schema is not also reported for its columns", () => {
    expect(checkSchemas({ empty: {} })).toHaveLength(1);
  });

  test("each schema is reported on its own", () => {
    expect(summaries({ a: { EIN: "VARCHAR" }, b: {} })).toEqual([
      "a: Capital letters: EIN",
      "b: No columns",
    ]);
  });

  test("the detail says what to change", () => {
    const [error] = checkSchemas({ irs: { EIN: "VARCHAR" } });
    expect(error.detail).toMatch(/lowercase/i);
  });
});

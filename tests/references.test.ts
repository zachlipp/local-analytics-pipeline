import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { SqlParseError, tableReferences } from "@core/references";

// Captured from a real DuckDB via json_serialize_sql. Regenerate them when the
// pinned DuckDB version moves; the walker fails loudly if the format drifts.
const FIXTURES: Record<string, { sql: string; ast: unknown }> = JSON.parse(
  readFileSync(new URL("./fixtures/asts.json", import.meta.url), "utf8"),
);

function names(fixture: string): string[] {
  return tableReferences(FIXTURES[fixture].ast)
    .map((reference) => reference.name)
    .sort();
}

describe("tableReferences", () => {
  test("reads a plain FROM", () => {
    expect(names("plain")).toEqual(["orgs"]);
  });

  test("ignores the alias", () => {
    expect(names("aliased")).toEqual(["orgs"]);
  });

  test("finds both sides of a join", () => {
    expect(names("join_using")).toEqual(["grants", "orgs"]);
  });

  test("descends into a correlated subquery", () => {
    expect(names("not_exists")).toEqual(["excluded_words", "orgs"]);
  });

  test("descends into a derived table", () => {
    expect(names("derived")).toEqual(["grants"]);
  });

  test("descends into a scalar subquery", () => {
    expect(names("scalar_subquery")).toEqual(["orgs", "year"]);
  });

  test("reads both arms of a set operation", () => {
    expect(names("set_operation")).toEqual(["historic_grants", "new_grants"]);
  });

  test("reads both sides of a cross join", () => {
    expect(names("cross_join")).toEqual(["orgs", "year"]);
  });

  test("a table function is not a table", () => {
    expect(names("table_function")).toEqual([]);
  });

  test("a VALUES list is not a table", () => {
    expect(names("values_list")).toEqual([]);
  });

  test("a CTE is not a node, but its body still counts", () => {
    expect(names("cte_body")).toEqual(["grants"]);
  });

  test("a CTE shadows a node of the same name", () => {
    expect(names("cte_shadow")).toEqual(["grants"]);
  });

  test("a recursive CTE referring to itself is not a reference", () => {
    expect(names("recursive_cte")).toEqual([]);
  });

  test("a qualified name keeps its qualifier", () => {
    expect(tableReferences(FIXTURES.qualified.ast)).toEqual([
      { name: "orgs", qualifier: "main" },
    ]);
  });

  test("unparsable SQL throws rather than reporting nothing", () => {
    expect(() => tableReferences(FIXTURES.broken.ast)).toThrow(SqlParseError);
  });
});

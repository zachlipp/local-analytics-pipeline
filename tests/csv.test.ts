import { describe, expect, it } from "vitest";

import {
  csvColumns,
  csvRows,
  parseCsv,
  searchLabel,
  searchRows,
  toCsv,
} from "../src/core/csv";

describe("parseCsv", () => {
  it("reads quoted fields holding commas, quotes and newlines", () => {
    expect(parseCsv('a,b\n"x,1","he said ""hi"""\n')).toEqual([
      ["a", "b"],
      ["x,1", 'he said "hi"'],
    ]);
    expect(parseCsv('a\n"two\nlines"\n')).toEqual([["a"], ["two\nlines"]]);
  });

  it("stops at the limit and handles CRLF", () => {
    expect(parseCsv("a,b\r\n1,2\r\n3,4\r\n", 2)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("has no rows for an empty file", () => {
    expect(parseCsv("")).toEqual([]);
    expect(csvColumns("")).toEqual([]);
  });
});

describe("csvRows", () => {
  it("makes a missing value null rather than an empty string", () => {
    expect(csvRows("ein,name\n12,\n34,Beyond Shelter\n56\n")).toEqual([
      { ein: "12", name: null },
      { ein: "34", name: "Beyond Shelter" },
      { ein: "56", name: null },
    ]);
  });

  it("writes a null back out as an empty field", () => {
    expect(toCsv(["ein", "name"], [{ ein: "12", name: null }])).toBe(
      "ein,name\n12,",
    );
  });
});

describe("searchRows", () => {
  const rows = csvRows(
    "ein,name,city\n12-3,Beyond Shelter,Fargo\n45-6,,Beyond\n78-9,Villa,Fargo\n",
  );

  it("matches name and ein, and nothing else", () => {
    expect(searchRows(rows, "beyond", 10)).toEqual([rows[0]]);
    expect(searchRows(rows, "45-6", 10)).toEqual([rows[1]]);
    expect(searchRows(rows, "fargo", 10)).toEqual([]);
  });

  it("looks in the columns it is given instead", () => {
    expect(searchRows(rows, "fargo", 10, ["city"])).toEqual([rows[0], rows[2]]);
    expect(searchRows(rows, "45-6", 10, ["city"])).toEqual([]);
  });

  it("stops at the limit", () => {
    expect(searchRows(rows, "-", 2)).toHaveLength(2);
  });
});

describe("searchLabel", () => {
  it("names the columns the box looks in", () => {
    expect(searchLabel(["name", "ein"])).toBe("Search by name or EIN");
    expect(searchLabel(["customer_id", "name"])).toBe(
      "Search by customer ID or name",
    );
    expect(searchLabel(["name"])).toBe("Search by name");
  });
});

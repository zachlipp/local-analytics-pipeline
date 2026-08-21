import { checkRequiredColumns } from "@core/constraints";
import { NodeSchema } from "@core/schema";
import { describe, expect, test } from "vitest";

function node(required: string[]) {
  return NodeSchema.parse({
    kind: "file",
    description: "",
    constraints: { required_columns: required },
  });
}

describe("checkRequiredColumns", () => {
  test("passes when nothing is required", () => {
    expect(checkRequiredColumns("t", node([]), [])).toBeUndefined();
  });

  test("passes when every required column is present", () => {
    const columns = ["ein", "name", "city"];
    expect(checkRequiredColumns("t", node(["ein", "city"]), columns)).toBeUndefined();
  });

  test("names the one missing column and what is there instead", () => {
    const message = checkRequiredColumns("companies", node(["ein"]), [
      "name",
      "city",
    ]);
    expect(message).toBe(
      `“companies” needs a column called “ein”. The columns it has are “name” and “city”.`,
    );
  });

  test("names several missing columns", () => {
    const message = checkRequiredColumns(
      "companies",
      node(["ein", "zip", "state"]),
      ["name"],
    );
    expect(message).toBe(
      `“companies” needs these columns: “ein”, “zip”, and “state”. The columns it has are “name”.`,
    );
  });

  test("says so when the table has no columns", () => {
    const message = checkRequiredColumns("companies", node(["ein"]), []);
    expect(message).toBe(
      `“companies” needs a column called “ein”. It has no columns at all.`,
    );
  });
});

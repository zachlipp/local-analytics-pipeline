import { describe, expect, it } from "vitest";

import { formatRoute, parseRoute, type Route } from "@ui/route";

describe("parseRoute", () => {
  it("defaults an empty hash to the first slide of the walkthrough", () => {
    expect(parseRoute("")).toEqual({ view: "steps", step: undefined });
    expect(parseRoute("#")).toEqual({ view: "steps", step: undefined });
  });

  it("reads the view and the step", () => {
    expect(parseRoute("#/steps/sales_csv")).toEqual({
      view: "steps",
      step: "sales_csv",
    });
    expect(parseRoute("#/graph")).toEqual({ view: "graph", step: undefined });
  });

  it("keeps the step across a view it doesn't apply to", () => {
    expect(parseRoute("#/graph/sales_csv")).toEqual({
      view: "graph",
      step: "sales_csv",
    });
  });

  it("decodes a name that needed escaping", () => {
    expect(parseRoute("#/steps/one%2Ftwo%20three").step).toBe("one/two three");
  });

  it("falls back to the walkthrough for anything it doesn't recognise", () => {
    expect(parseRoute("#nonsense").view).toBe("steps");
    expect(parseRoute("#/steps/%").step).toBe("%");
  });
});

describe("formatRoute", () => {
  it("round-trips every route through the hash", () => {
    const routes: Route[] = [
      { view: "steps" },
      { view: "graph" },
      { view: "steps", step: "sales_csv" },
      { view: "graph", step: "one/two three" },
    ];
    for (const route of routes) {
      expect(parseRoute(formatRoute(route))).toEqual({
        step: undefined,
        ...route,
      });
    }
  });
});

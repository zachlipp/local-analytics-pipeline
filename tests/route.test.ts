import { describe, expect, it } from "vitest";

import { formatRoute, mergeRoute, parseRoute, type Route } from "@ui/route";

describe("parseRoute", () => {
  it("reads a hash naming no source as the landing page", () => {
    expect(parseRoute("")).toEqual({ view: "overview" });
    expect(parseRoute("#")).toEqual({ view: "overview" });
    expect(parseRoute("#/")).toEqual({ view: "overview" });
  });

  it("reads the source, the view and the step", () => {
    expect(parseRoute("#/custom-pipeline/steps/sales_csv")).toEqual({
      source: "custom-pipeline",
      view: "steps",
      step: "sales_csv",
    });
    expect(parseRoute("#/demo-pipeline/graph")).toEqual({
      source: "demo-pipeline",
      view: "graph",
      step: undefined,
    });
  });

  it("keeps the step across a view it doesn't apply to", () => {
    expect(parseRoute("#/demo-pipeline/graph/sales_csv")).toEqual({
      source: "demo-pipeline",
      view: "graph",
      step: "sales_csv",
    });
  });

  it("decodes a name that needed escaping", () => {
    expect(parseRoute("#/demo-pipeline/steps/one%2Ftwo%20three").step).toBe(
      "one/two three",
    );
    expect(parseRoute("#/demo-pipeline/steps/%").step).toBe("%");
  });

  it("treats a source it doesn't recognise as the landing page", () => {
    expect(parseRoute("#nonsense").source).toBeUndefined();
    expect(parseRoute("#/generated/graph").source).toBeUndefined();
    // The pre-source grammar, which named a view in the first segment.
    expect(parseRoute("#/steps/sales_csv").source).toBeUndefined();
  });

  it("takes the caller's fallback when the hash names no view", () => {
    expect(parseRoute("#/demo-pipeline", "graph").view).toBe("graph");
    expect(parseRoute("#/custom-pipeline/nonsense", "graph").view).toBe("graph");
  });

  it("lets a hash that names a view beat the fallback", () => {
    expect(parseRoute("#/demo-pipeline/steps", "graph").view).toBe("steps");
    expect(parseRoute("#/demo-pipeline/graph", "steps").view).toBe("graph");
    expect(parseRoute("#/demo-pipeline/overview", "steps").view).toBe("overview");
  });
});

describe("mergeRoute", () => {
  const at: Route = { source: "custom-pipeline", view: "graph", step: "sales_csv" };

  it("keeps the pipeline when only the view changes", () => {
    expect(mergeRoute(at, { view: "steps" })).toEqual({
      source: "custom-pipeline",
      view: "steps",
      step: "sales_csv",
    });
  });

  it("keeps the pipeline when a step changes", () => {
    expect(mergeRoute(at, { view: "steps", step: "irs" }).source).toBe("custom-pipeline");
  });

  it("never formats a view change back to the landing page", () => {
    for (const source of ["demo-pipeline", "custom-pipeline"] as const) {
      const now: Route = { source, view: "graph" };
      expect(formatRoute(mergeRoute(now, { view: "steps" }))).toBe(
        `#/${source}/steps`,
      );
      expect(
        formatRoute(mergeRoute(now, { view: "steps", step: "irs" })),
      ).toBe(`#/${source}/steps/irs`);
    }
  });

  it("takes an explicit source over the current one", () => {
    expect(mergeRoute(at, { source: "demo-pipeline" }).source).toBe("demo-pipeline");
  });
});

describe("formatRoute", () => {
  it("round-trips every route through the hash", () => {
    const routes: Route[] = [
      { source: "demo-pipeline", view: "overview" },
      { source: "demo-pipeline", view: "steps" },
      { source: "custom-pipeline", view: "graph" },
      { source: "custom-pipeline", view: "steps", step: "sales_csv" },
      { source: "demo-pipeline", view: "graph", step: "one/two three" },
    ];
    for (const route of routes) {
      expect(parseRoute(formatRoute(route))).toEqual({
        step: undefined,
        ...route,
      });
    }
  });

  it("formats a route with no source as the landing page", () => {
    expect(formatRoute({ view: "graph" })).toBe("#/");
    expect(formatRoute({ view: "steps", step: "sales_csv" })).toBe("#/");
  });
});

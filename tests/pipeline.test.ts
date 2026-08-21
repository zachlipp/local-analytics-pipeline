// Signatures only — the bodies are yours to fill in. Note that an empty body
// passes, so these are green until they actually assert something.
import { DagSchema } from "@core/schema";
import { describe, test } from "vitest";

/** A DAG whose stages are obvious: two roots -> one result -> one result. */
function dag() {
  return DagSchema.parse({
    pipeline_name: "test",
    version: "v0.1.0",
    nodes: {
      raw: { kind: "file", description: "" },
      year: { kind: "user_input", description: "" },
      cleaned: { kind: "operation_result", description: "" },
      summarized: { kind: "operation_result", description: "" },
      orphan: { kind: "data_literal", description: "", data: [] },
    },
    operations: {
      clean: {
        description: "",
        inputs: ["raw", "year"],
        output: "cleaned",
        query: "",
      },
      summarize: {
        description: "",
        inputs: ["cleaned"],
        output: "summarized",
        query: "",
      },
    },
  });
}

/** The same two nodes feeding each other, for the cycle case. */
function cyclicDag() {
  return DagSchema.parse({
    pipeline_name: "test",
    version: "v0.1.0",
    nodes: {
      a: { kind: "operation_result", description: "" },
      b: { kind: "operation_result", description: "" },
    },
    operations: {
      one: { description: "", inputs: ["b"], output: "a", query: "" },
      two: { description: "", inputs: ["a"], output: "b", query: "" },
    },
  });
}

describe("buildPipeline", () => {
  test("every node becomes exactly one step", () => {
    dag();
  });

  test("no step precedes one of its own inputs", () => {
    dag();
  });

  test("a branch is walked to its result before the next one starts", () => {
    dag();
  });

  test("stage counts hops from the start, whatever the step order", () => {
    dag();
  });

  test("edges are recorded in both directions", () => {
    dag();
  });

  test("kinds the user has to fill in are flagged", () => {
    dag();
  });

  test("a cycle still yields every node instead of hanging", () => {
    cyclicDag();
  });
});

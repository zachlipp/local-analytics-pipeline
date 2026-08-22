import { DagSchema } from "@core/schema";
import { stableUuid } from "@core/utils";
import { describe, expect, test } from "vitest";

function parse() {
  return DagSchema.parse({
    pipeline_name: "test",
    version: "v0.1.0",
    nodes: {
      raw: { kind: "file", description: "" },
      cleaned: { kind: "operation_result", description: "" },
    },
    operations: {
      clean: { description: "", inputs: ["raw"], output: "cleaned", query: "" },
    },
  });
}

describe("node ids", () => {
  // Everything keyed by a node id — the run store, the IndexedDB row — is lost
  // if this stops holding.
  test("survive a re-parse", () => {
    expect(parse().nodes.raw.id).toBe(parse().nodes.raw.id);
  });

  test("differ between nodes", () => {
    const dag = parse();
    expect(dag.nodes.raw.id).not.toBe(dag.nodes.cleaned.id);
  });

  test("come from the node's name", () => {
    expect(parse().nodes.raw.id).toBe(stableUuid("raw"));
  });

  test("are shaped like a uuid", () => {
    expect(parse().nodes.raw.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

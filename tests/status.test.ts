import { pipelineComplete, type Status } from "@core/status";
import { describe, expect, test } from "vitest";

function statuses(entries: Record<string, Status>) {
  return new Map(Object.entries(entries));
}

describe("pipelineComplete", () => {
  test("every node succeeded", () => {
    expect(
      pipelineComplete(statuses({ raw: "SUCCEEDED", cleaned: "SUCCEEDED" })),
    ).toBe(true);
  });

  test("one node short", () => {
    for (const status of [
      "NEEDS_INPUT",
      "UNREACHED",
      "ERROR",
      "INVALID",
    ] as const) {
      expect(
        pipelineComplete(statuses({ raw: "SUCCEEDED", cleaned: status })),
      ).toBe(false);
    }
  });

  test("a pipeline with no nodes is never complete", () => {
    expect(pipelineComplete(statuses({}))).toBe(false);
  });
});

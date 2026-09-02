import { describe, expect, it } from "vitest";

import {
  change,
  hotfix,
  setVersion,
  type Identity,
} from "@core/pipelineChange";
import { semverRegex } from "@core/schema";

const stored: Identity = {
  pipeline_name: "PaY Nonprofit Map",
  version: "v0.1.0",
  hash: "aaaa",
};

describe("change", () => {
  it("is fresh when the store holds nothing", () => {
    expect(change(stored, undefined)).toEqual({ kind: "fresh" });
  });

  it("is the same pipeline when the bytes match", () => {
    expect(change({ ...stored }, stored)).toEqual({ kind: "same" });
  });

  it("is an update when only the version moved", () => {
    expect(change({ ...stored, version: "v0.2.0", hash: "bbbb" }, stored)).toEqual({
      kind: "update",
    });
  });

  it("is an update in either direction, since nothing here orders versions", () => {
    expect(change({ ...stored, version: "v0.0.9", hash: "bbbb" }, stored)).toEqual({
      kind: "update",
    });
  });

  it("is a replace when the name differs, whatever the version says", () => {
    expect(
      change({ ...stored, pipeline_name: "Something Else" }, stored),
    ).toEqual({ kind: "replace" });
    expect(
      change(
        { pipeline_name: "Something Else", version: "v9.9.9", hash: "bbbb" },
        stored,
      ),
    ).toEqual({ kind: "replace" });
  });

  it("conflicts when the same version arrives over different bytes", () => {
    expect(change({ ...stored, hash: "bbbb" }, stored)).toEqual({
      kind: "conflict",
      hotfix: "v0.1.0-hotfix",
    });
  });

  it("offers no hatch when the conflicting version is already a hotfix", () => {
    const hotfixed = { ...stored, version: "v0.1.0-hotfix" };
    expect(change({ ...hotfixed, hash: "bbbb" }, hotfixed)).toEqual({
      kind: "conflict",
      hotfix: undefined,
    });
  });

  it("breaks the conflict loop: a hotfixed store takes the next upload as an update", () => {
    const hotfixed = { ...stored, version: "v0.1.0-hotfix", hash: "bbbb" };
    expect(change({ ...stored, hash: "cccc" }, hotfixed)).toEqual({
      kind: "update",
    });
  });
});

describe("hotfix", () => {
  it("appends the one prerelease the schema admits", () => {
    expect(hotfix("v0.1.0")).toBe("v0.1.0-hotfix");
    expect(semverRegex.test(hotfix("v0.1.0")!)).toBe(true);
  });

  it("has nowhere to go from a version already hotfixed", () => {
    expect(hotfix("v0.1.0-hotfix")).toBeUndefined();
  });
});

describe("setVersion", () => {
  const source = `# The pipeline the map is built from.
version: v0.1.0
pipeline_name: PaY Nonprofit Map
nodes:
  # Kept for the comment test.
  year:
    kind: user_input
    description: current year
`;

  it("rewrites the version and leaves the comments alone", () => {
    const patched = setVersion(source, "v0.1.0-hotfix");
    expect(patched).toContain("version: v0.1.0-hotfix");
    expect(patched).toContain("# The pipeline the map is built from.");
    expect(patched).toContain("# Kept for the comment test.");
    expect(patched).toContain("pipeline_name: PaY Nonprofit Map");
  });
});

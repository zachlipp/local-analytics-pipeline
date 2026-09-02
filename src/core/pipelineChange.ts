import { parseDocument } from "yaml";

import type { Dag } from "@core/schema";
import { stableUuid } from "@core/utils";

// The one prerelease the schema admits, appended by the escape hatch below.
export const HOTFIX = "-hotfix";

/** What the store knows about the pipeline whose work it is holding. */
export type Identity = {
  pipeline_name: string;
  version: string;
  /** Of the source text, so an edit that never bumped the version is visible. */
  hash: string;
};

export function identify(dag: Dag, source: string): Identity {
  return {
    pipeline_name: dag.pipeline_name,
    version: dag.version,
    hash: stableUuid(source),
  };
}

/**
 * What uploading this pipeline does to the work already in the store.
 *
 * The store holds one pipeline at a time — a second one would be read into
 * memory on every load, and `NodeResult.file` holds a CSV's full text.
 * So every case here either keeps the work or says out loud that it won't.
 */
export type Change =
  /** Nothing stored. Load it. */
  | { kind: "fresh" }
  /** The same bytes as last time. Restore the work. */
  | { kind: "same" }
  /** The same pipeline at a new version. Carry the work. */
  | { kind: "update" }
  /** A different pipeline. Offer an export, then wipe. */
  | { kind: "replace" }
  /** The same version over different bytes, which is the engineer's mistake. */
  | { kind: "conflict"; hotfix?: string };

export function change(incoming: Identity, stored?: Identity): Change {
  if (!stored) return { kind: "fresh" };
  if (incoming.pipeline_name !== stored.pipeline_name) return { kind: "replace" };
  if (incoming.version !== stored.version) return { kind: "update" };
  if (incoming.hash === stored.hash) return { kind: "same" };
  return { kind: "conflict", hotfix: hotfix(incoming.version) };
}

// Nothing is offered for a version already hotfixed: it would land back on the
// version it started from, and the next upload would conflict all over again.
export function hotfix(version: string): string | undefined {
  return version.endsWith(HOTFIX) ? undefined : `${version}${HOTFIX}`;
}

/** Rewrites the version in place, so work exported from a hotfix says so. */
export function setVersion(source: string, version: string): string {
  const doc = parseDocument(source);
  doc.set("version", version);
  return String(doc);
}

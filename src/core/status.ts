import type { LiteralRecord } from "./dataLiteral";
import type { Pipeline, PipelineStep } from "./pipeline";

export type Status =
  | "SUCCEEDED"
  | "INVALID"
  | "NEEDS_INPUT"
  | "UNREACHED"
  | "ERROR";

/**
 * What has actually happened to one node, keyed by node id in the run store.
 *
 * Deliberately a bag of optional fields rather than a union: an upload that
 * fails leaves the previous file in place while it records the error, and a
 * re-run needs to clear the error without forgetting the value.
 */
export type NodeResult = {
  /** An upload or request is in flight. */
  running?: boolean;
  /** How the last attempt failed. */
  error?: string;
  /** Why the value it holds isn't usable, once anything checks. */
  invalid?: string;
  /** A file the user handed over. */
  file?: { name: string; text: string };
  /** Text the user typed, or a request's response. */
  value?: string;
  // Committed data_entry marks, keyed by record. One row at a time.
  entries?: Record<string, string[]>;
  // Edited data_literal rows, replacing node.data wholesale once the user has
  // touched any record. Absent means the node's own rows are still in force.
  literal?: LiteralRecord[];
  /** The DuckDB table the runner materialized this node into. */
  table?: string;
  /** Rows in that table. */
  rows?: number;
  /** Columns the file had that its schema never named, dropped at load. */
  dropped?: string[];
};

/**
 * The status of every node, keyed by name.
 *
 * NEEDS_INPUT is the run's frontier: everything upstream is satisfied, so this
 * node is waiting on the user right now. UNREACHED is strictly "blocked —
 * something upstream isn't done", which is what makes hiding it useful: what's
 * left is the work you can actually do plus the work already finished.
 *
 * A node with an upload or request in flight stays NEEDS_INPUT until it lands.
 * There's no status for work in progress and it doesn't need one — the control
 * doing the work shows its own spinner.
 */
export function nodeStatuses(
  pipeline: Pipeline,
  results: Record<string, NodeResult>,
): Map<string, Status> {
  const statuses = new Map<string, Status>();

  // pipeline.steps is topological, so every input has a status by the time the
  // node that depends on it is reached.
  for (const step of pipeline.steps) {
    statuses.set(step.name, statusOf(step, results[step.node.id], statuses));
  }

  return statuses;
}

function statusOf(
  step: PipelineStep,
  result: NodeResult | undefined,
  statuses: Map<string, Status>,
): Status {
  // A node pointing at something that doesn't exist can never run, no matter
  // what the user does, so this outranks everything below it.
  if (step.missingInputs.length > 0) return "INVALID";

  if (result?.running) return "NEEDS_INPUT";
  if (result?.error) return "ERROR";
  if (result?.invalid) return "INVALID";
  // A table means the runner produced it, which is the only way an
  // operation_result ever succeeds.
  if (result?.file || result?.value || result?.table) return "SUCCEEDED";

  // A literal's rows are written in the pipeline definition, or edited in the
  // run — either way there is nothing to wait for and no way for it to fail.
  if (step.node.kind === "data_literal") return "SUCCEEDED";

  const ready = step.inputs.every((i) => statuses.get(i) === "SUCCEEDED");
  return ready ? "NEEDS_INPUT" : "UNREACHED";
}

// A pipeline with no nodes has nothing to finish, so it is never complete.
export function pipelineComplete(statuses: Map<string, Status>): boolean {
  if (statuses.size === 0) return false;
  return [...statuses.values()].every((s) => s === "SUCCEEDED");
}

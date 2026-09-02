import type { LiteralRecord } from "./dataLiteral";
import type { Pipeline, PipelineNode, PipelineStep } from "./pipeline";

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
 * nothing you do to this node now moves the run", which is what makes hiding
 * it useful: what's left is the work you can actually do plus the work already
 * finished. That covers an input nobody is waiting on yet as well as an
 * operation whose inputs aren't in.
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

  demoteUnneeded(pipeline, results, statuses);
  return statuses;
}

/**
 * Pull back the inputs no operation is waiting on yet.
 *
 * A file or literal has nothing upstream, so the forward pass always calls it
 * ready — but "ready" is a lie when the only operation consuming it is itself
 * blocked several hops back. Uploading it changes nothing today, so it belongs
 * with the rest of the work that isn't available yet.
 *
 * The walk runs backwards over the topological order, so a node demoted here
 * is already demoted by the time the nodes feeding it are considered.
 */
function demoteUnneeded(
  pipeline: Pipeline,
  results: Record<string, NodeResult>,
  statuses: Map<string, Status>,
): void {
  for (let i = pipeline.steps.length - 1; i >= 0; i--) {
    const step = pipeline.steps[i];

    // An operation's own output is already judged by its inputs, and a node no
    // operation consumes has no one to be unneeded by.
    if (step.operation || step.outputs.length === 0) continue;
    // Whatever the user has already put in stands; only untouched nodes move.
    if (touched(results[step.node.id])) continue;

    const status = statuses.get(step.name);
    if (status !== "NEEDS_INPUT" && status !== "SUCCEEDED") continue;

    const needed = step.outputs.some((name) =>
      awaiting(pipeline.nodes.get(name)!, statuses),
    );
    if (!needed) statuses.set(step.name, "UNREACHED");
  }
}

// Whether the only thing standing between this node and running is input the
// user can hand over right now. An UNREACHED input means it is not.
function awaiting(node: PipelineNode, statuses: Map<string, Status>): boolean {
  return node.inputs.every((input) => {
    const status = statuses.get(input);
    return status === "SUCCEEDED" || status === "NEEDS_INPUT";
  });
}

// Anything recorded against the node counts, errors included: the user has
// engaged with it, so hiding it out from under them would be a surprise.
function touched(result: NodeResult | undefined): boolean {
  if (!result) return false;
  return Object.values(result).some((v) => v !== undefined);
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

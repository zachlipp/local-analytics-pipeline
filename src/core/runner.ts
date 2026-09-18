import { toCsv, type CsvRow } from "./csv";
import type { Pipeline, PipelineStep } from "./pipeline";
import type { Dag, DataLiteralNode, Node } from "./schema";

/**
 * One node's table, and the operation that fills it if an operation does.
 *
 * Every node in the graph becomes a table — a file's CSV, a literal's rows, a
 * typed value, an operation's result — because that is the only way one
 * operation's SQL can name another's output.
 */
export type RunTask = {
  /** The node's name, which is also its table name. */
  name: string;
  node: Node;
  /** The operation producing it, when one does. */
  operation?: { name: string; query: string };
};

/**
 * What has to happen, in the order it has to happen in.
 *
 * `pipeline.steps` is already topological, so the plan is that order filtered
 * to what the target actually needs. With no target it's the whole graph.
 */
export function planRun(
  pipeline: Pipeline,
  dag: Dag,
  target?: string,
): RunTask[] {
  const needed = target ? withChecks(pipeline, target) : undefined;
  const checks = pipeline.steps.filter(
    (step) =>
      isCheck(step.node) &&
      step.name !== target &&
      (!needed || needed.has(step.name)),
  );
  const steps = pipeline.steps.filter(
    (step) => (!needed || needed.has(step.name)) && !checks.includes(step),
  );

  return checksEarly(steps, checks).map((step) => {
      const operation = step.operation
        ? dag.operations[step.operation]
        : undefined;
      return {
        name: step.name,
        node: step.node,
        operation:
          step.operation && operation
            ? { name: step.operation, query: operation.query }
            : undefined,
      };
    });
}

// Checks feed nothing, so no target needs them; any check reading a built table joins the run, with its own ancestors.
function withChecks(pipeline: Pipeline, target: string): Set<string> {
  const needed = ancestors(pipeline, target);
  for (let grew = true; grew; ) {
    grew = false;
    for (const step of pipeline.steps) {
      if (needed.has(step.name) || !isCheck(step.node)) continue;
      if (!step.inputs.some((input) => needed.has(input))) continue;
      ancestors(pipeline, step.name).forEach((name) => needed.add(name));
      grew = true;
    }
  }
  return needed;
}

export function isCheck(node: Node): boolean {
  return node.kind === "circuit_breaker";
}

// Each check goes right after its last input, so a failure stops the run before anything downstream is built.
function checksEarly(
  steps: PipelineStep[],
  checks: PipelineStep[],
): PipelineStep[] {
  const order: PipelineStep[] = [];
  const built = new Set<string>();
  let waiting = checks;

  const add = (step: PipelineStep) => {
    order.push(step);
    built.add(step.name);
    const ready = waiting.filter((check) =>
      check.inputs.every((input) => built.has(input)),
    );
    waiting = waiting.filter((check) => !ready.includes(check));
    ready.forEach(add);
  };

  steps.forEach(add);
  waiting.forEach(add);
  return order;
}

/** A node and everything upstream of it, by name. */
export function ancestors(pipeline: Pipeline, target: string): Set<string> {
  const seen = new Set<string>();
  const stack = [target];

  while (stack.length > 0) {
    const name = stack.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    stack.push(...(pipeline.nodes.get(name)?.inputs ?? []));
  }

  return seen;
}

/**
 * A literal's rows as CSV.
 *
 * A bare string has no column name of its own, so the node's `column` supplies
 * one. Keyed rows may not all carry the same fields — `known_incorrect_eins`
 * annotates only some of its entries — so the header is the union of the keys
 * in declaration order, and a row missing one gets an empty cell.
 */
export function literalCsv(node: DataLiteralNode): string {
  return toCsv(literalColumns(node), literalRows(node));
}

// The header a literal produces: its keys unioned, in declaration order.
export function literalColumns(node: DataLiteralNode): string[] {
  const columns: string[] = [];
  for (const row of literalRows(node)) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  return columns.length > 0 ? columns : [node.column];
}

function literalRows(node: DataLiteralNode): CsvRow[] {
  return node.data.map((row) =>
    typeof row === "string" ? { [node.column]: row } : row,
  );
}

import { toCsv, type CsvRow } from "./csv";
import type { Pipeline } from "./pipeline";
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
  const needed = target ? ancestors(pipeline, target) : undefined;

  return pipeline.steps
    .filter((step) => !needed || needed.has(step.name))
    .map((step) => {
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
  const rows: CsvRow[] = node.data.map((row) =>
    typeof row === "string" ? { [node.column]: row } : row,
  );

  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }

  return toCsv(columns.length > 0 ? columns : [node.column], rows);
}

import type { Node } from "./schema";

// The schema fills this in, so it is only ever missing on a node parsed by an
// older version of the schema module and still held in state across an HMR
// swap. That happens constantly while editing, and it should not stop a run.
export function requiredColumns(node: Node): string[] {
  return node.constraints?.required_columns ?? [];
}

/**
 * What's wrong with this table's columns, phrased for whoever has to fix it.
 *
 * Undefined when nothing is wrong. Takes the column names rather than reading
 * them itself so the check stays free of the database and of any row scan.
 */
export function checkRequiredColumns(
  name: string,
  node: Node,
  columns: string[],
): string | undefined {
  const required = requiredColumns(node);
  if (required.length === 0) return undefined;

  const present = new Set(columns);
  const missing = required.filter((column) => !present.has(column));
  if (missing.length === 0) return undefined;

  const needs =
    missing.length === 1
      ? `needs a column called ${quoted(missing[0])}`
      : `needs these columns: ${list(missing)}`;
  const has =
    columns.length > 0
      ? `The columns it has are ${list(columns)}.`
      : `It has no columns at all.`;

  return `${quoted(name)} ${needs}. ${has}`;
}

function quoted(value: string): string {
  return `“${value}”`;
}

// Oxford comma: these get read out loud to people who did not ask for SQL.
function list(values: string[]): string {
  const quotedValues = values.map(quoted);
  if (quotedValues.length <= 2) return quotedValues.join(" and ");
  const last = quotedValues[quotedValues.length - 1];
  return `${quotedValues.slice(0, -1).join(", ")}, and ${last}`;
}

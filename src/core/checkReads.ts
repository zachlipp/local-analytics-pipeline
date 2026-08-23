import type { Dag } from "./schema";
import type { Columns } from "./shapes";

export type ReadProblem = {
  node: string;
  // The node whose table the script is handed.
  input: string;
  missing: string[];
  // What that table actually has, for a message that can suggest the fix.
  available: string[];
};

// Every script node naming an input column its input table does not have.
//
// The list is written by hand beside a script that extracts the same names, so
// this is what catches the two drifting apart — a column renamed upstream is a
// validate failure rather than an `undefined` at run time.
export function checkReads(
  dag: Dag,
  built: Map<string, Columns>,
): ReadProblem[] {
  const problems: ReadProblem[] = [];

  for (const [node, fields] of Object.entries(dag.nodes)) {
    if (fields.kind !== "script" || fields.reads.length === 0) continue;

    // A table that never got built means something upstream is already wrong,
    // and reporting it here would only say the same thing twice.
    const columns = built.get(fields.input);
    if (!columns) continue;

    const missing = fields.reads.filter((column) => !(column in columns));
    if (missing.length === 0) continue;

    problems.push({
      node,
      input: fields.input,
      missing,
      available: Object.keys(columns),
    });
  }

  return problems;
}

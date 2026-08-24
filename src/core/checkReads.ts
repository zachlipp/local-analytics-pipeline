import { linkColumns } from "./dataEntry";
import type { Dag } from "./schema";
import type { Columns } from "./shapes";

export type ReadProblem = {
  node: string;
  // The node whose table the columns are read from.
  input: string;
  // The field that named them, which is where the fix goes.
  field: "reads" | "key" | "frozen" | "links";
  missing: string[];
  // What that table actually has, for a message that can suggest the fix.
  available: string[];
};

// Every node naming an input column its input table does not have.
//
// Every name checked here is written by hand — beside a script that extracts
// the same names, in an entry grid's key and pinned columns, inside an href
// template — so this is what catches one drifting from the table it reads.
// A column renamed upstream is a validate failure rather than a blank cell.
export function checkReads(
  dag: Dag,
  built: Map<string, Columns>,
): ReadProblem[] {
  const problems: ReadProblem[] = [];

  // One problem per field rather than per node: a grid can get its key right
  // and its pinned columns wrong, and the two are fixed in different places.
  for (const [node, fields] of Object.entries(dag.nodes)) {
    for (const wanted of columnsWanted(fields)) {
      if (wanted.columns.length === 0) continue;

      // A table that never got built means something upstream is already
      // wrong, and reporting it here would only say the same thing twice.
      const columns = built.get(wanted.input);
      if (!columns) continue;

      const missing = wanted.columns.filter((column) => !(column in columns));
      if (missing.length === 0) continue;

      problems.push({
        node,
        input: wanted.input,
        field: wanted.field,
        missing,
        available: Object.keys(columns),
      });
    }
  }

  return problems;
}

type Wanted = { input: string; field: ReadProblem["field"]; columns: string[] };

function columnsWanted(node: Dag["nodes"][string]): Wanted[] {
  switch (node.kind) {
    // A script's options are input columns too, named as a set instead of one
    // at a time, so they are checked the same way.
    case "script":
      return [
        {
          input: node.input,
          field: "reads",
          columns: [...node.reads, ...node.options],
        },
      ];

    // frozen is read raw, not through frozenColumns(): its default is the key,
    // which the group above already covers.
    case "data_entry":
      return [
        { input: node.input, field: "key", columns: [node.key] },
        {
          input: node.input,
          field: "frozen",
          columns: node.frozen.filter((column) => column !== node.key),
        },
        { input: node.input, field: "links", columns: linkColumns(node) },
      ];

    default:
      return [];
  }
}

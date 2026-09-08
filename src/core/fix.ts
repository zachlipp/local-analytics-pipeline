import type { LiteralRecord } from "./dataLiteral";
import type {
  Dag,
  DataEntryNode,
  DataLiteralNode,
  FixTarget,
  Node,
} from "./schema";
import type { Columns } from "./shapes";

/**
 * Where a node says to go when its rows break a constraint.
 *
 * The message a check produces can only ever say "fix this at the source",
 * because a table three joins in does not know which spreadsheet made it. This
 * is the author saying it instead — they wrote the query, so they know that a
 * duplicated `ein` means two spellings of one name and that the fix is a row in
 * the standardization table.
 */
export function fixOf(node: Node): FixTarget | undefined {
  return "fix" in node ? node.fix : undefined;
}

/** The kinds a person can correct without leaving the page. */
export type EditableNode = DataLiteralNode | DataEntryNode;

export type Fix = {
  name: string;
  node: EditableNode;
  // Fix-node column to the column of the offending row it is filled from.
  keys: Record<string, string>;
};

// The fix a slide can offer inline, as opposed to one it can only name.
export function editableFix(dag: Dag, node: Node): Fix | undefined {
  const fix = fixOf(node);
  if (!fix) return undefined;

  const target = dag.nodes[fix.node];
  if (!target) return undefined;
  if (target.kind !== "data_literal" && target.kind !== "data_entry") {
    return undefined;
  }
  return { name: fix.node, node: target, keys: fix.keys };
}

/**
 * The record that would correct one offending row, as far as the mapping goes.
 *
 * Only the mapped columns are filled; the rest is the author's judgement, which
 * is the part a machine has no business guessing. `columns` is the fix node's
 * own shape, so a mapping naming a column it does not have adds nothing — that
 * is a validate failure, not something to write into the row.
 */
export function fixRecord(
  keys: Record<string, string>,
  offender: Record<string, string | null>,
  columns: string[],
): LiteralRecord {
  const record: LiteralRecord = {};
  for (const [into, from] of Object.entries(keys)) {
    if (columns.includes(into)) record[into] = offender[from] ?? "";
  }
  return record;
}

// Whether a record already says what a filled one would. Clicking the same
// offender twice should find the row it made the first time, not stack another.
export function sameFields(record: LiteralRecord, filled: LiteralRecord): boolean {
  return Object.entries(filled).every(([column, value]) => record[column] === value);
}

export type FixProblemKind =
  | "unknown_node"
  | "not_editable"
  | "missing_target"
  | "missing_source";

export type FixProblem = {
  node: string;
  kind: FixProblemKind;
  names: string[];
  message: string;
};

/**
 * Everything wrong with a `fix:` block.
 *
 * Worth failing the build over, all of it: the field exists to be followed at
 * the moment something has already gone wrong, and a dangling name or a stale
 * mapping is discovered exactly when nobody has patience for it.
 */
export function checkFix(dag: Dag, built: Map<string, Columns>): FixProblem[] {
  const problems: FixProblem[] = [];

  for (const [name, node] of Object.entries(dag.nodes)) {
    const fix = fixOf(node);
    if (!fix) continue;

    const target = dag.nodes[fix.node];
    if (!target) {
      problems.push({
        node: name,
        kind: "unknown_node",
        names: [fix.node],
        message: `Its \`fix:\` names “${fix.node}”, which no node in this pipeline defines. Point it at a node that exists, or take the field out.`,
      });
      continue;
    }

    const keys: [string, string][] = Object.entries(fix.keys);
    if (keys.length === 0) continue;

    // A data_entry's rows come from its input table, one per record already
    // there, so there is no row for a mapping to start.
    if (target.kind !== "data_literal") {
      problems.push({
        node: name,
        kind: "not_editable",
        names: [fix.node],
        message: `Its \`fix:\` maps columns into “${fix.node}”, which is a ${target.kind}. Only a data_literal has rows that can be added, so drop \`keys:\` or point the fix at one.`,
      });
      continue;
    }

    // A table that never got built means something upstream is already wrong,
    // and reporting it here would only say the same thing twice.
    problems.push(
      ...absent(name, fix, "missing_target", built.get(fix.node), keys.map(([into]) => into)),
      ...absent(name, fix, "missing_source", built.get(name), keys.map(([, from]) => from)),
    );
  }

  return problems;
}

const WHERE: Record<"missing_target" | "missing_source", string> = {
  missing_target: "on the left of `keys:`, and has to be a column of",
  missing_source: "on the right of `keys:`, and has to be a column of",
};

function absent(
  node: string,
  fix: FixTarget,
  kind: "missing_target" | "missing_source",
  columns: Columns | undefined,
  wanted: string[],
): FixProblem[] {
  if (!columns) return [];

  const missing = wanted.filter((column) => !(column in columns));
  if (missing.length === 0) return [];

  const table = kind === "missing_target" ? fix.node : node;
  return [
    {
      node,
      kind,
      names: missing,
      message: `${missing.join(", ")} is ${WHERE[kind]} \`${table}\`, which has: ${Object.keys(columns).join(", ")}.`,
    },
  ];
}

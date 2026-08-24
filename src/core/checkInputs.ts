import { list, quoted } from "./utils";
import {
  SqlParseError,
  tableReferences,
  UnknownSqlNode,
  type TableReference,
} from "./references";
import type { Dag, Operation } from "./schema";

export type ProblemKind =
  | "undeclared"
  | "unknown_node"
  | "not_a_table"
  | "unused"
  | "qualified"
  | "self_reference"
  | "unparsable"
  | "walker";

export type InputProblem = {
  operation: string;
  kind: ProblemKind;
  // The table or input names this is about, for a caller that wants to phrase
  // its own summary rather than print the sentence below.
  names: string[];
  message: string;
};

// Injected rather than imported so this stays free of any engine. Give it
// something that runs `SELECT json_serialize_sql(...)` and JSON.parses the result.
export type ParseSql = (sql: string) => Promise<unknown>;

// Every operation whose declared inputs and actual query disagree.
export async function checkInputs(
  dag: Dag,
  parse: ParseSql,
): Promise<InputProblem[]> {
  const problems: InputProblem[] = [];

  for (const [name, operation] of Object.entries(dag.operations)) {
    // An engine may hand back DuckDB's error envelope or throw its own; both
    // mean the same thing here, and neither is this checker's to diagnose.
    let ast: unknown;
    try {
      ast = await parse(operation.query);
    } catch (cause) {
      problems.push(unparsable(name, cause));
      continue;
    }

    let references: TableReference[];
    try {
      references = tableReferences(ast);
    } catch (cause) {
      problems.push(parseFailure(name, cause));
      continue;
    }

    problems.push(...compareInputs(name, operation, dag, references));
  }

  return problems;
}

// The comparison on its own, for whoever already has the references in hand.
export function compareInputs(
  name: string,
  operation: Operation,
  dag: Dag,
  references: TableReference[],
): InputProblem[] {
  const problems: InputProblem[] = [];
  const declared = new Set(operation.inputs);
  const referenced = new Set<string>();

  for (const reference of references) {
    if (reference.qualifier) {
      problems.push({
        operation: name,
        kind: "qualified",
        names: [`${reference.qualifier}.${reference.name}`],
        message: `${quoted(name)} queries ${quoted(`${reference.qualifier}.${reference.name}`)}. Node names carry no schema — write ${quoted(reference.name)} on its own.`,
      });
      continue;
    }
    referenced.add(reference.name);
  }

  if (referenced.has(operation.output)) {
    problems.push({
      operation: name,
      kind: "self_reference",
      names: [operation.output],
      message: `${quoted(name)} produces ${quoted(operation.output)} and also reads it. Nothing can build that.`,
    });
  }

  // B: the query reads something it never declared.
  for (const table of referenced) {
    if (declared.has(table) || table === operation.output) continue;
    problems.push(
      table in dag.nodes
        ? {
            operation: name,
            kind: "undeclared",
            names: [table],
            message: `${quoted(name)} reads ${quoted(table)}, which it does not list as an input. Add it to that operation's inputs.`,
          }
        : {
            operation: name,
            kind: "unknown_node",
            names: [table],
            message: `${quoted(name)} reads ${quoted(table)}, which is not a node in this pipeline.`,
          },
    );
  }

  // D: the query reads a script that hands back a document rather than rows.
  for (const table of referenced) {
    const node = dag.nodes[table];
    if (node?.kind !== "script" || node.schema) continue;
    problems.push({
      operation: name,
      kind: "not_a_table",
      names: [table],
      message: `${quoted(name)} reads ${quoted(table)}, a script that returns a document. Give that script a \`schema:\` if its rows are meant to be queryable.`,
    });
  }

  // C: an input was declared and the query never touches it.
  const unused = operation.inputs.filter((input) => !referenced.has(input));
  if (unused.length > 0) {
    const subject =
      unused.length === 1
        ? `lists ${quoted(unused[0])} as an input, but its query never reads it`
        : `lists these inputs its query never reads: ${list(unused)}`;
    problems.push({
      operation: name,
      kind: "unused",
      names: unused,
      message: `${quoted(name)} ${subject}. Either use it or drop it.`,
    });
  }

  return problems;
}

function unparsable(name: string, cause: unknown): InputProblem {
  return {
    operation: name,
    kind: "unparsable",
    names: [],
    message: `${quoted(name)} is not valid SQL: ${cause instanceof Error ? cause.message : String(cause)}`,
  };
}

function parseFailure(name: string, cause: unknown): InputProblem {
  if (cause instanceof SqlParseError) return unparsable(name, cause);
  if (cause instanceof UnknownSqlNode) {
    return {
      operation: name,
      kind: "walker",
      names: [],
      message: `${quoted(name)} uses SQL this checker does not understand: ${cause.message} The query may be fine; the checker is the thing to fix.`,
    };
  }
  throw cause;
}

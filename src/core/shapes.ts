import { frozenColumns } from "./dataEntry";
import { statement, type Engine } from "./engine";
import type { Pipeline } from "./pipeline";
import { literalColumns } from "./runner";
import type { Dag, Node, Schemas } from "./schema";

export type Columns = Record<string, string>;

export type ShapeIssue = {
  // The node whose table could not be built.
  node: string;
  // The operation that was supposed to build it, if one was.
  operation?: string;
  message: string;
  // Upstream tables that never got built, when that's the reason.
  blockedBy?: string[];
};

export type ShapeReport = {
  // Every table that now exists, and what columns it has.
  built: Map<string, Columns>;
  // Things that are actually wrong.
  issues: ShapeIssue[];
  // Things that could not be checked because something else is wrong.
  blocked: ShapeIssue[];
};

// Every node's table, empty, with the columns it would really have. A source
// node declares its own shape; an operation's is whatever its query produces,
// so it gets bound with DESCRIBE. Steps are topological, so by the time an
// operation is bound every table it names is already standing.
export async function materializeShapes(
  engine: Engine,
  pipeline: Pipeline,
  dag: Dag,
): Promise<ShapeReport> {
  const built = new Map<string, Columns>();
  const issues: ShapeIssue[] = [];
  const blocked: ShapeIssue[] = [];
  const unavailable = new Set<string>();

  for (const step of pipeline.steps) {
    const { name, node } = step;
    const operationName = step.operation;

    if (step.missingInputs.length > 0) {
      issues.push({
        node: name,
        operation: operationName,
        message: `It names ${quoteList(step.missingInputs)}, which no node in this pipeline defines.`,
      });
    }

    if (operationName) {
      const missing = [
        ...step.inputs.filter((input) => unavailable.has(input)),
        ...step.missingInputs,
      ];
      const query = dag.operations[operationName]?.query ?? "";

      if (missing.length > 0) {
        unavailable.add(name);
        // Its tables aren't there to bind against, but the SQL can still be
        // read for syntax — otherwise one broken operation hides every typo
        // downstream of it until the first one is fixed.
        const syntax = await syntaxError(engine, query);
        if (syntax) {
          issues.push({ node: name, operation: operationName, message: syntax });
        } else {
          blocked.push({
            node: name,
            operation: operationName,
            message: `Skipped. It reads ${quoteList(missing)}, which could not be built.`,
            blockedBy: missing,
          });
        }
        continue;
      }

      try {
        const columns = await bind(engine, name, query);
        built.set(name, columns);
      } catch (cause) {
        unavailable.add(name);
        issues.push({
          node: name,
          operation: operationName,
          message: message(cause),
        });
      }
      continue;
    }

    try {
      const columns = nodeShape(node, dag.schemas);
      // A script that returns a document has no table to stand up.
      if (!columns) continue;
      await engine.createEmpty(name, columns);
      built.set(name, columns);
    } catch (cause) {
      unavailable.add(name);
      issues.push({ node: name, message: message(cause) });
    }
  }

  return { built, issues, blocked };
}

async function syntaxError(
  engine: Engine,
  query: string,
): Promise<string | undefined> {
  if (!statement(query)) return "This operation has no query at all.";
  try {
    await engine.parse(query);
    return undefined;
  } catch (cause) {
    return message(cause);
  }
}

async function bind(
  engine: Engine,
  name: string,
  query: string,
): Promise<Columns> {
  if (!statement(query)) {
    throw new Error(`This operation has no query, so ${name} can never be built.`);
  }
  const columns = await engine.describeQuery(query);
  await engine.createEmpty(name, columns);
  return columns;
}

// The types a node's CSV should be read with, or undefined when it never named
// a shape. A missing or unknown schema is the shape pass's complaint to make,
// so this stays quiet and lets DuckDB sniff as before.
export function declaredTypes(
  node: Node,
  schemas: Schemas,
): Columns | undefined {
  switch (node.kind) {
    case "file":
    case "script":
      return node.schema ? schemas[node.schema] : undefined;
    case "operation_result":
      return undefined;
    default:
      return nodeShape(node, schemas);
  }
}

// The columns a node declares for itself, or undefined when it has no table at
// all. Throws for operation_result: asking a node to declare what its own
// operation decides is how the two drift.
export function nodeShape(
  node: Node,
  schemas: Schemas,
): Columns | undefined {
  switch (node.kind) {
    case "data_literal":
      return allText(literalColumns(node));

    // A single cell, so an operation can join or compare against it the same
    // way it does anything else.
    case "user_input":
      return { value: "VARCHAR" };

    // Mirrors entriesToCsv: the key leads, then the frozen columns that aren't
    // the key again, then one column per option.
    case "data_entry": {
      const extra = frozenColumns(node).filter((column) => column !== node.key);
      return allText([node.key, ...extra, ...node.options]);
    }

    case "file":
      return declaredShape(node.kind, node.schema, schemas);

    // No schema means it returns a document, which has no columns.
    case "script":
      return node.schema
        ? declaredShape(node.kind, node.schema, schemas)
        : undefined;

    case "operation_result":
      throw new Error("No operation produces this node.");
  }
}

function declaredShape(
  kind: string,
  name: string | undefined,
  schemas: Schemas,
): Columns {
  // First line is the summary the report shows; the rest is what to change.
  if (!name) {
    throw new Error(
      `No schema\nAdd \`schema: <name>\` to this ${kind}, then define that name under top-level \`schemas:\`.`,
    );
  }

  const declared = schemas[name];
  if (!declared) {
    throw new Error(
      `Schema “${name}” undefined\nDefine “${name}” under top-level \`schemas:\`, or point this ${kind} at one that exists.`,
    );
  }
  if (Object.keys(declared).length === 0) {
    throw new Error(
      `Schema “${name}” has no columns\nAdd columns to “${name}” under top-level \`schemas:\`.`,
    );
  }

  return { ...declared };
}

function allText(columns: string[]): Columns {
  return Object.fromEntries(columns.map((column) => [column, "VARCHAR"]));
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function quoteList(names: string[]): string {
  const quoted = names.map((name) => `“${name}”`);
  if (quoted.length <= 2) return quoted.join(" and ");
  return `${quoted.slice(0, -1).join(", ")}, and ${quoted[quoted.length - 1]}`;
}

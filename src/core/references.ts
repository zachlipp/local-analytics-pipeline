// Table names a query reads, recovered from DuckDB's json_serialize_sql output.

export type TableReference = {
  name: string;
  // Set only when the reference was catalog- or schema-qualified. Node names never are.
  qualifier?: string;
};

// DuckDB could not parse the SQL at all.
export class SqlParseError extends Error {}

// The walker met a construct it does not know. Always thrown, never swallowed:
// silently skipping an unrecognized node would under-report references, which
// turns a real undeclared input into a phantom unused one.
export class UnknownSqlNode extends Error {}

// Every node type that can appear in a FROM clause, verified against DuckDB 1.5.
const TABLE_REF_TYPES = new Set([
  "BASE_TABLE",
  "JOIN",
  "SUBQUERY",
  "TABLE_FUNCTION",
  "EXPRESSION_LIST",
  "PIVOT",
  "SHOW_REF",
  "EMPTY",
]);

const QUERY_NODE_TYPES = new Set([
  "SELECT_NODE",
  "SET_OPERATION_NODE",
  "RECURSIVE_CTE_NODE",
  "CTE_NODE",
]);

export function tableReferences(ast: unknown): TableReference[] {
  const root = asRecord(ast);
  if (!root) throw new UnknownSqlNode("Serialized SQL was not an object.");

  if (root.error === true) {
    throw new SqlParseError(
      typeof root.error_message === "string"
        ? root.error_message
        : "DuckDB could not parse this query.",
    );
  }

  const statements = root.statements;
  if (!Array.isArray(statements)) {
    throw new UnknownSqlNode("Serialized SQL had no statements.");
  }

  const found = new Map<string, TableReference>();
  for (const statement of statements) {
    visitQuery(asRecord(statement)?.node, new Set(), found);
  }
  return [...found.values()];
}

function visitQuery(
  value: unknown,
  scope: Set<string>,
  found: Map<string, TableReference>,
) {
  const node = asRecord(value);
  const type = node?.type;
  if (!node || typeof type !== "string" || !QUERY_NODE_TYPES.has(type)) {
    throw new UnknownSqlNode(
      `Unrecognized query node “${String(type)}”. The walker needs updating for this DuckDB version.`,
    );
  }

  const ctes = cteEntries(node);
  const inner = new Set(scope);
  // Names go in before any body is walked, so a recursive CTE referring to
  // itself resolves to itself rather than looking like a missing node.
  for (const cte of ctes) inner.add(cte.name);
  for (const cte of ctes) visitQuery(cte.query, inner, found);

  for (const [key, child] of Object.entries(node)) {
    if (key === "cte_map") continue;
    scan(child, inner, found);
  }
}

function scan(
  value: unknown,
  scope: Set<string>,
  found: Map<string, TableReference>,
) {
  if (Array.isArray(value)) {
    for (const item of value) scan(item, scope, found);
    return;
  }

  const node = asRecord(value);
  if (!node) return;

  const type = node.type;

  // A nested query opens a new CTE scope, so it goes back through visitQuery.
  // Derived tables, scalar subqueries, IN/EXISTS and set operations all land here.
  if (typeof type === "string" && QUERY_NODE_TYPES.has(type)) {
    visitQuery(node, scope, found);
    return;
  }

  // Every FROM-clause node carries both of these, and nothing else does:
  // SELECT_NODE has `sample` but no `alias`, expressions have `alias` but no `sample`.
  if ("alias" in node && "sample" in node) {
    if (typeof type !== "string" || !TABLE_REF_TYPES.has(type)) {
      throw new UnknownSqlNode(
        `Unrecognized FROM-clause node “${String(type)}”. The walker needs updating for this DuckDB version.`,
      );
    }
    // Keyed on the type, not on the presence of `table_name`: SHOW_REF carries
    // one too, and `FROM (DESCRIBE t)` does not read a table called t.
    if (type === "BASE_TABLE") addBaseTable(node, scope, found);
  }

  for (const child of Object.values(node)) scan(child, scope, found);
}

function addBaseTable(
  node: Record<string, unknown>,
  scope: Set<string>,
  found: Map<string, TableReference>,
) {
  const name = node.table_name;
  if (typeof name !== "string" || name === "") return;
  // A CTE in scope shadows any node of the same name, so it is not a reference.
  if (scope.has(name)) return;

  const qualifier = [node.catalog_name, node.schema_name]
    .filter((part): part is string => typeof part === "string" && part !== "")
    .join(".");

  const key = qualifier ? `${qualifier}.${name}` : name;
  if (!found.has(key)) found.set(key, qualifier ? { name, qualifier } : { name });
}

function cteEntries(node: Record<string, unknown>) {
  const map = asRecord(node.cte_map)?.map;
  if (!Array.isArray(map)) return [];

  return map.flatMap((entry) => {
    const record = asRecord(entry);
    const name = record?.key;
    const query = asRecord(asRecord(record?.value)?.query)?.node;
    if (typeof name !== "string" || query === undefined) return [];
    return [{ name, query }];
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

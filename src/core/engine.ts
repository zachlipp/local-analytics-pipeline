export type Row = Record<string, string>;

// The one thing every part of this project needs from a database, and nothing
// more. duckdb-wasm in the browser, @duckdb/node-api on the command line.
export interface Engine {
  loadCsv(table: string, csv: string): Promise<number>;
  query(sql: string): Promise<Row[]>;
  columns(table: string): Promise<string[]>;
  createEmpty(table: string, columns: Record<string, string>): Promise<void>;
  describeQuery(sql: string): Promise<Record<string, string>>;
  parse(sql: string): Promise<unknown>;
  forget(table: string): void;
}

export type QueryFn = (sql: string) => Promise<Row[]>;

// Doubling an embedded quote is the one escape that matters inside an
// identifier, and node names come from a file nobody vetted.
export function quote(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

// Trailing semicolons and blank lines are fine in the YAML but not inside a
// CREATE TABLE AS or a DESCRIBE, so every path strips them in one place.
export function statement(sql: string): string {
  return sql.trim().replace(/;\s*$/, "");
}

const TYPE = /^[A-Za-z0-9_ ,()[\]"']+$/;

// An operation's output shape, without running it or holding a row in memory.
export async function describeQuery(
  query: QueryFn,
  sql: string,
): Promise<Record<string, string>> {
  const rows = await query(`DESCRIBE (${statement(sql)})`);
  const columns: Record<string, string> = {};
  for (const row of rows) columns[row.column_name] = row.column_type;
  return columns;
}

export async function createEmpty(
  query: QueryFn,
  table: string,
  columns: Record<string, string>,
): Promise<void> {
  const entries = Object.entries(columns);
  if (entries.length === 0) {
    throw new Error(`Cannot create ${table}: no columns.`);
  }

  const definitions = entries.map(([column, type]) => {
    if (!TYPE.test(type)) {
      throw new Error(`${table}.${column} has an unusable type: ${type}`);
    }
    return `${quote(column)} ${type}`;
  });

  await query(`CREATE OR REPLACE TABLE ${quote(table)} (${definitions.join(", ")})`);
}

// json_serialize_sql hands back an object with `error: true` rather than
// raising, so a parse failure has to be dug out of the payload.
export async function parseSql(
  query: QueryFn,
  sql: string,
): Promise<unknown> {
  const rows = await query(
    `SELECT json_serialize_sql(CAST(${literal(statement(sql))} AS VARCHAR)) AS serialized`,
  );
  const text = rows[0]?.serialized;
  if (!text) throw new Error("DuckDB returned nothing for json_serialize_sql.");

  const parsed = JSON.parse(text) as {
    error?: boolean;
    error_message?: string;
    error_type?: string;
    position?: string;
  };

  if (parsed.error) {
    const kind = parsed.error_type ?? "parse";
    const at = parsed.position ? ` (at character ${parsed.position})` : "";
    throw new Error(`${kind} error: ${parsed.error_message ?? "unknown"}${at}`);
  }

  return parsed;
}

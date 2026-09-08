import { quote, type Engine, type Row } from "./engine";
import { list, quoted } from "./utils";

/**
 * Uniqueness, declared beside the type it constrains.
 *
 * A schema column is a DuckDB type followed by whatever the author wants to
 * say about the values in it. `UNIQUE` is the one word read here, and DuckDB
 * never sees it: every table in this pipeline is built with CREATE TABLE AS,
 * which carries no constraints at all, so the rule has to be checked by hand
 * once the table stands.
 */
const UNIQUE = /(^|\s)UNIQUE(\s|$)/i;

// How many offending rows are kept. A column duplicated forty thousand times
// is not a table anyone reads; the count says how bad it is, these say how.
const LIMIT = 50;

export function isUnique(declared: string): boolean {
  return UNIQUE.test(declared);
}

// The type on its own, which is the only part DuckDB can be handed.
export function baseType(declared: string): string {
  return declared.replace(UNIQUE, "$1").trim();
}

// Every column a schema declares unique, in declaration order.
export function uniqueColumns(
  columns: Record<string, string> | undefined,
): string[] {
  return Object.entries(columns ?? {})
    .filter(([, declared]) => isUnique(declared))
    .map(([column]) => column);
}

// The same columns with the constraints taken back out, for read_csv and
// CREATE TABLE.
export function columnTypes(
  columns: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(columns).map(([column, declared]) => [
      column,
      baseType(declared),
    ]),
  );
}

/** Rows sharing a value in a column that was supposed to have none. */
export type Duplicates = {
  column: string;
  /** The offending rows, whole, up to the cap. */
  rows: Row[];
  /** How many there are in total, cap or no cap. */
  count: number;
  /** How many distinct values they are duplicates of. */
  values: number;
};

/**
 * What is wrong with this table's unique columns, or nothing.
 *
 * The rows that come back are not evidence for the error, they are the error:
 * a person fixing this needs to see which records collided, not a count. Only
 * the first column that fails is reported — the run stops on it either way,
 * and two tables of rows on one screen is not an instruction.
 */
export async function checkUnique(
  engine: Engine,
  table: string,
  columns: string[],
  limit = LIMIT,
): Promise<Duplicates | undefined> {
  if (columns.length === 0) return undefined;

  const present = new Set(await engine.columns(table));
  const missing = columns.filter((column) => !present.has(column));
  if (missing.length > 0) {
    throw new Error(
      `Its schema declares ${list(missing)} unique, but ${quoted(table)} has no such column.`,
    );
  }

  for (const column of columns) {
    const found = await duplicates(engine, table, column, limit);
    if (found) return found;
  }
  return undefined;
}

// Null is not a value, so rows missing one are not duplicates of each other.
// That is the rule SQL's own UNIQUE follows, and the rule an author who wrote
// the word is expecting.
async function duplicates(
  engine: Engine,
  table: string,
  column: string,
  limit: number,
): Promise<Duplicates | undefined> {
  const key = quote(column);
  const offending =
    `${quote(table)} WHERE ${key} IN ` +
    `(SELECT ${key} FROM ${quote(table)} WHERE ${key} IS NOT NULL ` +
    `GROUP BY ${key} HAVING count(*) > 1)`;

  const [totals] = await engine.query(
    `SELECT count(*) AS n, count(DISTINCT ${key}) AS v FROM ${offending}`,
  );
  const count = Number(totals?.n ?? 0);
  if (count === 0) return undefined;

  // Ordered by the duplicated column so the colliding rows sit together.
  const rows = await engine.query(
    `SELECT * FROM ${offending} ORDER BY ${key} LIMIT ${limit}`,
  );
  return { column, rows, count, values: Number(totals?.v ?? 0) };
}

// `where` is the node the author named in `fix_at:`. Without one the advice
// can only be the generic version, which is true and nearly useless.
export function duplicateMessage(
  table: string,
  found: Duplicates,
  where?: string,
): string {
  const values = found.values === 1 ? "value" : "values";
  const shown =
    found.rows.length < found.count
      ? ` The first ${found.rows.length} are below.`
      : "";
  const fix = where
    ? `Fix them in ${quoted(where)}, then run again.`
    : `Fix them where the data comes from, then run again.`;
  return (
    `${quoted(found.column)} has to be unique in ${quoted(table)}, ` +
    `but ${found.count} rows share ${found.values} ${values} of it.${shown} ${fix}`
  );
}

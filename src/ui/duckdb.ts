import {
  createEmpty,
  describeQuery,
  literal,
  parseSql,
  quote,
  readCsv,
  type Engine,
  type Row,
} from "@core/engine";
import * as duckdb from "@duckdb/duckdb-wasm";
import mvp_wasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import mvp_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import eh_wasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import eh_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: mvp_wasm, mainWorker: mvp_worker },
  eh: { mainModule: eh_wasm, mainWorker: eh_worker },
};

/**
 * One database for the whole session.
 *
 * example-query.ts spins up a fresh instance per call, which is fine for one
 * shot but wrong here: every node loading its own DuckDB would mean tables
 * that can't see each other, and the operations downstream have to join them.
 * Instantiating is also seconds of wasm work, so it happens once, lazily —
 * nothing pays for it until a node actually loads data.
 */
let instance: Promise<duckdb.AsyncDuckDB> | undefined;

function database(): Promise<duckdb.AsyncDuckDB> {
  instance ??= (async () => {
    const bundle = await duckdb.selectBundle(BUNDLES);
    const worker = new Worker(bundle.mainWorker!, { type: "module" });
    const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    return db;
  })();
  return instance;
}

// What each table was last built from. Lives with the database so both are
// thrown away together. The text is already retained by the run store, so
// holding it here is a reference, not a copy.
const loaded = new Map<string, { csv: string; types: string; rows: number }>();

/**
 * Register CSV text as a table.
 *
 * Text rather than a URL: DuckDB's own httpfs would hit the same CORS wall the
 * fetch does, and we already have the bytes by the time we get here. Returns
 * the row count, which is the cheapest proof the parse actually worked.
 */
export async function loadCsv(
  table: string,
  csv: string,
  types?: Record<string, string>,
): Promise<number> {
  const shape = JSON.stringify(types ?? {});
  const cached = loaded.get(table);
  // Confirming the table is still there keeps a stale entry from handing back
  // a row count for something that has since been dropped.
  if (cached?.csv === csv && cached.types === shape && (await hasTable(table)))
    return cached.rows;

  const db = await database();

  // Buffer name is namespaced by table so two nodes can't clobber each other's
  // registration. Re-registering the same name replaces it, which is what a
  // refresh should do.
  const file = `${table}.csv`;
  await db.registerFileText(file, csv);

  const conn = await db.connect();
  try {
    await conn.query(
      `CREATE OR REPLACE TABLE ${quote(table)} AS
         SELECT * FROM ${readCsv(literal(file), types)}`,
    );
    const result = await conn.query(
      `SELECT count(*) AS n FROM ${quote(table)}`,
    );
    // Arrow hands back a BigInt for count(*).
    const rows = Number(result.toArray()[0]?.toJSON().n ?? 0);
    loaded.set(table, { csv, types: shape, rows });
    return rows;
  } finally {
    await conn.close();
  }
}

// Arrow hands back BigInt, Date and friends; callers here only ever display
// the values, so they come out as strings.
export async function queryRows(sql: string): Promise<Row[]> {
  const db = await database();
  const conn = await db.connect();
  try {
    const result = await conn.query(sql);
    return result.toArray().map((r) => {
      const row: Row = {};
      for (const [k, v] of Object.entries(r.toJSON())) {
        row[k] = v === null || v === undefined ? "" : String(v);
      }
      return row;
    });
  } finally {
    await conn.close();
  }
}

async function hasTable(table: string): Promise<boolean> {
  const rows = await queryRows(
    `SELECT count(*) AS n FROM duckdb_tables() WHERE table_name = '${table.replace(/'/g, "''")}'`,
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

// DESCRIBE is a catalog lookup, so this costs nothing on a big table.
export async function tableColumns(table: string): Promise<string[]> {
  const rows = await queryRows(`DESCRIBE ${quote(table)}`);
  return rows.map((row) => row.column_name);
}

/** Forget a table's cached source, for whoever overwrites it by other means. */
export function forgetTable(table: string) {
  loaded.delete(table);
}

export type { Row };

export { quote };

// The port, for anything that shouldn't care whether it's talking to wasm.
// The functions above keep their own caching, so this only adapts names.
export const wasmEngine: Engine = {
  loadCsv,
  query: queryRows,
  columns: tableColumns,
  createEmpty: (table, columns) => createEmpty(queryRows, table, columns),
  describeQuery: (sql) => describeQuery(queryRows, sql),
  parse: (sql) => parseSql(queryRows, sql),
  forget: forgetTable,
};

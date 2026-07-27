import * as duckdb from "@duckdb/duckdb-wasm";
import mvp_wasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import mvp_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import eh_wasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import eh_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: mvp_wasm, mainWorker: mvp_worker },
  eh: { mainModule: eh_wasm, mainWorker: eh_worker },
};

export async function countRows(file: File): Promise<number | undefined> {
  const bundle = await duckdb.selectBundle(BUNDLES);
  const worker = new Worker(bundle.mainWorker!, { type: "module" });
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

  const text = await file.text();
  await db.registerFileText("input.csv", text);
  const conn = await db.connect();
  await conn.query(
    `CREATE TABLE t AS SELECT * FROM read_csv_auto('input.csv', header=true)`,
  );
  const result = await conn.query("SELECT count(*) AS n FROM t");
  const rows = result.toArray().map((r) => r.toJSON());
  await conn.close();
  return Number(rows[0]?.n);
}

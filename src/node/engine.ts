import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import {
  createEmpty,
  readCsv,
  describeQuery,
  literal,
  parseSql,
  quote,
  type Engine,
  type Row,
} from "@core/engine";

export type NodeEngine = Engine & { close: () => void };

// One in-memory database per engine. Nothing here is meant to outlive the
// process, and a file would only invite stale tables between runs.
export async function nodeEngine(): Promise<NodeEngine> {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  const scratch = mkdtempSync(join(tmpdir(), "lap-"));

  const query = async (sql: string): Promise<Row[]> => {
    const reader = await connection.runAndReadAll(sql);
    return reader.getRowObjects().map(toRow);
  };

  return {
    query,
    describeQuery: (sql) => describeQuery(query, sql),
    createEmpty: (table, columns) => createEmpty(query, table, columns),
    parse: (sql) => parseSql(query, sql),

    // Nothing is cached here, so there is nothing to forget. The browser
    // engine keeps a content cache and this is the same method on the port.
    forget: () => {},

    // read_csv wants a path and node-api has no in-memory file registry, so
    // the text lands in a scratch directory the process throws away.
    async loadCsv(
      table: string,
      csv: string,
      types?: Record<string, string>,
    ): Promise<number> {
      const file = join(scratch, `${encodeURIComponent(table)}.csv`);
      writeFileSync(file, csv);
      await query(
        `CREATE OR REPLACE TABLE ${quote(table)} AS
           SELECT * FROM ${readCsv(literal(file), types)}`,
      );
      const [row] = await query(`SELECT count(*) AS n FROM ${quote(table)}`);
      return Number(row?.n ?? 0);
    },

    async columns(table: string): Promise<string[]> {
      const rows = await query(`DESCRIBE ${quote(table)}`);
      return rows.map((row) => row.column_name);
    },

    close() {
      rmSync(scratch, { recursive: true, force: true });
    },
  };
}

function toRow(record: Record<string, unknown>): Row {
  const row: Row = {};
  for (const [key, value] of Object.entries(record)) {
    row[key] = value === null || value === undefined ? "" : String(value);
  }
  return row;
}

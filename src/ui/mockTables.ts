import focusesEmpty from "../../data2/focuses_empty.csv?raw";
import { loadCsv, queryRows, quote } from "./duckdb";

// Temporary. Nothing runs operations yet, so the tables they would produce
// don't exist and a data_entry node has no records to show. This stands one
// up from real data so the entry grid can be built and used against it.
// Delete this file and its one call in useDataEntry once there is a runner.
type Mock = { csv: string; select: string };

const MOCKS: Record<string, Mock> = {
  // The CSV's headers are the spreadsheet's; the columns named here are the
  // ones the operation feeding this node is meant to produce.
  needs_focuses: {
    csv: focusesEmpty,
    select: `SELECT "EIN" AS ein, "NAME" AS organization_name`,
  },
};

// StrictMode mounts the loading effect twice, and two seeds of one table race
// over its staging table — the loser fails as a table that doesn't exist,
// which is indistinguishable from the operation simply not having run.
const seeding = new Map<string, Promise<boolean>>();

export function seedMockTable(table: string): Promise<boolean> {
  let run = seeding.get(table);
  if (!run) {
    run = seed(table);
    seeding.set(table, run);
    // A failure shouldn't poison the next attempt.
    run.catch(() => seeding.delete(table));
  }
  return run;
}

async function seed(table: string): Promise<boolean> {
  const mock = MOCKS[table];
  if (!mock) return false;

  const staging = `${table}__mock_csv`;
  await loadCsv(staging, mock.csv);
  await queryRows(
    `CREATE OR REPLACE TABLE ${quote(table)} AS
       ${mock.select} FROM ${quote(staging)}
			 LIMIT 5`,
  );
  await queryRows(`DROP TABLE ${quote(staging)}`);
  return true;
}

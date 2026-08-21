import { toCsv, type CsvRow } from "./csv";
import type { DataEntryNode } from "./schema";

// cells line up with the node's frozen columns.
export type EntryRecord = { key: string; cells: string[] };

// The mark a checked option carries in the CSV.
const MARK = "x";

export function frozenColumns(node: DataEntryNode): string[] {
  return node.frozen.length > 0 ? node.frozen : [node.key];
}

export function toRecords(
  rows: Record<string, string>[],
  node: DataEntryNode,
): EntryRecord[] {
  const frozen = frozenColumns(node);
  return rows.map((row, i) => ({
    key: row[node.key] ?? String(i),
    cells: frozen.map((column) => row[column] ?? ""),
  }));
}

// One row per record, one column per option, matching the marked-up CSVs this
// pipeline already passes around. Records with nothing entered are included so
// the table always has the shape the next operation joins against.
export function entriesToCsv(
  node: DataEntryNode,
  records: EntryRecord[],
  entries: Record<string, string[]>,
): string {
  // The key leads, so a frozen column naming it again would double it up.
  const extra = frozenColumns(node)
    .map((column, i) => ({ column, i }))
    .filter(({ column }) => column !== node.key);

  const columns = [node.key, ...extra.map((c) => c.column), ...node.options];
  const rows = records.map((record) => {
    const marks = entries[record.key] ?? [];
    const row: CsvRow = { [node.key]: record.key };
    for (const { column, i } of extra) row[column] = record.cells[i] ?? "";
    for (const option of node.options) {
      row[option] = marks.includes(option) ? MARK : "";
    }
    return row;
  });

  return toCsv(columns, rows);
}

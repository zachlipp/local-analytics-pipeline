import { toCsv, type CsvRow } from "./csv";
import { literalColumns } from "./runner";
import type { DataLiteralNode } from "./schema";

export type LiteralRecord = Record<string, string>;
export type LiteralYamlRow = string | LiteralRecord;

// True when every declared row is a bare string, taking its column from `column`.
export function isBareLiteral(node: DataLiteralNode): boolean {
  return node.data.every((row) => typeof row === "string");
}

// The declared rows as uniform records, so the editor renders the same inputs either way.
export function literalRecords(node: DataLiteralNode): LiteralRecord[] {
  const columns = literalColumns(node);
  return node.data.map((row) =>
    typeof row === "string"
      ? { [node.column]: row }
      : Object.fromEntries(columns.map((c) => [c, row[c] ?? ""])),
  );
}

// A blank record carrying the node's fixed fields, for Add record.
export function blankLiteralRecord(node: DataLiteralNode): LiteralRecord {
  return Object.fromEntries(literalColumns(node).map((c) => [c, ""]));
}

// Same header literalCsv would use, so an edit never changes the table's shape.
export function literalRecordsToCsv(
  node: DataLiteralNode,
  records: LiteralRecord[],
): string {
  return toCsv(literalColumns(node), records as CsvRow[]);
}

// Back to YAML as bare strings when the node was written that way, keyed records otherwise.
export function literalYamlRows(
  node: DataLiteralNode,
  records: LiteralRecord[],
): LiteralYamlRow[] {
  return isBareLiteral(node) ? records.map((r) => r[node.column] ?? "") : records;
}

import { toCsv, type CsvRow } from "./csv";
import type { DataEntryNode } from "./schema";

// cells line up with the node's frozen columns; links are keyed by column name
// and only present for a cell whose template resolved to something.
export type EntryRecord = {
  key: string;
  cells: string[];
  links?: Record<string, string>;
};

// The mark a checked option carries in the CSV.
const MARK = "x";

// `{column}` in an href template.
const FIELD = /\{([^{}]+)\}/g;

export function frozenColumns(node: DataEntryNode): string[] {
  return node.frozen.length > 0 ? node.frozen : [node.key];
}

// Every input column this node's link templates interpolate, so they can be
// checked against that table's real shape before anything renders.
export function linkColumns(node: DataEntryNode): string[] {
  const columns = new Set<string>();
  for (const template of Object.values(node.links)) {
    for (const [, column] of template.matchAll(FIELD)) columns.add(column.trim());
  }
  return [...columns];
}

export function toRecords(
  rows: Record<string, string>[],
  node: DataEntryNode,
): EntryRecord[] {
  const frozen = frozenColumns(node);
  return rows.map((row, i) => ({
    key: row[node.key] ?? String(i),
    cells: frozen.map((column) => row[column] ?? ""),
    links: recordLinks(node, row),
  }));
}

function recordLinks(
  node: DataEntryNode,
  row: Record<string, string>,
): Record<string, string> | undefined {
  const links: Record<string, string> = {};
  for (const [column, template] of Object.entries(node.links)) {
    const href = resolveLink(template, row);
    if (href) links[column] = href;
  }
  return Object.keys(links).length > 0 ? links : undefined;
}

// Values are URL-encoded, the template around them is not. A row where none of
// the named columns has a value gets no link rather than an empty search.
function resolveLink(
  template: string,
  row: Record<string, string>,
): string | undefined {
  let found = false;
  const href = template.replace(FIELD, (_, column: string) => {
    const value = row[column.trim()];
    if (value === undefined || value === null || value === "") return "";
    found = true;
    return encodeURIComponent(String(value));
  });
  return found ? href : undefined;
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

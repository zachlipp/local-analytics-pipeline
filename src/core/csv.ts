export type CsvRow = Record<string, string>;

// The columns a preview's search box looks in. Mirrored by the SQL in
// runPipeline, which searches the same two once a table exists.
export const SEARCHABLE = ["name", "ein"];

// Everything the runner hands DuckDB goes in as CSV text, so both the literals
// and the entry grid write it through here.
export function toCsv(columns: string[], rows: CsvRow[]): string {
  const header = columns.map(csvField).join(",");
  const lines = rows.map((row) =>
    columns.map((column) => csvField(row[column] ?? "")).join(","),
  );
  return [header, ...lines].join("\n");
}

export function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// One pass over the text, shared by everything that has to read a CSV back:
// quoted fields may hold commas, quotes and newlines. `limit` stops the scan
// early, because a preview never needs the whole file.
export function parseCsv(csv: string, limit = Infinity): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < csv.length && rows.length < limit; i++) {
    const c = csv[i];
    if (quoted) {
      if (c !== '"') {
        field += c;
      } else if (csv[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r" && csv[i + 1] === "\n") {
      // Swallowed so a CRLF file does not end every last field with a return.
    } else {
      field += c;
    }
  }

  if (rows.length < limit && (field !== "" || row.length > 0)) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// The header a CSV actually carries, so a declared type can be matched against
// it.
export function csvColumns(csv: string): string[] {
  return parseCsv(csv, 1)[0] ?? [];
}

// A whole CSV as records, for a file that has been read but not yet loaded.
export function csvRows(csv: string): CsvRow[] {
  const [columns, ...rows] = parseCsv(csv);
  if (!columns) return [];
  return rows.map((values) =>
    Object.fromEntries(columns.map((column, i) => [column, values[i] ?? ""])),
  );
}

// What the database does with a search, done in memory: the same two columns,
// the same case-insensitive substring.
export function searchRows(
  rows: CsvRow[],
  query: string,
  limit: number,
): CsvRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows.slice(0, limit);

  const found: CsvRow[] = [];
  for (const row of rows) {
    if (found.length >= limit) break;
    const hit = Object.entries(row).some(
      ([column, value]) =>
        SEARCHABLE.includes(column.toLowerCase()) &&
        value.toLowerCase().includes(needle),
    );
    if (hit) found.push(row);
  }
  return found;
}

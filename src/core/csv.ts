// Null is a value a row can hold; written out it is an empty field, which is
// what read_csv reads back as null.
export type CsvRow = Record<string, string | null>;

// The columns a preview's search box looks in. Mirrored by the SQL in
// runPipeline, which searches the same two once a table exists.
export const SEARCHABLE = ["name", "ein"];

// What the search box calls those columns. "customer_id" reads as
// "customer ID"; a short word is an acronym rather than a word.
export function searchLabel(columns: string[]): string {
  const names = columns.map((column) =>
    column
      .split("_")
      .map((word) => (word.length <= 3 ? word.toUpperCase() : word))
      .join(" "),
  );
  const last = names[names.length - 1];
  const rest = names.slice(0, -1);
  return `Search by ${rest.length > 0 ? `${rest.join(", ")} or ${last}` : last}`;
}

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
  // A field the row never had, and an empty one, are both missing — the same
  // null read_csv would give them once the file is loaded.
  return rows.map((values) =>
    Object.fromEntries(
      columns.map((column, i) => [column, values[i] || null]),
    ),
  );
}

// What the database does with a search, done in memory: the same two columns,
// the same case-insensitive substring.
export function searchRows(
  rows: CsvRow[],
  query: string,
  limit: number,
  columns: string[] = SEARCHABLE,
): CsvRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows.slice(0, limit);

  const found: CsvRow[] = [];
  for (const row of rows) {
    if (found.length >= limit) break;
    const hit = Object.entries(row).some(
      ([column, value]) =>
        columns.includes(column.toLowerCase()) &&
        (value ?? "").toLowerCase().includes(needle),
    );
    if (hit) found.push(row);
  }
  return found;
}

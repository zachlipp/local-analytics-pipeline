export type CsvRow = Record<string, string>;

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

// The header a CSV actually carries, so a declared type can be matched against
// it. Quoted fields may contain commas; a header long enough to need anything
// cleverer than this is not one this project writes or reads.
export function csvColumns(csv: string): string[] {
  const header = csv.split("\n", 1)[0]?.replace(/\r$/, "") ?? "";
  if (!header) return [];

  const columns: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < header.length; i++) {
    const c = header[i];
    if (quoted) {
      if (c !== '"') {
        field += c;
      } else if (header[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      columns.push(field);
      field = "";
    } else {
      field += c;
    }
  }
  columns.push(field);
  return columns;
}

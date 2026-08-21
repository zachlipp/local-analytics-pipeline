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

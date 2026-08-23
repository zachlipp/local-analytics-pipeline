// A script node names a module by name alone. The directory is fixed here, so
// a pipeline description can never point at an arbitrary file in the project.
export const SCRIPT_DIRECTORY = "src/nodes/scripts";

// A bare module name: no directory, no extension.
export const SCRIPT_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

export function scriptPath(src: string): string {
  return `${SCRIPT_DIRECTORY}/${src}.ts`;
}

export type Row = Record<string, string>;
export type Rows = Row[];

// A file the pipeline hands back to the user rather than a table it can query.
export type ScriptDocument = {
  filename: string;
  mediaType: string;
  body: string;
};

export type ScriptContext = {
  // Every row of the node's declared input, in the order the table holds them.
  input: Rows;
};

export type ScriptOutput = Rows | ScriptDocument;

export type ScriptFunction = (
  context: ScriptContext,
) => ScriptOutput | Promise<ScriptOutput>;

export type ScriptModule = { default: ScriptFunction };

// Rows are an array and a document is not, so the return value discriminates
// itself and a script never has to say which it produced.
export function isDocument(output: ScriptOutput): output is ScriptDocument {
  return !Array.isArray(output);
}

// One row narrowed to the columns a script asked for. Required columns are
// always a string; optional ones are absent when the input left them blank.
export type Selected<R extends string, O extends string = never> = Record<
  R,
  string
> &
  Partial<Record<O, string>>;

// How many offending rows to name before the message stops being worth reading.
const NAMED_ROWS = 10;

// Pull the columns a script needs off its input, once, at the top of the file.
//
// A script's input is whatever DESCRIBE said at run time, so nothing types it
// beyond `Record<string, string>`. This is where that ends: name the columns
// here and everything below works with a checked object. Naming a column the
// input does not have is an error, and so is a required column left blank on
// any row — both fail here, naming the column, rather than turning up as
// `undefined` somewhere deeper in.
export function select<R extends string, O extends string = never>(
  rows: Rows,
  required: readonly R[],
  optional: readonly O[] = [],
): Selected<R, O>[] {
  // An empty input carries no column names to check against, and has nothing
  // to read out of it either.
  if (rows.length === 0) return [];

  const present = new Set(rows.flatMap((row) => Object.keys(row)));
  const absent = [...required, ...optional].filter(
    (column) => !present.has(column),
  );
  if (absent.length > 0) throw new Error(unknown(absent, [...present]));

  const blank = new Map<string, number[]>();
  const selected = rows.map((row, i) => {
    const picked: Record<string, string> = {};
    for (const column of required) {
      const value = text(row[column]);
      if (value === "") rowsFor(blank, column).push(i + 1);
      picked[column] = value;
    }
    for (const column of optional) {
      const value = text(row[column]);
      if (value !== "") picked[column] = value;
    }
    return picked as Selected<R, O>;
  });

  if (blank.size > 0) throw new Error(empty(blank));
  return selected;
}

// A table hands back nulls and numbers through the same shape a string comes
// through, and a value that is only whitespace is as good as absent.
function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function rowsFor(blank: Map<string, number[]>, column: string): number[] {
  const rows = blank.get(column) ?? [];
  blank.set(column, rows);
  return rows;
}

function unknown(absent: string[], present: string[]): string {
  return `This input has no ${list(absent)}. Its columns are: ${present.join(", ")}.`;
}

function empty(blank: Map<string, number[]>): string {
  const parts = [...blank].map(([column, rows]) => `${column} on ${count(rows)}`);
  return `Every row needs a value for the columns this script reads. Blank: ${parts.join("; ")}.`;
}

function count(rows: number[]): string {
  const shown = rows.slice(0, NAMED_ROWS).join(", ");
  const rest =
    rows.length > NAMED_ROWS ? `, and ${rows.length - NAMED_ROWS} more` : "";
  return `${rows.length === 1 ? "row" : "rows"} ${shown}${rest}`;
}

function list(names: string[]): string {
  if (names.length <= 2) return names.join(" or ");
  return `${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}`;
}

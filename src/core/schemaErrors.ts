import type { Schemas } from "./schema";

// A problem with a schema definition itself, rather than with a node that
// names one. Keyed by the schema, because that is the thing to go and edit.
export type SchemaError = {
  schema: string;
  // The short label the report shows.
  summary: string;
  // What to change, shown under --verbose.
  detail: string;
};

// A column DuckDB will accept unquoted and match case-sensitively against a
// CSV header. Anything else has to be quoted somewhere, and the place it gets
// forgotten is a query someone writes six months from now.
const PLAIN = /^[a-z_][a-z0-9_]*$/;

export function checkSchemas(schemas: Schemas): SchemaError[] {
  const errors: SchemaError[] = [];

  for (const [schema, columns] of Object.entries(schemas)) {
    const names = Object.keys(columns);

    if (names.length === 0) {
      errors.push({
        schema,
        summary: "No columns",
        detail: `Add columns to “${schema}” under top-level \`schemas:\`, or remove it.`,
      });
      continue;
    }

    const capitalised = names.filter((name) => /[A-Z]/.test(name));
    if (capitalised.length > 0) {
      errors.push({
        schema,
        summary: `Capital letters: ${capitalised.join(", ")}`,
        detail: `DuckDB lowercases unquoted identifiers, so a query reading ${capitalised[0]} without quotes will not match this column. Rename them in lowercase.`,
      });
    }

    const awkward = names.filter(
      (name) => !PLAIN.test(name) && !/[A-Z]/.test(name),
    );
    if (awkward.length > 0) {
      errors.push({
        schema,
        summary: `Needs quoting: ${awkward.join(", ")}`,
        detail: `These have to be written in double quotes in every query that touches them. Rename them to letters, digits and underscores.`,
      });
    }

    const blank = names.filter((name) => name.trim() === "");
    if (blank.length > 0) {
      errors.push({
        schema,
        summary: "Blank column name",
        detail: `A column under “${schema}” has no name. Give it one, or remove it.`,
      });
    }
  }

  return errors;
}

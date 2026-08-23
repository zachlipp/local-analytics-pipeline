import { z } from "zod";

// A named list of values that appears in more than one place: the columns a
// data_entry node asks for, the columns a schema declares for them, and the
// SQL that reads them back. Declared once here and spread into all three.
export const OptionSet = z.object({
  description: z.string().optional(),
  // Column type used when a schema spreads the set without naming one.
  type: z.string().default("VARCHAR"),
  values: z.array(z.string()).min(1),
});

export const OptionSets = z.record(z.string(), OptionSet);
export type OptionSets = z.infer<typeof OptionSets>;

// `...set_name: TYPE` as a key under `schemas:`.
const SPREAD_KEY = /^\.\.\.(.+)$/;

// `{{ spread('set_name', 'template with {col}', sep=', ') }}` in a query.
const SPREAD_CALL =
  /\{\{\s*spread\(\s*(['"])(.*?)\1\s*,\s*(['"])([\s\S]*?)\3\s*(?:,\s*(?:sep\s*=\s*)?(['"])([\s\S]*?)\5\s*)?\)\s*\}\}/g;

const PLACEHOLDER = "{col}";
const DEFAULT_SEPARATOR = ", ";

export type Report = (path: string[], message: string) => void;

type Fields = Record<string, unknown>;

function isRecord(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Rewrites the raw document so nothing downstream knows option sets exist.
// Anything it cannot resolve is reported and left in place, so the ordinary
// validation gets to say what is wrong with it too.
export function expandOptionSets(raw: unknown, report: Report): unknown {
  if (!isRecord(raw) || raw.option_sets === undefined) return raw;

  const parsed = OptionSets.safeParse(raw.option_sets);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      report(["option_sets", ...issue.path.map(String)], issue.message);
    }
    return raw;
  }
  const sets = parsed.data;

  const find = (name: string, path: string[]) => {
    const set = sets[name];
    if (!set) {
      report(
        path,
        `No option set named “${name}”. Define it under top-level \`option_sets:\`.`,
      );
    }
    return set;
  };

  return {
    ...raw,
    ...(raw.schemas !== undefined && { schemas: schemas(raw.schemas, find) }),
    ...(raw.nodes !== undefined && { nodes: nodes(raw.nodes, find) }),
    ...(raw.operations !== undefined && {
      operations: operations(raw.operations, find),
    }),
  };
}

type Find = (name: string, path: string[]) => z.infer<typeof OptionSet> | undefined;

function schemas(raw: unknown, find: Find): unknown {
  if (!isRecord(raw)) return raw;

  const out: Fields = {};
  for (const [schema, columns] of Object.entries(raw)) {
    if (!isRecord(columns)) {
      out[schema] = columns;
      continue;
    }

    const expanded: Fields = {};
    for (const [column, type] of Object.entries(columns)) {
      const spread = SPREAD_KEY.exec(column);
      if (!spread) {
        expanded[column] = type;
        continue;
      }

      const name = spread[1].trim();
      const set = find(name, ["schemas", schema, column]);
      if (!set) continue;

      const declared = typeof type === "string" && type.trim() !== "";
      for (const value of set.values) expanded[value] = declared ? type : set.type;
    }
    out[schema] = expanded;
  }
  return out;
}

function nodes(raw: unknown, find: Find): unknown {
  if (!isRecord(raw)) return raw;

  const out: Fields = {};
  for (const [node, fields] of Object.entries(raw)) {
    if (!isRecord(fields) || typeof fields.options !== "string") {
      out[node] = fields;
      continue;
    }

    const set = find(fields.options, ["nodes", node, "options"]);
    out[node] = set ? { ...fields, options: [...set.values] } : fields;
  }
  return out;
}

function operations(raw: unknown, find: Find): unknown {
  if (!isRecord(raw)) return raw;

  const out: Fields = {};
  for (const [operation, fields] of Object.entries(raw)) {
    if (!isRecord(fields) || typeof fields.query !== "string") {
      out[operation] = fields;
      continue;
    }
    out[operation] = { ...fields, query: query(fields.query, operation, find) };
  }
  return out;
}

function query(sql: string, operation: string, find: Find): string {
  return sql.replace(
    SPREAD_CALL,
    (match, _open, name: string, _quote, template: string, _sep, separator?: string) => {
      const set = find(name.trim(), ["operations", operation, "query"]);
      if (!set) return match;

      const joiner =
        separator === undefined ? DEFAULT_SEPARATOR : unescape(separator);
      return set.values
        .map((value) => template.replaceAll(PLACEHOLDER, value))
        .join(joiner);
    },
  );
}

// A separator lives inside a YAML block scalar, where a real newline would end
// the call, so the two escapes worth having are spelled out.
function unescape(text: string): string {
  return text.replaceAll("\\n", "\n").replaceAll("\\t", "\t");
}

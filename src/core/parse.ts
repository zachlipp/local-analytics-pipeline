import { Dag, DagSchema } from "./schema";
import { parse as parse_yaml } from "yaml";

export type ParseResult =
  | { ok: true; dag: Dag }
  | { ok: false; errors: string[] };

export function parseDag(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = parse_yaml(text);
  } catch (e) {
    return {
      ok: false,
      errors: [`Not valid YAML/JSON: ${(e as Error).message}`],
    };
  }
  const result = DagSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map(
        (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
      ),
    };
  }
  console.log("Loaded DAG!");
  return { ok: true, dag: result.data };
}

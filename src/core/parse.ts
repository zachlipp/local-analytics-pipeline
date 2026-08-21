import { Dag, DagSchema } from "./schema";
import { parse as parse_yaml } from "yaml";

export type CustomParseResult =
  | { ok: true; dag: Dag }
  | { ok: false; errors: string[] };

import { z } from "zod";

function parseErrors(result: z.ZodSafeParseResult<unknown>): void {
  if (result.success) return;

  for (const issue of result.error.issues) {
    if (issue.code !== "invalid_union") {
      console.log(`${issue.path.join(".")} — ${issue.message}`);
      continue;
    }

    issue.errors.forEach((branchIssues: z.core.$ZodIssue[], i: number) => {
      console.log(`branch ${i}:`);
      for (const b of branchIssues) {
        console.log(`  ${b.path.join(".")} — ${b.message}`);
      }
    });
  }
}

export function parseDag(text: string): CustomParseResult {
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
    console.error(parseErrors(result));
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

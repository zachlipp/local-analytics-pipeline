import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { scriptPath } from "@core/scripts";
import type { Dag } from "@core/schema";

export type MissingScript = { node: string; src: string; path: string };

// Every script node naming a module that isn't there. The browser resolves the
// same names through a Vite glob over the one directory, so a file missing here
// is a node that cannot run there.
export function missingScripts(dag: Dag, root = process.cwd()): MissingScript[] {
  const missing: MissingScript[] = [];

  for (const [node, fields] of Object.entries(dag.nodes)) {
    if (fields.kind !== "script") continue;
    const path = scriptPath(fields.src);
    if (!existsSync(resolve(root, path))) missing.push({ node, src: fields.src, path });
  }

  return missing;
}

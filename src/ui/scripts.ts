import { scriptPath, type ScriptFunction, type ScriptModule } from "@core/scripts";

// Resolved by Vite at build time, so the runnable scripts are fixed in the
// bundle. An uploaded pipeline can name one of them and nothing else, which is
// why none of this needs a sandbox.
const MODULES = import.meta.glob("/src/nodes/scripts/*.ts") as Record<
  string,
  () => Promise<ScriptModule>
>;

export function bundledScripts(): string[] {
  return Object.keys(MODULES)
    .map((path) => path.replace(/^.*\//, "").replace(/\.ts$/, ""))
    .sort();
}

export async function loadScript(src: string): Promise<ScriptFunction> {
  const path = scriptPath(src);
  const load = MODULES[`/${path}`];
  if (!load) {
    throw new Error(
      `No script at ${path}. Bundled scripts: ${bundledScripts().join(", ") || "none"}.`,
    );
  }

  const module = await load();
  if (typeof module.default !== "function") {
    throw new Error(`${path} has no default export to run.`);
  }
  return module.default;
}

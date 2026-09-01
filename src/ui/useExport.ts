import { useState } from "react";

import type { Dag } from "@core/schema";
import { useRun } from "./RunState";

// The download itself touches wasm, so it's lazily imported like every other
// path that runs a query.
export function useExport(dag: Dag, source: string | undefined) {
  const { results } = useRun();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string>();

  async function run() {
    if (!source) return;
    setExporting(true);
    setError(undefined);
    try {
      const { buildExport } = await import("./exportPipeline");
      const { downloadZip } = await import("./downloadZip");
      const files = await buildExport(dag, source, results);
      await downloadZip(`${dag.pipeline_name}.zip`, files);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setExporting(false);
    }
  }

  return { exporting, error, run: () => void run() };
}

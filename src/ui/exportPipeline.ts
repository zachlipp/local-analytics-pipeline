import { buildExportFiles, type ExportFile } from "@core/exportPipeline";
import type { Dag } from "@core/schema";
import type { NodeResult } from "@core/status";
import { wasmEngine } from "./duckdb";

// Mirrors ui/runPipeline.ts: the logic lives in core and takes an engine, the
// browser only ever has one.
export function buildExport(
  dag: Dag,
  source: string,
  results: Record<string, NodeResult>,
): Promise<ExportFile[]> {
  return buildExportFiles(wasmEngine, dag, source, results);
}

export type { ExportFile };

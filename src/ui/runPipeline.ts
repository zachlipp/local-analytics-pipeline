import {
  previewTable as preview,
  runPipeline as run,
  type Report,
  type RunOutcome,
} from "@core/runPipeline";
import type { Pipeline } from "@core/pipeline";
import type { Dag } from "@core/schema";
import type { NodeResult } from "@core/status";
import { wasmEngine } from "./duckdb";

// The runner lives in core and takes an engine; the browser only ever has one.
export function runPipeline(
  pipeline: Pipeline,
  dag: Dag,
  results: Record<string, NodeResult>,
  report: Report,
  target?: string,
): Promise<RunOutcome> {
  return run(wasmEngine, pipeline, dag, results, report, target);
}

export function previewTable(name: string, limit = 5, search?: string) {
  return preview(wasmEngine, name, limit, search);
}

// Debug only: whatever the user typed, straight to DuckDB.
export function runQuery(sql: string) {
  return wasmEngine.query(sql);
}

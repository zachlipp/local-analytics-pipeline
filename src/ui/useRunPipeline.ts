import { useCallback, useEffect, useRef, useState } from "react";

import type { Pipeline } from "@core/pipeline";
import type { Dag } from "@core/schema";
import type { Row } from "./duckdb";
import { useRun } from "./RunState";

// Searching queries the whole table, so this is only how much fits on screen.
const PREVIEW_ROWS = 25;

export type RunHandle = {
  /** Build everything the named node needs, then the node itself. */
  run: (target: string) => Promise<void>;
  running: boolean;
  error?: string;
  /** The first rows of the target's table, once it has been built. */
  preview?: Row[];
  /** The same first rows, re-queried for the ones matching a search. */
  search: (target: string, query: string) => Promise<Row[]>;
  rows?: number;
};

/**
 * Firing a run from a slide.
 *
 * DuckDB and the runner are imported lazily so the wasm bundle stays out of
 * the path of anyone who only ever looks at the graph.
 */
export function useRunPipeline(pipeline: Pipeline, dag: Dag): RunHandle {
  const { results, update } = useRun();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<Row[]>();
  const [rows, setRows] = useState<number>();

  // Both get a new identity on every store write, and `run` must not, or the
  // button it is attached to churns through the whole run.
  const latest = useRef({ results, update });
  useEffect(() => {
    latest.current = { results, update };
  });

  const run = useCallback(
    async (target: string) => {
      setRunning(true);
      setError(undefined);
      setPreview(undefined);
      setRows(undefined);
      try {
        const { runPipeline, previewTable } = await import("./runPipeline");
        const outcome = await runPipeline(
          pipeline,
          dag,
          latest.current.results,
          latest.current.update,
          target,
        );

        if (!outcome.ok) {
          setError(`${outcome.failed}: ${outcome.error}`);
          return;
        }
        setRows(outcome.ran.get(target));
        setPreview(await previewTable(target, PREVIEW_ROWS));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setRunning(false);
      }
    },
    [pipeline, dag],
  );

  const search = useCallback(async (target: string, query: string) => {
    const { previewTable } = await import("./runPipeline");
    return previewTable(target, PREVIEW_ROWS, query);
  }, []);

  return { run, running, error, preview, search, rows };
}

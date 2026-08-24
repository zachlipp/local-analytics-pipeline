import { useState } from "react";

import { toCsv } from "@core/csv";
import { isDocument, type ScriptDocument } from "@core/scripts";
import type { ScriptNode, Schemas } from "@core/schema";
import { declaredTypes } from "@core/shapes";
import type { NodeResult } from "@core/status";
import { loadScript } from "./scripts";

export type ScriptResult = {
  // The DuckDB table the rows landed in, when the script returned rows.
  table?: string;
  rows?: number;
  // What it returned instead, when it returned a document.
  document?: ScriptDocument;
};

// Read the input table, run the script, put back whatever it returned. Scripts
// are this project's own modules, so they run in the page: there is no
// untrusted code here to isolate any more.
export function useScript(
  node: ScriptNode,
  table: string,
  schemas: Schemas,
  // Mirrors progress into the run store, where status is derived from it.
  report: (patch: NodeResult) => void,
) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<ScriptResult>();

  async function run() {
    setRunning(true);
    setError(undefined);
    report({ running: true, error: undefined });
    try {
      const [script, { queryRows, loadCsv, quote }] = await Promise.all([
        loadScript(node.src),
        import("./duckdb"),
      ]);

      const input = await queryRows(`SELECT * FROM ${quote(node.input)}`);
      const output = await script({ input });

      if (isDocument(output)) {
        setResult({ document: output });
        report({ running: false, value: output.body });
        return;
      }

      const csv = toCsv(columnsOf(output), output);
      const rows = await loadCsv(table, csv, declaredTypes(node, schemas));
      setResult({ table, rows });
      report({ running: false, value: csv, table, rows });
    } catch (cause) {
      setResult(undefined);
      const message = cause instanceof Error ? cause.message : String(cause);
      // A cross-origin fetch blocked by CORS rejects with a deliberately
      // uninformative TypeError, so it is worth naming the likely cause.
      const reported =
        message === "Failed to fetch"
          ? "Request failed — the server may not allow browser requests (CORS)"
          : message;
      setError(reported);
      report({ running: false, error: reported });
    } finally {
      setRunning(false);
    }
  }

  return { running, error, result, run };
}

// Every key any row carries, so a script that omits a field on one row still
// produces a rectangular CSV.
function columnsOf(rows: Record<string, string>[]): string[] {
  const columns = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) columns.add(key);
  return [...columns];
}

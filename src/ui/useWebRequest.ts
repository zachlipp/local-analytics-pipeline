import { useState } from "react";

import { isConfigured, resolveRequest } from "@core/webRequest";
import type { WebRequestNode } from "@core/schema";
import type { NodeResult } from "@core/status";
import { runScript } from "./sandbox";

/** What a web_request node produced, once it has run. */
export type RequestResult = {
  /** Raw response body, when a declarative request was made. */
  response?: string;
  /** Whatever the script returned, when there was one. */
  value?: unknown;
  /** Name of the DuckDB table the response was loaded into. */
  table?: string;
  /** Rows in that table. */
  rows?: number;
  /**
   * Why the load failed, kept apart from `error` on purpose: a response that
   * isn't CSV is a perfectly good result for a node whose script consumes
   * JSON, so a failed load must not throw away what the fetch returned.
   */
  loadError?: string;
};

/**
 * Fetch, then transform.
 *
 * The fetch happens here in the page rather than inside the sandbox, and
 * deliberately: it's the *script* that's untrusted, not the URL, and a request
 * from our own origin has a far better chance of surviving CORS than one from
 * the sandbox's opaque origin. Only the script crosses into the iframe.
 */
export function useWebRequest(
  node: WebRequestNode,
  table: string,
  /** Mirrors progress into the run store, where status is derived from it. */
  report: (patch: NodeResult) => void,
) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<RequestResult>();

  async function run(input = "") {
    if (!isConfigured(node)) return;

    setRunning(true);
    setError(undefined);
    report({ running: true, error: undefined });
    try {
      let response: string | undefined;

      const request = resolveRequest(node, input);
      if (request) {
        const res = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
        });
        // A 404 body is not this node's data, so a bad status is an error
        // even though fetch itself was perfectly happy.
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        response = await res.text();
      }

      const loaded = response === undefined ? {} : await load(table, response);

      if (!node.script) {
        setResult({ response, ...loaded });
        report({ running: false, value: response ?? "" });
        return;
      }

      const script = await runScript(node.script, { input, response });
      if (!script.ok) throw new Error(script.error);
      setResult({ response, ...loaded, value: script.value });
      // The store keeps text, so what lands there is the response rather than
      // whatever shape the script chose to return.
      report({ running: false, value: response ?? "" });
    } catch (cause) {
      setResult(undefined);
      // A cross-origin fetch blocked by CORS rejects with a deliberately
      // uninformative TypeError, so it's worth naming the likely cause.
      const message = cause instanceof Error ? cause.message : String(cause);
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

/**
 * Get the response into DuckDB, reporting failure rather than raising it.
 *
 * DuckDB is imported lazily so the wasm bundle isn't in the path of an app
 * that never fetches anything.
 */
async function load(
  table: string,
  csv: string,
): Promise<Pick<RequestResult, "table" | "rows" | "loadError">> {
  try {
    const { loadCsv } = await import("./duckdb");
    return { table, rows: await loadCsv(table, csv) };
  } catch (cause) {
    return {
      loadError: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

import { useEffect, useMemo } from "react";

import "./DagSlides.css";

import { buildPipeline, type Pipeline, type PipelineStep } from "@core/pipeline";
import type { Dag, Node, WebRequestNode } from "@core/schema";
import { nodeStatuses, type NodeResult } from "@core/status";
import { isConfigured, resolveRequest } from "@core/webRequest";
import { DataEntry } from "./DataEntry";
import { DataLiteral } from "./DataLiteral";
import type { Row } from "./duckdb";
import { useNodeResult, useRun } from "./RunState";
import { useRoute } from "./route";
import { SourceLink } from "./SourceLink";
import { Spinner } from "./Spinner";
import { StatusBadge } from "./StatusBadge";
import { useFileUpload } from "./useFileUpload";
import { useRunPipeline } from "./useRunPipeline";
import { useWebRequest, type RequestResult } from "./useWebRequest";

/**
 * The graph one node at a time, in dependency order.
 *
 * Where DagViz shows the whole pipeline at once, this walks it: the order
 * follows the flow of the graph, gathering one operation's inputs and then
 * showing the result they produce before moving on to the next branch. A node
 * never appears before something it depends on.
 *
 * Each slide carries whatever that node needs from the user: a file to upload,
 * a request to fire, a value to type. Nothing consumes those answers yet, so
 * this is still a walkthrough rather than a runner.
 */
export function DagSlides({ dag }: { dag: Dag }) {
  const pipeline = useMemo(() => buildPipeline(dag), [dag]);
  const [route, navigate] = useRoute();

  // Answers live in the run store, above both views: only one slide is mounted
  // at a time, and the canvas has to see the same thing this view records.
  const { results } = useRun();
  const statuses = useMemo(
    () => nodeStatuses(pipeline, results),
    [pipeline, results],
  );

  const total = pipeline.steps.length;
  // The URL names the slide rather than numbering it, so a link survives an
  // edit that reorders the walk. A name this pipeline doesn't have — no hash,
  // a hand-typed one, a DAG replaced since the link was made — starts over.
  const found = pipeline.steps.findIndex((s) => s.name === route.step);
  const at = found === -1 ? 0 : found;
  const step = pipeline.steps[at];

  const go = (i: number) => {
    const target = pipeline.steps[Math.min(Math.max(i, 0), total - 1)];
    if (target) navigate({ view: "steps", step: target.name });
  };

  // Rewritten, not just tolerated: the fallback above leaves the hash naming a
  // step nobody is on, and the URL is meant to be copyable at any moment.
  useEffect(() => {
    if (step && route.step !== step.name) {
      navigate({ view: "steps", step: step.name }, { replace: true });
    }
  }, [step, route.step, navigate]);

  // Arrow keys drive it too — the buttons are the visible control, not the
  // only one. Typing in a slide's own input is left alone.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") go(at - 1);
      if (e.key === "ArrowRight") go(at + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // go() closes over the pipeline and the current position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, pipeline, navigate]);

  if (!step) {
    return (
      <div className="dag-slides">
        <p className="dag-slide-empty">This pipeline has no nodes.</p>
      </div>
    );
  }

  return (
    <div className="dag-slides">
      {/* The slide scrolls; the nav below it doesn't, so a long literal can't
          push the arrows out of reach. */}
      <div className="dag-slides-body">
        <div className="dag-slide-count">
          Step {at + 1} of {total}
        </div>

        <div className="dag-slide">
          <div className="dag-slide-name">{step.name}</div>
          <div className="dag-slide-kind">
            {step.node.kind}
            <StatusBadge status={statuses.get(step.name) ?? "UNREACHED"} />
          </div>
          {step.node.description && (
            <p className="dag-slide-description">{step.node.description}</p>
          )}
          {step.node.kind === "web_request" && step.node.input && (
            <div className="dag-slide-note">
              Uses <code>{step.node.input}</code>
            </div>
          )}

          <SlideControl
            // Remounts on every slide, which is what clears a half-finished
            // request's local state when you arrow away and back.
            key={step.node.id}
            node={step.node}
            name={step.name}
            input={inputValue(pipeline, step, results)}
            pipeline={pipeline}
            dag={dag}
          />
        </div>
      </div>

      <nav className="dag-slide-nav">
        <button
          type="button"
          onClick={() => go(at - 1)}
          disabled={at === 0}
          aria-label="Previous step"
        >
          <Chevron direction="left" />
        </button>
        <button
          type="button"
          onClick={() => go(at + 1)}
          disabled={at >= total - 1}
          aria-label="Next step"
        >
          <Chevron direction="right" />
        </button>
      </nav>
    </div>
  );
}

type ControlProps = {
  node: Node;
  /** The node's name in the DAG — its table name, for anything loaded. */
  name: string;
  /** The current value of this node's declared input, for web_request. */
  input: string;
  pipeline: Pipeline;
  dag: Dag;
};

/** What this node wants from the user, if it wants anything. */
function SlideControl({ node, name, input, pipeline, dag }: ControlProps) {
  switch (node.kind) {
    case "file":
      return <FileControl id={node.id} source={node.source} />;

    case "web_request":
      return <WebRequestControl node={node} input={input} table={name} />;

    case "user_input":
      return <UserInputControl id={node.id} label={node.description} />;

    case "data_entry":
      return <DataEntry node={node} table={name} />;

    case "data_literal":
      return (
        <div className="dag-slide-data">
          <DataLiteral data={node.data} />
        </div>
      );

    case "operation_result":
      return (
        <OperationControl
          node={node}
          name={name}
          pipeline={pipeline}
          dag={dag}
        />
      );
  }
}

/**
 * Run the operation producing this node, and everything it stands on.
 *
 * The button is the whole pipeline's run button when you are on its last node:
 * a target pulls in its own ancestors, so the further down the walk you are,
 * the more of the graph one press builds.
 */
function OperationControl({
  node,
  name,
  pipeline,
  dag,
}: {
  node: Node;
  name: string;
  pipeline: Pipeline;
  dag: Dag;
}) {
  const [result] = useNodeResult(node.id);
  const { run, running, error, preview, rows } = useRunPipeline(pipeline, dag);
  const operation = pipeline.nodes.get(name)?.operation;

  if (!operation) {
    return (
      <div className="dag-slide-note">No operation produces this node.</div>
    );
  }

  // The store's count survives arrowing away and back; the hook's is only this
  // mount's, and is what updates the moment a re-run finishes.
  const count = rows ?? result.rows;

  return (
    <>
      <button
        className="dag-slide-action"
        type="button"
        onClick={() => void run(name)}
        disabled={running}
      >
        {running ? <Spinner label="Running" /> : <RefreshIcon />}
        {running ? "Running" : count === undefined ? "Run" : "Re-run"}
      </button>

      <div className="dag-slide-note">
        Runs <code>{operation}</code> and everything upstream of it.
      </div>

      {count !== undefined && !running && (
        <div className="dag-slide-note">
          {count} rows in <code>{name}</code>
        </div>
      )}
      {preview && preview.length > 0 && <TablePreview rows={preview} />}
      {error && <div className="dag-slide-error">{error}</div>}
    </>
  );
}

/** The first few rows, wide tables scrolling sideways rather than wrapping. */
function TablePreview({ rows }: { rows: Row[] }) {
  const columns = Object.keys(rows[0] ?? {});
  return (
    <div className="dag-slide-preview">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            // Result rows carry no id, and nothing reorders a read-only table.
            <tr key={i}>
              {columns.map((column) => (
                <td key={column}>{row[column]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserInputControl({ id, label }: { id: string; label: string }) {
  const [result, report] = useNodeResult(id);
  const name = label.trim() || "Value";

  return (
    <input
      className="dag-slide-input"
      type="text"
      value={result.value ?? ""}
      placeholder={name}
      aria-label={name}
      onChange={(e) => report({ value: e.target.value })}
    />
  );
}

function FileControl({ id, source }: { id: string; source?: string }) {
  const [result, report] = useNodeResult(id);
  const { file, running: uploading, error } = result;
  const { dragging, onChange, drop } = useFileUpload(report);

  return (
    <>
      {source && (
        <div className="dag-slide-note">
          Download it from <SourceLink href={source} />, then drop it below.
        </div>
      )}

      <label
        className="dag-slide-action dag-slide-drop"
        data-dragging={dragging}
        {...drop}
      >
        {uploading ? "Uploading" : dragging ? "Drop it" : "Choose a file or drop it here"}
        {uploading && <Spinner label="Uploading" />}
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={uploading}
          onChange={onChange}
        />
      </label>

      {file && !uploading && <div className="dag-slide-note">{file.name}</div>}
      {error && <div className="dag-slide-error">{error}</div>}
    </>
  );
}

/**
 * Fire this node's request and show what came back.
 *
 * A node with neither a `request` nor a `script` has nothing to fire, so the
 * button says so rather than pretending — that's every web_request node in a
 * pipeline written before those fields existed.
 */
function WebRequestControl({
  node,
  input,
  table,
}: {
  node: WebRequestNode;
  input: string;
  /** The node's name, which is also the table its CSV lands in. */
  table: string;
}) {
  const [, report] = useNodeResult(node.id);
  const { running, error, result, run } = useWebRequest(node, table, report);
  const configured = isConfigured(node);

  return (
    <>
      <button
        className="dag-slide-action"
        type="button"
        onClick={() => void run(input)}
        disabled={running || !configured}
      >
        {running ? <Spinner label="Fetching" /> : <RefreshIcon />}
        {running ? "Fetching" : result ? "Refresh" : "Fetch"}
      </button>

      {!configured && (
        <div className="dag-slide-note">
          No request or script defined for this node.
        </div>
      )}
      {node.request && (
        <div className="dag-slide-note dag-slide-url">
          {resolveRequest(node, input)?.url}
        </div>
      )}
      {result && <RequestSummary result={result} />}
      {error && <div className="dag-slide-error">{error}</div>}
    </>
  );
}

/** Enough of the result to see it worked, not the whole payload. */
function RequestSummary({ result }: { result: RequestResult }) {
  const { response, value, table, rows, loadError } = result;
  return (
    <div className="dag-slide-note">
      {response !== undefined && (
        <div>{response.length} characters received</div>
      )}
      {rows !== undefined && (
        <div>
          {rows} rows loaded into <code>{table}</code>
        </div>
      )}
      {loadError && <div className="dag-slide-error">{loadError}</div>}
      {value !== undefined && (
        <pre className="dag-slide-result">{preview(value)}</pre>
      )}
    </div>
  );
}

/** Scripts can return anything, including something JSON won't take. */
function preview(value: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    text = String(value);
  }
  return text.length > 600 ? `${text.slice(0, 600)}…` : text;
}

/** Inline so the arrows cost no dependency and inherit the button's colour. */
function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={direction === "left" ? "M15 5 L8 12 L15 19" : "M9 5 L16 12 L9 19"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20 12a8 8 0 1 1-2.3-5.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M20 4v4h-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The current value of the node this step declares as its input.
 *
 * Only the kinds the user fills in have a value to give yet — a typed string
 * or an uploaded file's text. An input naming an operation_result resolves to
 * "" until there's a runner to produce one.
 */
function inputValue(
  pipeline: Pipeline,
  step: PipelineStep,
  results: Record<string, NodeResult>,
): string {
  if (step.node.kind !== "web_request" || !step.node.input) return "";
  const source = pipeline.nodes.get(step.node.input)?.node;
  if (!source) return "";
  const result = results[source.id];
  return result?.value ?? result?.file?.text ?? "";
}

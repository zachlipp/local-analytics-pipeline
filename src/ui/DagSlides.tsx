import { useCallback, useEffect, useMemo, useState } from "react";

import "./DagSlides.css";

import { buildPipeline, type Pipeline } from "@core/pipeline";
import { csvRows, SEARCHABLE, searchLabel, searchRows } from "@core/csv";
import { scriptPath } from "@core/scripts";
import type { Dag, Node, ScriptNode } from "@core/schema";
import { nodeStatuses } from "@core/status";
import { DataEntry } from "./DataEntry";
import { debug } from "./debug";
import type { Row } from "./duckdb";
import { EditableDataLiteral } from "./EditableDataLiteral";
import { list } from "@core/utils";
import { useNodeResult, useRun } from "./RunState";
import { useRoute } from "./route";
import { SourceLink } from "./SourceLink";
import { Spinner } from "./Spinner";
import { StatusBadge } from "./StatusBadge";
import { useFileUpload } from "./useFileUpload";
import { useRunPipeline } from "./useRunPipeline";
import { useScript, type ScriptResult } from "./useScript";

// How many rows fit on screen; the search itself is not limited to them.
const PREVIEW_ROWS = 25;

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
export function DagSlides({
  dag,
  searchColumns = SEARCHABLE,
}: {
  dag: Dag;
  /** Columns a preview's search box looks in, and names in its placeholder. */
  searchColumns?: string[];
}) {
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
          {step.node.kind === "script" && step.node.input && (
            <div className="dag-slide-note">
              Uses <code>{step.node.input}</code>
            </div>
          )}

          <DroppedColumns id={step.node.id} />

          <SlideControl
            // Remounts on every slide, which is what clears a half-finished
            // request's local state when you arrow away and back.
            key={step.node.id}
            node={step.node}
            name={step.name}
            pipeline={pipeline}
            dag={dag}
            searchColumns={searchColumns}
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

// Columns the file had that the node's schema never named. Not an error — the
// table built — but the data is gone and nothing downstream can ask for it.
function DroppedColumns({ id }: { id: string }) {
  const [result] = useNodeResult(id);
  const dropped = result.dropped ?? [];
  if (dropped.length === 0) return null;

  return (
    <div className="dag-slide-warning">
      {dropped.length === 1
        ? `Ignored one column this node's schema does not declare: ${list(dropped)}.`
        : `Ignored ${dropped.length} columns this node's schema does not declare: ${list(dropped)}.`}{" "}
      They are not in the table and cannot be queried. Add them to the schema to
      keep them.
    </div>
  );
}

type ControlProps = {
  node: Node;
  /** The node's name in the DAG — its table name, for anything loaded. */
  name: string;
  pipeline: Pipeline;
  dag: Dag;
  searchColumns: string[];
};

/** What this node wants from the user, if it wants anything. */
function SlideControl({
  node,
  name,
  pipeline,
  dag,
  searchColumns,
}: ControlProps) {
  switch (node.kind) {
    case "file":
      return (
        <FileControl
          id={node.id}
          source={node.source}
          searchColumns={searchColumns}
        />
      );

    case "script":
      return <ScriptControl node={node} table={name} schemas={dag.schemas} />;

    case "user_input":
      return (
        <UserInputControl
          id={node.id}
          label={node.description}
          placeholder={node.default}
        />
      );

    case "data_entry":
      return <DataEntry node={node} table={name} />;

    case "data_literal":
      return <EditableDataLiteral node={node} />;

    case "operation_result":
      return (
        <OperationControl
          node={node}
          name={name}
          pipeline={pipeline}
          dag={dag}
          searchColumns={searchColumns}
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
  searchColumns,
}: {
  node: Node;
  name: string;
  pipeline: Pipeline;
  dag: Dag;
  searchColumns: string[];
}) {
  const [result] = useNodeResult(node.id);
  const { run, running, error, preview, search, query, rows } = useRunPipeline(
    pipeline,
    dag,
  );
  const searchTable = useCallback(
    (query: string) => search(name, query, searchColumns),
    [search, name, searchColumns],
  );
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
      {preview && preview.length > 0 && (
        <TablePreview
          rows={preview}
          search={searchTable}
          sql={query}
          searchColumns={searchColumns}
        />
      )}
      {error && <div className="dag-slide-error">{error}</div>}
    </>
  );
}

/** The first few rows, wide tables scrolling sideways rather than wrapping. */
function TablePreview({
  rows,
  search,
  sql,
  searchColumns,
}: {
  rows: Row[];
  // Runs against the whole table, not the rows above — a preview is five rows
  // of a hundred thousand, and searching only those would find nothing.
  search: (query: string) => Promise<Row[]>;
  // Debug only, and only where there is a database to ask. Absent, the box
  // stays a search box however the flag is set.
  sql?: (statement: string) => Promise<Row[]>;
  // Named in the placeholder so the box says what it actually looks in.
  searchColumns: string[];
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Row[]>();
  const [error, setError] = useState<string>();
  const [mode, setMode] = useState<"search" | "sql">("search");
  const raw = debug && sql !== undefined && mode === "sql";

  const show = (found: Row[]) => {
    setMatches(found);
    setError(undefined);
  };
  const fail = (cause: unknown) =>
    setError(cause instanceof Error ? cause.message : String(cause));

  // Typed a character at a time; each keystroke is a query, so it waits for a
  // pause and drops anything still in flight when the next one starts. SQL is
  // left out of this on purpose: half a statement is not one to run.
  useEffect(() => {
    const needle = query.trim();
    if (raw || !needle) return;

    let live = true;
    const timer = setTimeout(() => {
      search(needle)
        .then((found) => live && show(found))
        .catch((cause: unknown) => live && fail(cause));
    }, 200);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, search, raw]);

  const clear = () => {
    setMatches(undefined);
    setError(undefined);
  };

  const shown = matches ?? rows;
  const columns = Object.keys(shown[0] ?? rows[0] ?? {});

  return (
    <>
      <form
        className="dag-slide-search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          if (!raw || !sql) return;
          const statement = query.trim();
          if (!statement) return clear();
          sql(statement).then(show).catch(fail);
        }}
      >
        <input
          className="dag-slide-search"
          type={raw ? "text" : "search"}
          value={query}
          placeholder={
            raw ? "SELECT * FROM … — enter to run" : searchLabel(searchColumns)
          }
          aria-label={raw ? "SQL to run" : searchLabel(searchColumns)}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value.trim()) clear();
          }}
        />
        {debug && sql && (
          <button
            type="button"
            className="dag-slide-mode"
            aria-pressed={raw}
            onClick={() => {
              setMode(raw ? "search" : "sql");
              setQuery("");
              clear();
            }}
          >
            SQL
          </button>
        )}
      </form>
      {error && <div className="dag-slide-error">{error}</div>}
      {shown.length === 0 ? (
        <div className="dag-slide-note">
          {raw ? "That query returned no rows." : `No rows match "${query}".`}
        </div>
      ) : (
        <TableBody columns={columns} rows={shown} />
      )}
    </>
  );
}

function TableBody({ columns, rows }: { columns: string[]; rows: Row[] }) {
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
                <td key={column}>
                  {row[column] ?? <span className="dag-slide-null">null</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserInputControl({
  id,
  label,
  placeholder,
}: {
  id: string;
  label: string;
  placeholder: string | undefined;
}) {
  const [result, report] = useNodeResult(id);
  const name = label.trim() || "Value";

  return (
    <input
      className="dag-slide-input"
      type="text"
      value={result.value ?? ""}
      placeholder={placeholder}
      aria-label={name}
      onChange={(e) => report({ value: e.target.value })}
    />
  );
}

function FileControl({
  id,
  source,
  searchColumns,
}: {
  id: string;
  source?: string;
  searchColumns: string[];
}) {
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
        {uploading
          ? "Uploading"
          : dragging
            ? "Drop it"
            : "Choose a file or drop it here"}
        {uploading && <Spinner label="Uploading" />}
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={uploading}
          onChange={onChange}
        />
      </label>

      {file && !uploading && <div className="dag-slide-note">{file.name}</div>}
      {file && !uploading && (
        <FilePreview text={file.text} columns={searchColumns} />
      )}
      {error && <div className="dag-slide-error">{error}</div>}
    </>
  );
}

// The file as it will be read, before anything has been run on it. Nothing is
// in the database yet, so the search runs over the parsed text.
function FilePreview({ text, columns }: { text: string; columns: string[] }) {
  const rows = useMemo(() => csvRows(text), [text]);
  const search = useCallback(
    (query: string) =>
      Promise.resolve(searchRows(rows, query, PREVIEW_ROWS, columns)),
    [rows, columns],
  );

  if (rows.length === 0) return null;
  return (
    <TablePreview
      rows={rows.slice(0, PREVIEW_ROWS)}
      search={search}
      searchColumns={columns}
    />
  );
}

// Run this node's script and show what came back.
function ScriptControl({
  node,
  table,
  schemas,
}: {
  node: ScriptNode;
  // The node's name, which is also the table its rows land in.
  table: string;
  schemas: Dag["schemas"];
}) {
  const [, report] = useNodeResult(node.id);
  const { running, error, result, run } = useScript(
    node,
    table,
    schemas,
    report,
  );

  return (
    <>
      <button
        className="dag-slide-action"
        type="button"
        onClick={() => void run()}
        disabled={running}
      >
        {running ? <Spinner label="Running" /> : <RefreshIcon />}
        {running ? "Running" : result ? "Run again" : "Run"}
      </button>

      <div className="dag-slide-note">
        <code>{scriptPath(node.src)}</code>
        {node.network && " · makes external requests"}
      </div>
      {result && <ScriptSummary result={result} />}
      {error && <div className="dag-slide-error">{error}</div>}
    </>
  );
}

/** Enough of the result to see it worked, not the whole payload. */
function ScriptSummary({ result }: { result: ScriptResult }) {
  const { table, rows, document } = result;
  return (
    <div className="dag-slide-note">
      {rows !== undefined && (
        <div>
          {rows} rows loaded into <code>{table}</code>
        </div>
      )}
      {document && (
        <>
          <div>
            {document.filename} · {document.body.length} characters
          </div>
          <pre className="dag-slide-result">{preview(document.body)}</pre>
        </>
      )}
    </div>
  );
}

function preview(text: string): string {
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

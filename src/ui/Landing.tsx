import "./Landing.css";

import { useState } from "react";

const ADVANTAGES = [
  {
    icon: <GraphIcon />,
    title: "You describe relationships. We build the graph.",
    body: "Name each table and what it depends on. Execution order, run state, and the picture of the whole pipeline come out of that.",
  },
  {
    icon: <BoltIcon />,
    title: "No code to use. All of code underneath.",
    body: "Schemas, SQL, tests, version control — the engineering stays. The person running the pipeline never sees any of it.",
  },
  {
    icon: <LockIcon />,
    title: "The browser is the database.",
    body: "DuckDB compiled to WebAssembly runs every query on the machine that opened the page. No server, no upload, no round trip.",
  },
];

// A slice of the demo pipeline, laid out left to right in run order.
const CARD = { w: 150, h: 42 };

const PIPELINE = [
  { name: "order_history", kind: "data_literal", x: 0, y: 10 },
  { name: "incoming_orders", kind: "data_literal", x: 0, y: 100 },
  { name: "year", kind: "user_input", x: 0, y: 190 },
  { name: "all_orders", kind: "operation_result", x: 212, y: 100 },
  { name: "billable_customers", kind: "operation_result", x: 424, y: 100 },
  { name: "populate_categories", kind: "data_entry", x: 636, y: 190 },
  { name: "classified_customers", kind: "operation_result", x: 848, y: 10 },
];

const EDGES: [number, number][] = [
  [0, 3],
  [1, 3],
  [2, 3],
  [3, 4],
  [4, 5],
  [4, 6],
  [5, 6],
];

// One pair of numbers times the whole hero: the hold, then the wipe.
const HOLD = 2700;
const SWEEP = 2600;

// Drop a spreadsheet photo or screen recording at src/assets/spreadsheet.<ext>
// and it becomes the first thing the hero shows. With no such file, the hero
// is the pipeline alone.
const BEFORE = Object.entries(
  import.meta.glob(
    "../assets/spreadsheet.{png,jpg,jpeg,webp,gif,svg,mp4,webm,mov}",
    {
      eager: true,
      query: "?url",
      import: "default",
    },
  ) as Record<string, string>,
)[0];

const BEFORE_URL = BEFORE?.[1];
const BEFORE_IS_VIDEO = /\.(mp4|webm|mov)$/.test(BEFORE?.[0] ?? "");

// Firefox caches an image's document, animation clock included, and reuses it
// on reload; a per-load URL gets one that starts at zero. Video needs no such
// help — it plays from the start either way — and is too big to refetch.
const BEFORE_SRC = !BEFORE_URL
  ? undefined
  : BEFORE_IS_VIDEO
    ? BEFORE_URL
    : `${BEFORE_URL}?load=${Date.now()}`;

const SCORE = `nodes:
  incoming_orders:
    kind: file
    schema: orders
  year:
    kind: user_input

operations:
  union_orders:
    inputs: [order_history, incoming_orders, year]
    output: all_orders
    query: |
      SELECT customer_id, name
           , CAST(year.value AS INTEGER) AS year
      FROM incoming_orders
      JOIN year ON true`;

const PERFORMANCE = [
  { verb: "Drop in", rest: "this cycle's orders as a CSV." },
  { verb: "Type", rest: "the year those orders were placed." },
  { verb: "Code", rest: "the customers nobody has categorized yet." },
  { verb: "Run", rest: "the pipeline and read the finished table." },
  { verb: "Export", rest: "the results and the pipeline that made them." },
];

const INSIDE = [
  {
    kind: "file",
    body: "A CSV the person running the pipeline supplies. Its columns are checked against a declared schema before anything reads it.",
  },
  {
    kind: "data_literal",
    body: "A small table written into the pipeline itself — lookup lists, exclusions, last year's numbers.",
  },
  {
    kind: "user_input",
    body: "One value asked for at run time, like a reporting year.",
  },
  {
    kind: "data_entry",
    body: "A table filled in by hand during the run, one row per record that needs a human decision.",
  },
  {
    kind: "operation_result",
    body: "The table a SQL query produces. Its inputs are what wire the graph together.",
  },
];

export function Landing({ onDemo }: { onDemo: (source: string) => void }) {
  return (
    <div className="landing">
      <header className="hero">
        <p className="eyebrow">
          SQL pipelines, run by the people who own the data
        </p>
        <h1 className="hero-title">By Ear Analytics</h1>
        <p className="hero-lead">Perform without the spreadsheets.</p>
        <div className="hero-actions">
          <DemoButton onDemo={onDemo} />
          <a className="hero-link" href="#story">
            See how it fits together
          </a>
        </div>
      </header>

      <PipelineCanvas />

      <section className="story" id="story">
        <p className="eyebrow">The problem</p>
        <div className="story-grid">
          <div className="story-lead">
            <p>
              A domain expert has a pipeline that has gotten out of hand — a
              spreadsheet where years of data and years of bespoke logic live in
              the same cells. An engineer is brought in to sort it out.
            </p>
            <p>
              <strong>They do not speak the same language.</strong> The expert
              works in one artifact that holds everything. The engineer
              separates operations from data and wants them to stay separate.
            </p>
            <p>
              This is where the two meet. The logic gets written down once, as
              SQL. The data arrives fresh every run, from the person who has it.
            </p>
          </div>
          <ul className="story-split">
            <li>
              <span className="tag" data-kind="operation_result">
                Written once
              </span>
              <p>Schemas, queries, the shape of the graph, the tests.</p>
            </li>
            <li>
              <span className="tag" data-kind="user_input">
                Supplied every run
              </span>
              <p>The files, the one-off values, the judgment calls.</p>
            </li>
          </ul>
        </div>
      </section>

      <section className="two-hands">
        <div className="panel" data-kind="operation_result">
          <p className="eyebrow">What the engineer writes</p>
          <pre>
            <code>{SCORE}</code>
          </pre>
          <p className="panel-note">
            One YAML file, checked into a repo, reviewed like any other code.
          </p>
        </div>
        <div className="panel" data-kind="user_input">
          <p className="eyebrow">What the analyst does</p>
          <ol className="performance">
            {PERFORMANCE.map((step) => (
              <li key={step.verb}>
                <strong>{step.verb}</strong> {step.rest}
              </li>
            ))}
          </ol>
          <p className="panel-note">
            No install, no account, no query. The pipeline asks; they answer.
          </p>
        </div>
      </section>

      <section className="advantages-section">
        <p className="eyebrow">Why it works</p>
        <ul className="advantages">
          {ADVANTAGES.map((advantage) => (
            <li className="advantage" key={advantage.title}>
              <span className="advantage-icon" aria-hidden="true">
                {advantage.icon}
              </span>
              <div className="advantage-text">
                <h2>{advantage.title}</h2>
                <p>{advantage.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="inside">
        <p className="eyebrow">Every node is one of five kinds</p>
        <dl className="kinds">
          {INSIDE.map((entry) => (
            <div className="kind" key={entry.kind}>
              <dt data-kind={entry.kind}>{entry.kind}</dt>
              <dd>{entry.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="closer">
        <h2>Load a pipeline and run it.</h2>
        <p>
          The demo is a real pipeline: eight tables, five queries, two things
          only a person can answer. It runs entirely in this tab.
        </p>
        <div className="hero-actions">
          <DemoButton onDemo={onDemo} />
        </div>
      </section>
    </div>
  );
}

// The same node cards the graph view draws, laid on the same dotted canvas.
function PipelineCanvas() {
  return (
    <figure
      className="canvas"
      style={
        {
          "--hold": `${HOLD}ms`,
          "--sweep": `${SWEEP}ms`,
        } as React.CSSProperties
      }
    >
      <div className="canvas-frame" data-before={BEFORE_URL ? "" : undefined}>
        <svg viewBox="0 0 1000 250" role="img" aria-labelledby="canvas-title">
          <title id="canvas-title">
            Part of the demo pipeline, drawn in run order
          </title>
          {EDGES.map(([from, to]) => {
            const a = PIPELINE[from];
            const b = PIPELINE[to];
            const x1 = a.x + CARD.w;
            const y1 = a.y + CARD.h / 2;
            const y2 = b.y + CARD.h / 2;
            const dx = (b.x - x1) / 2;
            return (
              <g
                className="canvas-edge"
                key={`${a.name}-${b.name}`}
                style={
                  { "--at": `${(b.x / 1000) * SWEEP}ms` } as React.CSSProperties
                }
              >
                <path
                  d={`M${x1} ${y1} C${x1 + dx} ${y1} ${b.x - dx} ${y2} ${b.x} ${y2}`}
                />
                <path
                  d={`M${b.x - 6} ${y2 - 3.5}l6 3.5-6 3.5z`}
                  className="arrow"
                />
              </g>
            );
          })}
          {PIPELINE.map((node) => (
            <g
              className="canvas-node"
              key={node.name}
              data-kind={node.kind}
              style={
                {
                  "--at": `${((node.x + CARD.w / 2) / 1000) * SWEEP}ms`,
                } as React.CSSProperties
              }
            >
              <rect
                x={node.x}
                y={node.y}
                width={CARD.w}
                height={CARD.h}
                rx="6"
              />
              <rect
                className="canvas-node-bar"
                x={node.x}
                y={node.y}
                width="3"
                height={CARD.h}
                rx="1.5"
              />
              <text
                className="canvas-node-name"
                x={node.x + 12}
                y={node.y + 18}
              >
                {node.name}
              </text>
              <circle
                className="canvas-node-dot"
                cx={node.x + 14.5}
                cy={node.y + 29}
                r="2.5"
              />
              <text
                className="canvas-node-kind"
                x={node.x + 21}
                y={node.y + 32}
              >
                {node.kind}
              </text>
            </g>
          ))}
        </svg>
        {BEFORE_URL && (
          <div className="before" aria-hidden="true">
            {BEFORE_IS_VIDEO ? (
              <video src={BEFORE_SRC} autoPlay muted loop playsInline />
            ) : (
              <img src={BEFORE_SRC} alt="" />
            )}
          </div>
        )}
      </div>
      <figcaption>
        {BEFORE_URL
          ? "The same work as a pipeline: part of the demo, in the order it runs."
          : "Part of the demo pipeline, in the order it runs."}
      </figcaption>
    </figure>
  );
}

// The fixture is a whole pipeline, so it is only pulled in if asked for.
function DemoButton({ onDemo }: { onDemo: (source: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function onClick() {
    setLoading(true);
    setError(undefined);
    try {
      const { default: source } = await import("../../data/demo.yaml?raw");
      onDemo(source);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="demo"
        onClick={() => void onClick()}
        disabled={loading}
      >
        {loading ? "Loading…" : "Run the demo pipeline"}
      </button>
      {error && <span className="demo-error">{error}</span>}
    </>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function GraphIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="12" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M8.2 7.2 15.8 11M15.8 13 8.2 16.8" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M13 3 5 14h6l-2 7 8-11h-6z" strokeLinejoin="round" />
    </svg>
  );
}

import "./Landing.css";

import { useState } from "react";

const ADVANTAGES = [
  {
    icon: <GraphIcon />,
    title: "Visualize your data pipelines.",
    body: "You name each table and its dependencies, we determine execution order and visualize it.",
  },
  {
    icon: <BoltIcon />,
    title: "No-code feel, full-code benefits.",
    body: "Engineers write SQL, schemas, tests, and custom TypeScript functions. End users never have to see any of it.",
  },
  {
    icon: <LockIcon />,
    title: "Totally private execution.",
    body: "SQL queries run on DuckDB compiled to WebAssembly in the user's browser. Data never leaves users' computers.",
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

export function Landing({ onDemo }: { onDemo: (source: string) => void }) {
  return (
    <div className="landing">
      <header className="hero">
        <h1 className="hero-title">Off-Grid Analytics</h1>
        <p className="hero-lead">
          No messy spreadsheets. No prying eyes on your data. Define your
          pipeline once, and run it forever for free.
        </p>
        <div className="hero-actions">
          <DemoButton onDemo={onDemo} />
          <a className="hero-link" href="#story">
            Learn more
          </a>
        </div>
      </header>
      <PipelineCanvas />
      <section className="story" id="story">
        <p className="eyebrow">The problem</p>
        <div className="story-lead">
          <p>
            A domain expert has a data pipeline that's gotten a bit out of hand
            — a spreadsheet where years of data and years of bespoke logic live
            in the same cells. They bring in a software engineer to sort it out.
            There's one big problem:
          </p>
          <p>
            <strong>They don't speak the same language.</strong>
          </p>
          <p>
            Well, metaphorically, at least. Domain experts live in spreadsheets;
            software engineers live in code. Spreadsheets bleed together the
            history of data, the operations on the data, and intermediary steps
            between them. Code separates data from the operations on that data.
            Our tools shape our thinking, and the gap between these tools means
            software engineers and analysts don't think about problems the same
            way.
          </p>
          <p>
            Off-Grid Analytics bridges this gap. Software engineers can focus on
            pipeline execution: data, schemas, and queries and how the relate to
            each other. Domain experts can focus on the data: Uploading tables,
            editing information that lives in the graph, and performing data
            entry from the browser.
          </p>
          <p>
            The end product is a private data pipeline that's defined once by a
            software engineer and run as often as needed by domain experts. It
            bundles the expressiveness of SQL, the interativity of browsers, the
            flexibility of JavaScript, and local, private execution. Check out
            the demo to learn more.
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

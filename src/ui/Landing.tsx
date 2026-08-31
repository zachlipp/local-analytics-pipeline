import "./Landing.css";

import { useState } from "react";

import mountain from "../assets/mountain.png";

// Placeholder copy, waiting on the real pitch.
const ADVANTAGES = [
  {
    icon: <GraphIcon />,
    title: "Visualize your data pipelines.",
    body: "You define how entities relate to one another. We construct your execution graph.",
  },
  {
    icon: <BoltIcon />,
    title: "No code feel. Full code benefits.",
    body: "Define schemas, write SQL, make tests, leverage version control - all without end users needing to know any of it",
  },
  {
    icon: <LockIcon />,
    title: "Totally private.",
    body: "The SQL execution engine is the browser. Data never leaves users' computers.",
  },
];

function UserStoryText() {
  return (
    <>
      <p>
        A non-technical domain expert has a data pipeline that's gotten a bit
        out of hand. They bring in an engineer to make sense of it.
      </p>
      <p>
        There's one problem:{" "}
        <strong>They don't speak the same language.</strong>
      </p>

      <p>
        Well, metaphorically at least. Domain experts may rely on a
        sophisticated spreadsheet that couples tons of bespoke logic with data
        spanning years. Engineers separate operations from data.{" "}
      </p>
      <p>
        This project marries these two worlds. Engineers write SQL. End users
        get to drag and drop files in their browsers.
      </p>
    </>
  );
}

export function Landing({ onDemo }: { onDemo: (source: string) => void }) {
  return (
    <section className="landing">
      <h1 className="landing-title">By Ear Analytics</h1>
      <p className="landing-subtitle">Perform without the sheets.</p>

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

      <UserStoryText />

      <div className="landing-actions">
        <DemoButton onDemo={onDemo} />
      </div>
    </section>
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
        {loading ? "Loading…" : "Try the demo pipeline"}
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

import "./Landing.css";

import { useState } from "react";

import mountain from "../assets/mountain.png";

// Placeholder copy, waiting on the real pitch.
const ADVANTAGES = [
  {
    icon: <GraphIcon />,
    title: "Advantage two",
    body: "Placeholder — describe the second advantage of this approach here.",
  },
  {
    icon: <LockIcon />,
    title: "Totally private",
    body: "Your data never leaves your computer.",
  },
  {
    icon: <BoltIcon />,
    title: "Advantage three",
    body: "Placeholder — describe the third advantage of this approach here.",
  },
];

// Placeholder slides, waiting on the real screenshots.
const SLIDES = [
  {
    src: mountain,
    alt: "Placeholder one",
    title: "Play to users' strengths",
    body: "Engineers write SQL. Users use the browser. No spreadsheets and no hosting costs - everyone wins.",
  },
];

export function Landing({ onDemo }: { onDemo: (source: string) => void }) {
  return (
    <section className="landing">
      <h1 className="landing-title">By Ear Analytics</h1>
      <p className="landing-subtitle">Perform without the sheets.</p>

      <Carousel />

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

      <div className="landing-actions">
        <DemoButton onDemo={onDemo} />
      </div>
    </section>
  );
}

function Carousel() {
  const [index, setIndex] = useState(0);
  const last = SLIDES.length - 1;
  const many = SLIDES.length > 1;

  return (
    <div className="carousel">
      <div className="carousel-frame">
        {many && (
          <button
            type="button"
            className="carousel-arrow"
            onClick={() => setIndex((i) => (i === 0 ? last : i - 1))}
            aria-label="Previous slide"
          >
            &#8249;
          </button>
        )}

        <div className="carousel-viewport">
          <div
            className="carousel-track"
            style={{ transform: `translateX(-${index * 100}%)` }}
          >
            {SLIDES.map((slide, i) => (
              <div
                className="carousel-slide"
                key={slide.title}
                aria-hidden={i !== index}
              >
                <img src={slide.src} alt={slide.alt} />
                <div className="carousel-caption">
                  <h2>{slide.title}</h2>
                  <p>{slide.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {many && (
          <button
            type="button"
            className="carousel-arrow"
            onClick={() => setIndex((i) => (i === last ? 0 : i + 1))}
            aria-label="Next slide"
          >
            &#8250;
          </button>
        )}
      </div>

      {many && (
        <div className="carousel-dots">
          {SLIDES.map((slide, i) => (
            <button
              type="button"
              key={slide.title}
              className={
                i === index ? "carousel-dot is-active" : "carousel-dot"
              }
              onClick={() => setIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === index}
            />
          ))}
        </div>
      )}
    </div>
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

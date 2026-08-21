import "./App.css";

import { useState } from "react";

import { DagUpload } from "@ui/DagUpload";
import { DagSlides } from "@ui/DagSlides";
import { DagViz } from "@ui/DagViz";
import { RunProvider } from "@ui/RunState";
import { useRoute, type View } from "@ui/route";
import type { Dag } from "@core/schema";

function App() {
  // App owns the parsed DAG: DagUpload produces it, DagViz renders it.
  const [dag, setDag] = useState<Dag>();
  // Steps first: the walkthrough is where a run actually starts, and the
  // canvas is the reference you switch to when you need the whole shape.
  // That's the default an empty hash parses to.
  const [route, navigate] = useRoute();
  // Carried across the toggle so the graph is a detour, not a restart.
  const pick = (view: View) => navigate({ view, step: route.step });

  return (
    <main>
      <h1>{dag?.pipeline_name ?? "LAP"}</h1>
      <p className="subtitle">Local Analytics Pipeline</p>

      <DagUpload onDag={setDag} />

      {dag && (
        // Switching views unmounts the other one, so what the user has done
        // has to be held above both — which is also what lets either view
        // show every node's status.
        <RunProvider dag={dag}>
          <div className="view-toggle" role="group" aria-label="View">
            <ViewButton view="steps" current={route.view} onPick={pick}>
              Steps
            </ViewButton>
            <ViewButton view="graph" current={route.view} onPick={pick}>
              Graph
            </ViewButton>
          </div>

          {route.view === "graph" ? (
            <DagViz dag={dag} />
          ) : (
            <DagSlides dag={dag} />
          )}
        </RunProvider>
      )}
    </main>
  );
}

function ViewButton({
  view,
  current,
  onPick,
  children,
}: {
  view: View;
  current: View;
  onPick: (view: View) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={view === current}
      onClick={() => onPick(view)}
    >
      {children}
    </button>
  );
}

export default App;

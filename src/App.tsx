import "./App.css";

import { useState } from "react";

import { DagUpload } from "@ui/DagUpload";
import { DagSlides } from "@ui/DagSlides";
import { DagViz } from "@ui/DagViz";
import { RunProvider, useRun } from "@ui/RunState";
import { useRoute, type View } from "@ui/route";
import type { Dag } from "@core/schema";

function App() {
  // App owns the parsed DAG: DagUpload produces it, DagViz renders it.
  const [dag, setDag] = useState<Dag>();
  // Kept alongside the parsed dag so Export can patch the text the user
  // actually uploaded rather than re-serializing what parsing derived from it.
  const [source, setSource] = useState<string>();
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

      <DagUpload onDag={setDag} onSource={setSource} />

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
            <ExportButton dag={dag} source={source} />
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

// The download itself touches wasm, so it's lazily imported like every other
// path that runs a query.
function ExportButton({ dag, source }: { dag: Dag; source?: string }) {
  const { results } = useRun();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string>();

  async function onExport() {
    if (!source) return;
    setExporting(true);
    setError(undefined);
    try {
      const { buildExport } = await import("@ui/exportPipeline");
      const { downloadZip } = await import("@ui/downloadZip");
      const files = await buildExport(dag, source, results);
      await downloadZip(`${dag.pipeline_name}.zip`, files);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void onExport()}
        disabled={!source || exporting}
      >
        {exporting ? "Exporting…" : "Export"}
      </button>
      {error && <span className="export-error">{error}</span>}
    </>
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

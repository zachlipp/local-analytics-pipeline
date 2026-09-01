import "./App.css";

import { useState } from "react";

import { Completion } from "@ui/Completion";
import { DemoStart } from "@ui/DemoStart";
import { DagUpload } from "@ui/DagUpload";
import { Landing } from "@ui/Landing";
import { DagSlides } from "@ui/DagSlides";
import { DagViz } from "@ui/DagViz";
import { Overview } from "@ui/Overview";
import { RunProvider } from "@ui/RunState";
import { useExport } from "@ui/useExport";
import { useRoute, type View } from "@ui/route";
import type { Dag } from "@core/schema";

// The demo's identifier column, which the stock list of searchable columns
// knows nothing about.
const DEMO_SEARCH_COLUMNS = ["customer_id", "name"];

function App() {
  // App owns the parsed DAG: DagUpload produces it, DagViz renders it.
  const [dag, setDag] = useState<Dag>();
  // Kept alongside the parsed dag so Export can patch the text the user
  // actually uploaded rather than re-serializing what parsing derived from it.
  const [source, setSource] = useState<string>();
  // The demo enters through the same door an upload does, so nothing
  // downstream has to know where the YAML came from.
  const [demoSource, setDemoSource] = useState<string>();
  // True only while the loaded pipeline is the one the demo button supplied;
  // uploading a file replaces `source` and turns this back off.
  const demo = source !== undefined && source === demoSource;
  // Overview first: it's the front door, stating in prose what's loaded and
  // pointing on to the graph or the walkthrough — for an upload and the demo
  // alike.
  const [route, navigate] = useRoute("overview");
  // Carried across the toggle so the graph is a detour, not a restart.
  const pick = (view: View) => navigate({ view, step: route.step });

  const upload = (
    <DagUpload initialSource={demoSource} onDag={setDag} onSource={setSource} />
  );

  return (
    <main>
      {dag && (
        <>
          <h1>{dag.pipeline_name}</h1>
          <p className="subtitle">Powered by Off-Grid Analytics</p>
        </>
      )}

      {/* One position, never remounted: a remount reports an empty DAG and undoes the load. */}
      <div hidden={!dag}>{upload}</div>

      {!dag && <Landing onDemo={setDemoSource} />}

      {dag && (
        // Switching views unmounts the other one, so what the user has done
        // has to be held above both — which is also what lets either view
        // show every node's status.
        <RunProvider dag={dag}>
          <div className="view-toggle" role="group" aria-label="View">
            {/* Overview leads everywhere — it's the front door. The demo
                leads with the graph after that, so its button leads too. */}
            <ViewButton view="overview" current={route.view} onPick={pick}>
              Overview
            </ViewButton>
            {demo ? (
              <>
                <ViewButton view="graph" current={route.view} onPick={pick}>
                  Graph
                </ViewButton>
                <ViewButton view="steps" current={route.view} onPick={pick}>
                  Steps
                </ViewButton>
              </>
            ) : (
              <>
                <ViewButton view="steps" current={route.view} onPick={pick}>
                  Steps
                </ViewButton>
                <ViewButton view="graph" current={route.view} onPick={pick}>
                  Graph
                </ViewButton>
              </>
            )}
            {!demo && <ExportButton dag={dag} source={source} />}
          </div>

          {/* The frame the completion overlay covers, which is why it's
              positioned: the overlay is scoped to the view, not the page. */}
          <div className="view-frame">
            {route.view === "overview" ? (
              <Overview dag={dag} />
            ) : route.view === "graph" ? (
              <DagViz dag={dag} showUnreached={demo} />
            ) : (
              <DagSlides
                dag={dag}
                searchColumns={demo ? DEMO_SEARCH_COLUMNS : undefined}
              />
            )}
            <Completion dag={dag} source={source} view={route.view} />
            {demo && <DemoStart dag={dag} />}
          </div>
        </RunProvider>
      )}
    </main>
  );
}

function ExportButton({ dag, source }: { dag: Dag; source?: string }) {
  const { exporting, error, run } = useExport(dag, source);

  return (
    <>
      <button type="button" onClick={run} disabled={!source || exporting}>
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

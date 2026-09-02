import "./App.css";

import { Completion } from "@ui/Completion";
import { DemoStart } from "@ui/DemoStart";
import { DagUpload } from "@ui/DagUpload";
import { ExportButton } from "@ui/ExportButton";
import { Landing } from "@ui/Landing";
import { DagSlides } from "@ui/DagSlides";
import { PipelineChange } from "@ui/PipelineChange";
import { Wip } from "@ui/Wip";
import { DagViz } from "@ui/DagViz";
import { RunProvider } from "@ui/RunState";
import { usePipeline } from "@ui/usePipeline";
import { useRoute, type Source, type View } from "@ui/route";

// The demo's identifier column, which the stock list of searchable columns
// knows nothing about.
const DEMO_SEARCH_COLUMNS = ["customer_id", "name"];

function App() {
  const [route, navigate] = useRoute("graph");
  const {
    dag,
    source,
    from,
    errors,
    pending,
    generation,
    offer,
    accept,
    cancel,
  } = usePipeline(route.source);

  // Which route this is, rather than which file was loaded: the demo is a
  // place you can be, so nothing has to compare source text to find out.
  const demo = route.source === "demo-pipeline";
  // A pipeline is only this route's once it has been committed here. Until
  // then #/custom-pipeline shows its prompt even though a demo may still be
  // in memory.
  const loaded = dag && from === route.source;

  // Navigation merges, so the step rides along and the graph stays a detour
  // rather than a restart.
  const pick = (view: View) => navigate({ view });
  const start = (source: Source) => navigate({ source, view: "graph" });

  return (
    <main>
      <div className="page-header">
        <div className="page-header-text">
          {loaded && (
            <>
              <h1>{dag.pipeline_name}</h1>
              <p className="subtitle">Powered by Off-Grid Analytics</p>
            </>
          )}
        </div>
        <Wip />
      </div>

      {!route.source && <Landing onStart={start} />}

      {route.source === "custom-pipeline" && !loaded && (
        <DagUpload onOffer={offer} messages={errors} />
      )}

      {loaded && (
        // Switching views unmounts the other one, so what the user has done
        // has to be held above both — which is also what lets either view
        // show every node's status. Keyed on the generation so a wipe remounts
        // it onto an empty store rather than carrying the old work across.
        <RunProvider key={generation} dag={dag}>
          <div className="view-toggle" role="group" aria-label="View">
            {demo ? (
              <>
                <ViewButton view="graph" current={route.view} onPick={pick}>
                  View the pipeline
                </ViewButton>
                <ViewButton
                  view="steps"
                  current={route.view}
                  onPick={pick}
                  className={route.view === "graph" ? "wb-pop" : undefined}
                >
                  Run the pipeline
                </ViewButton>
              </>
            ) : (
              <>
                <ViewButton view="graph" current={route.view} onPick={pick}>
                  View the pipeline
                </ViewButton>
                <ViewButton
                  view="steps"
                  current={route.view}
                  onPick={pick}
                  className={route.view === "graph" ? "wb-pop" : undefined}
                >
                  Run the pipeline
                </ViewButton>
              </>
            )}
            {!demo && <ExportButton dag={dag} source={source} />}
          </div>

          {/* The frame the completion overlay covers, which is why it's
              positioned: the overlay is scoped to the view, not the page. */}
          <div className="view-frame">
            {route.view === "graph" ? (
              <DagViz dag={dag} />
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

      {pending && (
        <PipelineChange
          pending={pending}
          dag={dag}
          source={source}
          onAccept={accept}
          onCancel={cancel}
        />
      )}
    </main>
  );
}

function ViewButton({
  view,
  current,
  onPick,
  className,
  children,
}: {
  view: View;
  current: View;
  onPick: (view: View) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-pressed={view === current}
      onClick={() => onPick(view)}
    >
      {children}
    </button>
  );
}

export default App;

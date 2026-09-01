import "./Completion.css";

import { useMemo, useState } from "react";

import { buildPipeline } from "@core/pipeline";
import type { Dag } from "@core/schema";
import { nodeStatuses, pipelineComplete } from "@core/status";
import { useRun } from "./RunState";
import { useExport } from "./useExport";
import type { View } from "./route";

/**
 * The end of the run, announced over whichever view the user finished in.
 *
 * Mounted on every view rather than only the two it draws on, so dismissing it
 * on the graph doesn't bring it back on the steps: the dismissal is state, and
 * unmounting would forget it.
 */
export function Completion({
  dag,
  source,
  view,
}: {
  dag: Dag;
  source?: string;
  view: View;
}) {
  const { results } = useRun();
  const pipeline = useMemo(() => buildPipeline(dag), [dag]);
  const complete = useMemo(
    () => pipelineComplete(nodeStatuses(pipeline, results)),
    [pipeline, results],
  );

  const [dismissed, setDismissed] = useState(false);
  // The delayed fade is for the moment the run finishes on its own. Asking for
  // the overlay back should be instant, so it opts out of the animation.
  const [reopened, setReopened] = useState(false);
  const { exporting, error, run } = useExport(dag, source);

  // Falling out of completion resets the dismissal, so finishing a second time
  // opens the overlay again rather than silently leaving the small button.
  // Adjusted during render rather than in an effect: an effect would paint the
  // stale dismissal first.
  const [wasComplete, setWasComplete] = useState(complete);
  if (wasComplete !== complete) {
    setWasComplete(complete);
    if (!complete) {
      setDismissed(false);
      setReopened(false);
    }
  }

  if (!complete || view === "overview") return null;

  if (dismissed) {
    return (
      <button
        type="button"
        className="completion-reopen"
        onClick={() => {
          setDismissed(false);
          setReopened(true);
        }}
      >
        Pipeline complete
      </button>
    );
  }

  return (
    <div
      className={reopened ? "completion completion-instant" : "completion"}
      role="dialog"
      aria-label="Pipeline complete"
    >
      <div className="completion-card">
        <h2>Pipeline complete</h2>
        <p>
          Every node in {dag.pipeline_name} has run. Export the pipeline and its
          results to take them out of the browser.
        </p>
        <div className="completion-actions">
          <button
            type="button"
            className="completion-export"
            onClick={run}
            disabled={!source || exporting}
          >
            {exporting ? "Exporting…" : "Export data"}
          </button>
          <button type="button" onClick={() => setDismissed(true)}>
            Dismiss
          </button>
        </div>
        {error && <p className="export-error">{error}</p>}
      </div>
    </div>
  );
}

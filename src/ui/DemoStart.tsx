import "./Completion.css";

import { useMemo, useState } from "react";

import { buildPipeline } from "@core/pipeline";
import type { Dag } from "@core/schema";
import { nodeStatuses, pipelineComplete } from "@core/status";
import { useRun } from "./RunState";
import { useExport } from "./useExport";
import type { View } from "./route";

const [showTutorial, setShowTutorial] = useState(
  () => !localStorage.getItem("tutorialSeen"),
);

const dismiss = () => {
  localStorage.setItem("tutorialSeen", "1");
  setShowTutorial(false);
};

export function DemoStart({
  dag,
  source,
}: {
  dag: Dag;
  source?: string;
  view: View;
}) {
  if (showTutorial) {
    return (
      <div
        className={"completion completion-instant"}
        role="dialog"
        aria-label="Pipeline demo"
      >
        <div className="completion-card">
          <h2>{dag.pipeline_name}</h2>
          <p>
            This demonstration pipeline manages fake customer data, all
            constructed in the browser.
          </p>
          <p>
            In practice, this information would be uploaded as CSV files,
            single-sheet spreadsheets that contain no formulas. For
            demonstration only, we instead use just a few records you can edit
            right here in the browser.
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
}

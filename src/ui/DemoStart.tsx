import "./Completion.css";

import { useState } from "react";

import type { Dag } from "@core/schema";

export function DemoStart({ dag }: { dag: Dag }) {
  const [showTutorial, setShowTutorial] = useState(true);

  const dismiss = () => setShowTutorial(false);

  if (!showTutorial) return null;

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
          In practice, this information would be uploaded as CSV files
          (single-sheet spreadsheets that contain no formulas).
        </p>
        <p>
          For demonstration only, we instead use just a few records you can edit
          right here in the browser.
        </p>
        <div className="completion-actions">
          <button type="button" onClick={dismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

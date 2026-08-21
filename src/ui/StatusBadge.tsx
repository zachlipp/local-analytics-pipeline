import "./StatusBadge.css";

import type { Status } from "@core/status";

/** Spelled for a person rather than for the enum. */
const LABELS: Record<Status, string> = {
  SUCCEEDED: "Succeeded",
  INVALID: "Invalid",
  NEEDS_INPUT: "Needs input",
  UNREACHED: "Unreached",
  ERROR: "Error",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className="dag-status" data-status={status}>
      {LABELS[status]}
    </span>
  );
}

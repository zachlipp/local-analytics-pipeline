import "./Completion.css";

import type { Dag } from "@core/schema";

import { ExportButton } from "./ExportButton";
import type { Pending } from "./usePipeline";

/**
 * The one prompt standing between an upload and the work already in the store.
 *
 * It only appears for the two changes that cost the user something: a
 * different pipeline, which discards their work, and a version that never
 * moved, which the app has no safe way to merge.
 */
export function PipelineChange({
  pending,
  dag,
  source,
  onAccept,
  onCancel,
}: {
  pending: Pending;
  /** The loaded pipeline, whose work is at stake — not the incoming one. */
  dag?: Dag;
  source?: string;
  onAccept: () => void;
  onCancel: () => void;
}) {
  const conflict = pending.change.kind === "conflict";
  const hotfix =
    pending.change.kind === "conflict" ? pending.change.hotfix : undefined;

  return (
    <div
      className="completion completion-instant completion-fixed"
      role="dialog"
      aria-label={conflict ? "Version conflict" : "Replace pipeline"}
    >
      <div className="completion-card">
        <div className="completion-body">
          {conflict ? (
            <>
              <h2>This version has already been used</h2>
              <p>
                <strong>{pending.dag.pipeline_name}</strong> arrived as version{" "}
                <strong>{pending.dag.version}</strong>, but a different file
                claiming that same version is what your saved work belongs to.
              </p>
              <p>
                Ask whoever sent it to publish this as a new version. Two
                different pipelines sharing one version number is what makes
                your entries unsafe to carry over.
              </p>
              {hotfix ? (
                <p>
                  If you need to keep working now, you can load it as{" "}
                  <strong>{hotfix}</strong>. Your saved entries are discarded,
                  so export them first if you want them.
                </p>
              ) : (
                <p>
                  This file is already a hotfix, so there is no version left to
                  move it to. It needs a real version bump before it can load.
                </p>
              )}
            </>
          ) : (
            <>
              <h2>Load a different pipeline?</h2>
              <p>
                <strong>{pending.dag.pipeline_name}</strong> is a different
                pipeline from{" "}
                <strong>{dag?.pipeline_name ?? "the one you have loaded"}</strong>
                .
              </p>
              <p>
                Only one pipeline's work is kept at a time, so loading this
                discards every file, entry and value you have saved. Export
                first if you want to keep them.
              </p>
            </>
          )}
        </div>
        <div className="completion-actions">
          {dag && <ExportButton dag={dag} source={source} children="Export current work" />}
          {(!conflict || hotfix) && (
            <button type="button" onClick={onAccept}>
              {hotfix ? `Load as ${hotfix}` : "Discard and load"}
            </button>
          )}
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

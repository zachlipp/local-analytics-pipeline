import type { Dag } from "@core/schema";

import { useExport } from "./useExport";

export function ExportButton({
  dag,
  source,
  children = "Export",
}: {
  dag: Dag;
  source?: string;
  children?: React.ReactNode;
}) {
  const { exporting, error, run } = useExport(dag, source);

  return (
    <>
      <button type="button" onClick={run} disabled={!source || exporting}>
        {exporting ? "Exporting…" : children}
      </button>
      {error && <span className="export-error">{error}</span>}
    </>
  );
}

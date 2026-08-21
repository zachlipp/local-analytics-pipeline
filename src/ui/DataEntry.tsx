import "./DataEntry.css";

import type { DataEntryNode } from "@core/schema";
import { Spinner } from "./Spinner";
import { useDataEntry } from "./useDataEntry";

// Pinned columns are all this wide, so each one's offset is just its index.
const FROZEN_REM = 18;

export function DataEntry({
  node,
  table,
}: {
  node: DataEntryNode;
  table: string;
}) {
  const entry = useDataEntry(node, table);

  if (entry.loading) {
    return (
      <div className="dag-slide-note">
        <Spinner label="Loading records" /> Loading records
      </div>
    );
  }
  if (entry.error) return <div className="dag-slide-error">{entry.error}</div>;
  if (entry.records.length === 0) {
    return <div className="dag-slide-note">{entry.note ?? "Nothing to enter."}</div>;
  }

  const offset = (i: number) => ({ left: `${i * FROZEN_REM}rem` });

  return (
    <div className="entry">
      <div className="entry-grid">
        <table>
          <thead>
            <tr>
              {entry.frozen.map((column, i) => (
                <th
                  key={column}
                  className="entry-frozen entry-corner"
                  style={offset(i)}
                >
                  {column}
                </th>
              ))}
              {node.options.map((option) => (
                <th key={option} className="entry-option">
                  <span>{option}</span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {entry.records.map((record) => (
              <tr key={record.key} data-active={record.key === entry.active}>
                {record.cells.map((cell, i) => (
                  <th
                    key={entry.frozen[i]}
                    scope="row"
                    className="entry-frozen"
                    style={offset(i)}
                    title={cell}
                    // Selecting a row is how one with nothing checked still
                    // counts as entered.
                    onClick={() => entry.select(record.key)}
                  >
                    {cell}
                  </th>
                ))}
                {node.options.map((option) => (
                  <td key={option}>
                    <input
                      type="checkbox"
                      checked={entry.checked(record.key, option)}
                      onChange={() => entry.toggle(record.key, option)}
                      aria-label={`${record.cells[0] || record.key}: ${option}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="entry-status">
        <span>
          {entry.entered} of {entry.records.length} entered
        </span>
        {entry.saving && <Spinner label="Saving" />}
        {entry.saveError && (
          <span className="dag-slide-error">{entry.saveError}</span>
        )}
      </div>
    </div>
  );
}

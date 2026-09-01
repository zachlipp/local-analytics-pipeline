import "./EditableDataLiteral.css";

import type { DataLiteralNode } from "@core/schema";
import { useDataLiteral } from "./useDataLiteral";

// DataLiteral's editable counterpart, mounted only from the slide view.
export function EditableDataLiteral({ node }: { node: DataLiteralNode }) {
  const editor = useDataLiteral(node);

  return (
    <div className="literal-editor">
      <div className="entry-grid literal-grid">
        <table>
          <thead>
            <tr>
              {editor.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
              <th className="literal-grid-actions" />
            </tr>
          </thead>

          <tbody>
            {editor.records.map((record, i) => (
              // Rows carry no id of their own; the list's order is the identity.
              <tr key={i}>
                {editor.columns.map((column) => (
                  <td key={column}>
                    <input
                      type="text"
                      value={record[column] ?? ""}
                      onChange={(e) =>
                        editor.setField(i, column, e.target.value)
                      }
                      aria-label={`${column}, row ${i + 1}`}
                    />
                  </td>
                ))}
                <td className="literal-grid-actions">
                  <button
                    type="button"
                    className="literal-editor-remove"
                    onClick={() => editor.remove(i)}
                    aria-label={`Delete row ${i + 1}`}
                  >
                    &times;
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editor.records.length === 0 && (
        <div className="dag-slide-note">No rows yet.</div>
      )}

      <button type="button" className="literal-editor-add" onClick={editor.add}>
        Add row
      </button>
    </div>
  );
}

import "./EditableDataLiteral.css";

import type { DataLiteralNode } from "@core/schema";
import { useDataLiteral } from "./useDataLiteral";

// DataLiteral's editable counterpart, mounted only from the slide view.
export function EditableDataLiteral({ node }: { node: DataLiteralNode }) {
  const editor = useDataLiteral(node);

  return (
    <div className="literal-editor">
      {editor.records.length === 0 && (
        <div className="dag-slide-note">No records yet.</div>
      )}

      <ul className="literal-editor-records">
        {editor.records.map((record, i) => (
          // Records carry no id of their own; the list's order is the identity.
          <li key={i} className="literal-editor-record">
            <div className="literal-editor-fields">
              {editor.columns.map((column) => (
                <label key={column} className="literal-editor-field">
                  <span className="literal-editor-key">{column}</span>
                  <input
                    type="text"
                    value={record[column] ?? ""}
                    onChange={(e) => editor.setField(i, column, e.target.value)}
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              className="literal-editor-remove"
              onClick={() => editor.remove(i)}
              aria-label="Delete record"
            >
              &times;
            </button>
          </li>
        ))}
      </ul>

      <button type="button" className="literal-editor-add" onClick={editor.add}>
        Add record
      </button>
    </div>
  );
}

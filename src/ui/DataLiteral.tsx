import "./DataLiteral.css";

import type { Node } from "@core/schema";

type LiteralData = Extract<Node, { kind: "data_literal" }>["data"];

/**
 * The rows of a data_literal node as a list.
 *
 * An entry is either a bare value or a record of columns, so a plain row is
 * one <li> and a keyed row is a nested list of its fields. Both views render
 * this; each supplies its own box around it.
 */
export function DataLiteral({ data }: { data: LiteralData }) {
  return (
    <ul className="dag-literal">
      {data.map((row, i) => (
        // Keyed by index: rows carry no id of their own, and the list is
        // read-only, so nothing ever reorders under React.
        <li key={i}>
          {typeof row === "string" ? (
            row
          ) : (
            <ul className="dag-literal-fields">
              {Object.entries(row).map(([key, value]) => (
                <li key={key}>
                  <span className="dag-literal-key">{key}</span>
                  {value}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

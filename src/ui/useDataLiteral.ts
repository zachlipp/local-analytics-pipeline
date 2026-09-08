import { useCallback, useMemo } from "react";

import {
  blankLiteralRecord,
  literalRecords,
  type LiteralRecord,
} from "@core/dataLiteral";
import { sameFields } from "@core/fix";
import { literalColumns } from "@core/runner";
import type { DataLiteralNode } from "@core/schema";
import { useNodeResult } from "./RunState";

export type { LiteralRecord };

export type DataLiteralEditor = {
  // The node's fixed fields, in declaration order. Never changes with edits.
  columns: string[];
  records: LiteralRecord[];
  setField: (index: number, column: string, value: string) => void;
  add: () => void;
  // A row with some fields already filled, appended at the end. Returns where
  // it went, or where the row saying the same thing already was.
  append: (record: LiteralRecord) => number;
  remove: (index: number) => void;
};

export function useDataLiteral(node: DataLiteralNode): DataLiteralEditor {
  const [result, report] = useNodeResult(node.id);
  const columns = useMemo(() => literalColumns(node), [node]);
  // The node's own rows, until the first edit replaces them wholesale.
  const defaults = useMemo(() => literalRecords(node), [node]);
  const records = result.literal ?? defaults;

  const setField = useCallback(
    (index: number, column: string, value: string) => {
      const next = records.map((row, i) =>
        i === index ? { ...row, [column]: value } : row,
      );
      report({ literal: next });
    },
    [records, report],
  );

  const append = useCallback(
    (record: LiteralRecord) => {
      // An empty record says nothing, so every row matches it. That is the
      // Add row button, which always wants a new one.
      const filled = Object.keys(record).length > 0;
      const at = filled
        ? records.findIndex((row) => sameFields(row, record))
        : -1;
      if (at !== -1) return at;
      report({
        literal: [...records, { ...blankLiteralRecord(node), ...record }],
      });
      return records.length;
    },
    [records, report, node],
  );

  // Wrapped rather than passed straight to onClick, which would hand `append`
  // a MouseEvent to merge into the row.
  const add = useCallback(() => {
    append({});
  }, [append]);

  const remove = useCallback(
    (index: number) => {
      report({ literal: records.filter((_, i) => i !== index) });
    },
    [records, report],
  );

  return { columns, records, setField, add, append, remove };
}

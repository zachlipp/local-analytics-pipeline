import { useCallback, useMemo } from "react";

import {
  blankLiteralRecord,
  literalRecords,
  type LiteralRecord,
} from "@core/dataLiteral";
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

  const add = useCallback(() => {
    report({ literal: [...records, blankLiteralRecord(node)] });
  }, [records, report, node]);

  const remove = useCallback(
    (index: number) => {
      report({ literal: records.filter((_, i) => i !== index) });
    },
    [records, report],
  );

  return { columns, records, setField, add, remove };
}

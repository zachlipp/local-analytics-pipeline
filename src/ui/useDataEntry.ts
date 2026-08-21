import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  entriesToCsv,
  frozenColumns,
  toRecords,
  type EntryRecord,
} from "@core/dataEntry";
import type { DataEntryNode } from "@core/schema";
import { useNodeResult } from "./RunState";

export type { EntryRecord };

export type DataEntry = {
  records: EntryRecord[];
  // The columns pinned left, resolved: the node's, or the key alone.
  frozen: string[];
  loading: boolean;
  // Why there are no records to enter, when that isn't an error.
  note?: string;
  error?: string;
  // The key of the row being worked on, if any.
  active?: string;
  // Committed marks, plus the active row's uncommitted ones.
  marks: Record<string, string[]>;
  entered: number;
  checked: (key: string, option: string) => boolean;
  toggle: (key: string, option: string) => void;
  select: (key: string) => void;
  saving: boolean;
  saveError?: string;
};

type Working = { key: string; marks: string[] };

export function useDataEntry(node: DataEntryNode, table: string): DataEntry {
  const [result, report] = useNodeResult(node.id);
  const committed = useMemo(() => result.entries ?? {}, [result.entries]);
  const frozen = useMemo(() => frozenColumns(node), [node]);

  const [records, setRecords] = useState<EntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  // One state, not an active key beside its pending marks: switching rows and
  // seeding the new row's marks has to be a single update.
  const [working, setWorking] = useState<Working>();

  useEffect(() => {
    let live = true;
    setLoading(true);
    setNote(undefined);
    setError(undefined);

    (async () => {
      try {
        const { queryRows, quote } = await import("./duckdb");
        const sql = `SELECT * FROM ${quote(node.input)}`;

        let rows;
        try {
          rows = await queryRows(sql);
        } catch (cause) {
          // Temporary, alongside mockTables.ts: seed the table this node
          // expects and try once more. Remove both once operations run.
          const seeded =
            import.meta.env.DEV &&
            missingTable(cause instanceof Error ? cause.message : String(cause)) &&
            (await (await import("./mockTables")).seedMockTable(node.input));
          if (!seeded) throw cause;
          rows = await queryRows(sql);
        }

        if (!live) return;
        setRecords(toRecords(rows, node));
        if (rows.length === 0) setNote(`${node.input} has no rows yet.`);
      } catch (cause) {
        if (!live) return;
        const message = cause instanceof Error ? cause.message : String(cause);
        setRecords([]);
        // A table that isn't there is the normal state until the operation
        // producing it has run, so it reads as a note rather than a failure.
        if (missingTable(message)) setNote(`Waiting on ${node.input}.`);
        else setError(message);
      } finally {
        if (live) setLoading(false);
      }
    })();

    return () => {
      live = false;
    };
  }, [node]);

  // The commit needs the latest of all of these without re-running on each
  // keystroke's worth of state, so it reads them through a ref.
  // report included: it gets a new identity on every store write, and commit
  // must not, or the unmount cleanup below fires on each one.
  const latest = useRef({ working, committed, records, table, node, report });
  useEffect(() => {
    latest.current = { working, committed, records, table, node, report };
  });

  const commit = useCallback((row?: Working) => {
    const now = latest.current;
    const target = row ?? now.working;
    if (!target) return;

    const next = { ...now.committed, [target.key]: target.marks };
    now.report({ entries: next });
    void save(now.node, now.table, now.records, next, setSaving, setSaveError);
  }, []);

  // Arrowing to the next slide unmounts this, which is another way of leaving
  // the row being worked on.
  useEffect(() => () => commit(), [commit]);

  // Revisit if people don't work a row at a time: this whole design assumes
  // leaving a row means you're done with it, so someone who fills one column
  // straight down the sheet commits a row on every single click.
  // The ref is written here as well as in the effect: one click can call both
  // of these, and the second must not read the row the first replaced.
  const start = useCallback((next: Working) => {
    setWorking(next);
    latest.current = { ...latest.current, working: next };
  }, []);

  const select = useCallback(
    (key: string) => {
      const { working, committed } = latest.current;
      if (working?.key === key) return;
      if (working) commit(working);
      start({ key, marks: committed[key] ?? [] });
    },
    [commit, start],
  );

  const toggle = useCallback(
    (key: string, option: string) => {
      const { working, committed } = latest.current;
      if (working && working.key !== key) commit(working);

      const marks =
        working?.key === key ? working.marks : (committed[key] ?? []);
      start({
        key,
        marks: marks.includes(option)
          ? marks.filter((o) => o !== option)
          : [...marks, option],
      });
    },
    [commit, start],
  );

  const marks = useMemo(
    () => (working ? { ...committed, [working.key]: working.marks } : committed),
    [committed, working],
  );

  return {
    records,
    frozen,
    loading,
    note,
    error,
    active: working?.key,
    marks,
    entered: Object.keys(marks).length,
    checked: (key, option) => (marks[key] ?? []).includes(option),
    toggle,
    select,
    saving,
    saveError,
  };
}

function missingTable(message: string): boolean {
  return /does not exist|not found|Catalog Error/i.test(message);
}

async function save(
  node: DataEntryNode,
  table: string,
  records: EntryRecord[],
  entries: Record<string, string[]>,
  setSaving: (saving: boolean) => void,
  setSaveError: (error?: string) => void,
) {
  setSaving(true);
  setSaveError(undefined);
  try {
    const { loadCsv } = await import("./duckdb");
    await loadCsv(table, entriesToCsv(node, records, entries));
  } catch (cause) {
    setSaveError(cause instanceof Error ? cause.message : String(cause));
  } finally {
    setSaving(false);
  }
}

import { checkRequiredColumns, requiredColumns } from "./constraints";
import { toCsv } from "./csv";
import { entriesToCsv, toRecords } from "./dataEntry";
import { quote, type Engine } from "./engine";
import type { Pipeline } from "./pipeline";
import { literalCsv, planRun, type RunTask } from "./runner";
import type { Dag } from "./schema";
import type { NodeResult } from "./status";

/** Row counts by table name, for the tasks that got built. */
export type RunCounts = Map<string, number>;

export type RunOutcome =
  | { ok: true; ran: RunCounts }
  | { ok: false; ran: RunCounts; failed: string; error: string };

/** Mirrors each task's progress into the run store, where status comes from. */
export type Report = (id: string, patch: NodeResult) => void;

/**
 * Materialize every table the target needs, then the target itself.
 *
 * Operations are always rebuilt — their query is the thing most likely to have
 * changed, and knowing otherwise would mean walking the whole chain above them.
 * Sources are skipped when their CSV is byte-for-byte what the table already
 * holds, which loadCsv decides on its own.
 *
 * The first failure stops the walk: everything downstream joins against the
 * table that didn't get built, so carrying on only buries the real error under
 * a pile of catalog errors.
 */
export async function runPipeline(
  engine: Engine,
  pipeline: Pipeline,
  dag: Dag,
  results: Record<string, NodeResult>,
  report: Report,
  target?: string,
): Promise<RunOutcome> {
  const ran: RunCounts = new Map();

  for (const task of planRun(pipeline, dag, target)) {
    const id = task.node.id;
    report(id, { running: true, error: undefined, invalid: undefined });

    try {
      const rows = await materialize(engine, task, results);
      const broken = await checkConstraints(engine, task);
      if (broken) {
        // The table built and is worth looking at; it just isn't usable.
        report(id, { running: false, table: task.name, rows, invalid: broken });
        return { ok: false, ran, failed: task.name, error: broken };
      }

      report(id, { running: false, table: task.name, rows });
      ran.set(task.name, rows);
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      report(id, { running: false, table: undefined, rows: undefined, error });
      return { ok: false, ran, failed: task.name, error };
    }
  }

  return { ok: true, ran };
}

/**
 * What's wrong with the table this task just built, if anything.
 *
 * Runs on every task, cache hit or not — the constraint may be the thing that
 * changed since the last run, and reading a table's column names is free.
 */
async function checkConstraints(
  engine: Engine,
  task: RunTask,
): Promise<string | undefined> {
  if (requiredColumns(task.node).length === 0) return undefined;
  const columns = await engine.columns(task.name);
  return checkRequiredColumns(task.name, task.node, columns);
}

/** Get one node's value into a table named for it. Returns the row count. */
async function materialize(
  engine: Engine,
  task: RunTask,
  results: Record<string, NodeResult>,
): Promise<number> {
  const { name, node, operation } = task;
  const result = results[node.id] ?? {};

  if (operation) return createTable(engine, name, operation.query);

  switch (node.kind) {
    case "file":
      if (!result.file) throw new Error(`No file uploaded for ${name}.`);
      return engine.loadCsv(name, result.file.text);

    case "data_literal":
      return engine.loadCsv(name, literalCsv(node));

    // A single cell, so an operation can join or compare against it the same
    // way it does anything else.
    case "user_input":
      return engine.loadCsv(name, toCsv(["value"], [{ value: result.value ?? "" }]));

    // A script with no schema returns a document, so there is nothing to load.
    case "script":
      if (!node.schema) return 0;
      if (!result.value) throw new Error(`${name} has not been run yet.`);
      return engine.loadCsv(name, result.value);

    // Rebuilt from the source table and the committed marks rather than
    // trusting whatever the grid last saved, so a run is reproducible from the
    // run store alone.
    case "data_entry": {
      const source = await engine.query(`SELECT * FROM ${quote(node.input)}`);
      const csv = entriesToCsv(
        node,
        toRecords(source, node),
        result.entries ?? {},
      );
      return engine.loadCsv(name, csv);
    }

    case "operation_result":
      throw new Error(`No operation produces ${name}.`);
  }
}

async function createTable(
  engine: Engine,
  name: string,
  query: string,
): Promise<number> {
  const sql = query.trim().replace(/;\s*$/, "");
  if (!sql) throw new Error(`The operation producing ${name} has no query.`);

  // This name may have been a source in an earlier version of the schema.
  engine.forget(name);
  await engine.query(`CREATE OR REPLACE TABLE ${quote(name)} AS ${sql}`);
  const [row] = await engine.query(`SELECT count(*) AS n FROM ${quote(name)}`);
  return Number(row?.n ?? 0);
}

/** The first rows of a materialized table, for showing the run worked. */
export async function previewTable(engine: Engine, name: string, limit = 5) {
  return engine.query(`SELECT * FROM ${quote(name)} LIMIT ${limit}`);
}

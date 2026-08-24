import { toCsv } from "./csv";
import { entriesToCsv, toRecords } from "./dataEntry";
import { quote, type Engine } from "./engine";
import type { Pipeline } from "./pipeline";
import { literalCsv, planRun, type RunTask } from "./runner";
import type { Dag, Schemas } from "./schema";
import {
  checkDeclaredColumns,
  declaredTypes,
  undeclaredColumns,
} from "./shapes";
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
      const { rows, dropped } = await materialize(
        engine,
        task,
        results,
        dag.schemas,
      );
      report(id, { running: false, table: task.name, rows, dropped });
      ran.set(task.name, rows);
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      report(id, { running: false, table: undefined, rows: undefined, error });
      return { ok: false, ran, failed: task.name, error };
    }
  }

  return { ok: true, ran };
}

/** What one node's table cost to build, and what the load had to throw away. */
type Materialized = { rows: number; dropped: string[] };

/** Get one node's value into a table named for it. */
async function materialize(
  engine: Engine,
  task: RunTask,
  results: Record<string, NodeResult>,
  schemas: Schemas,
): Promise<Materialized> {
  const { name, node, operation } = task;
  const result = results[node.id] ?? {};

  if (operation) {
    return { rows: await createTable(engine, name, operation.query), dropped: [] };
  }

  const types = declaredTypes(node, schemas);

  // A schema is the node's whole shape, so a column it names and the CSV lacks
  // is the file being wrong. Said here rather than left to read_csv's binder
  // error, which names the column but not the node or what it does have.
  const load = async (csv: string): Promise<Materialized> => {
    const broken = checkDeclaredColumns(name, types, csv);
    if (broken) throw new Error(broken);
    return {
      rows: await engine.loadCsv(name, csv, types),
      dropped: undeclaredColumns(types, csv),
    };
  };

  switch (node.kind) {
    case "file":
      if (!result.file) throw new Error(`No file uploaded for ${name}.`);
      return load(result.file.text);

    case "data_literal":
      return load(literalCsv(node));

    // A single cell, so an operation can join or compare against it the same
    // way it does anything else.
    case "user_input":
      return load(toCsv(["value"], [{ value: result.value ?? "" }]));

    // A script with no schema returns a document, so there is nothing to load.
    case "script":
      if (!node.schema) return { rows: 0, dropped: [] };
      if (!result.value) throw new Error(`${name} has not been run yet.`);
      return load(result.value);

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
      return load(csv);
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

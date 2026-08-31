import { isMap, isNode, isScalar, parseDocument, stringify } from "yaml";

import { toCsv } from "./csv";
import { literalYamlRows, type LiteralYamlRow } from "./dataLiteral";
import { literal, quote, type Engine } from "./engine";
import type { Dag, Node } from "./schema";
import type { NodeResult } from "./status";

export type ExportFile = { name: string; content: string };

// Splices only the span the edited node's `data:` value occupies; a whole-document round-trip is not byte-identical.
export function patchYaml(
  source: string,
  edits: Record<string, LiteralYamlRow[]> = {},
): string {
  const names = Object.keys(edits);
  if (names.length === 0) return source;

  const doc = parseDocument(source);
  const patches = names
    .map((name) => dataPatch(source, doc, name, edits[name]))
    .sort((a, b) => b.start - a.start);

  let text = source;
  for (const patch of patches) {
    text = text.slice(0, patch.start) + patch.text + text.slice(patch.end);
  }
  return text;
}

type Patch = { start: number; end: number; text: string };

// indentSeq: false plus re-indenting to the key's column reproduces this file's house style.
function dataPatch(
  source: string,
  doc: ReturnType<typeof parseDocument>,
  name: string,
  rows: LiteralYamlRow[],
): Patch {
  const map = doc.getIn(["nodes", name], true);
  const pair = isMap(map)
    ? map.items.find((p) => isScalar(p.key) && p.key.value === "data")
    : undefined;
  if (
    !pair ||
    !isScalar(pair.key) ||
    !isNode(pair.value) ||
    !pair.key.range ||
    !pair.value.range
  ) {
    throw new Error(
      `Cannot export "${name}": its data: field could not be located in the source YAML.`,
    );
  }
  const keyRange = pair.key.range;
  const valueRange = pair.value.range;

  const indent = columnOf(source, keyRange[0]);
  const pad = " ".repeat(indent);
  const text =
    rows.length === 0
      ? ": []"
      : `:\n${pad}${stringify(rows, { indentSeq: false, singleQuote: true })
          .trimEnd()
          .split("\n")
          .join(`\n${pad}`)}`;

  // Backed off valueRange[1], which runs past a trailing comment into the next key's indent.
  let end = valueRange[1];
  while (end > valueRange[0] && /\s/.test(source[end - 1])) end--;

  return { start: keyRange[1], end, text };
}

// The column a position sits in, which block sequences repeat on every later line.
function columnOf(source: string, pos: number): number {
  return pos - (source.lastIndexOf("\n", pos - 1) + 1);
}

export function exportedNodes(dag: Dag): Array<[string, Node]> {
  return Object.entries(dag.nodes).filter(([, node]) => node.export);
}

// Edited rows by node name; patchYaml only touches nodes named here.
function literalEdits(
  dag: Dag,
  results: Record<string, NodeResult>,
): Record<string, LiteralYamlRow[]> {
  const edits: Record<string, LiteralYamlRow[]> = {};
  for (const [name, node] of Object.entries(dag.nodes)) {
    if (node.kind !== "data_literal") continue;
    const rows = results[node.id]?.literal;
    if (rows) edits[name] = literalYamlRows(node, rows);
  }
  return edits;
}

// Asked of DuckDB rather than NodeResult.table, which a schemaless script sets.
async function hasTable(engine: Engine, name: string): Promise<boolean> {
  const rows = await engine.query(
    `SELECT count(*) AS n FROM information_schema.tables WHERE table_name = ${literal(name)}`,
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

// The YAML, plus one CSV per export:true node that has a table. Others skipped.
export async function buildExportFiles(
  engine: Engine,
  dag: Dag,
  source: string,
  results: Record<string, NodeResult> = {},
): Promise<ExportFile[]> {
  const files: ExportFile[] = [
    {
      name: `${dag.pipeline_name}.yaml`,
      content: patchYaml(source, literalEdits(dag, results)),
    },
  ];

  for (const [name] of exportedNodes(dag)) {
    if (!(await hasTable(engine, name))) continue;
    const columns = await engine.columns(name);
    const rows = await engine.query(`SELECT * FROM ${quote(name)}`);
    files.push({ name: `${name}.csv`, content: toCsv(columns, rows) });
  }

  return files;
}

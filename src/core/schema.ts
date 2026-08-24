import { z } from "zod";
import { stableUuid, uuid } from "@core/utils";
import { expandOptionSets, OptionSets } from "./optionSets";
import { SCRIPT_NAME } from "./scripts";

// From semver.org
export const semverRegex =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

const Identified = z.object({
  id: z
    .string()
    .uuid()
    .default(() => uuid()),
});

export const Described = Identified.extend({
  description: z.string(),
});

// TODO: Validate on node names
export const NodeInput = Identified.extend({
  kind: z.literal("node"),
  name: z.string(),
});

const FileNode = Described.extend({
  kind: z.literal("file"),
  // TODO: Implement schema matching
  schema: z.string().optional(),
  // Used if CORS prevents direct download (e.g. the IRS)
  source: z.url().optional(),
});

const UserInputNode = Described.extend({
  kind: z.literal("user_input"),
  user_input: z.string().optional(),
});

// Options are declared rather than inferred from the source columns: a node
// has to say what it asks for before anything upstream has run.
const UserDataEntryNode = Described.extend({
  kind: z.literal("data_entry"),
  input: z.string(),
  // Column identifying a record; what the marks are written against.
  key: z.string(),
  // Columns pinned to the left of the grid, in order. Defaults to the key.
  frozen: z.array(z.string()).default([]),
  // One checkbox column each, in the order they appear. Written inline or as
  // the name of an option set, which is expanded to this before parsing.
  options: z.array(z.string()),
  // Frozen column to the href its cell links to. `{column}` is replaced with
  // that record's value; the rest of the template is used as written.
  links: z.record(z.string(), z.string()).default({}),
}).superRefine((node, ctx) => {
  // frozenColumns() in ./dataEntry, inlined to keep this module free of it.
  const frozen = node.frozen.length > 0 ? node.frozen : [node.key];
  for (const column of Object.keys(node.links)) {
    if (frozen.includes(column)) continue;
    ctx.addIssue({
      code: "custom",
      path: ["links", column],
      message: `Only a frozen column can be a link. This grid pins: ${frozen.join(", ")}.`,
      input: node.links,
    });
  }
});

const OperationResultNode = Described.extend({
  kind: z.literal("operation_result"),
});

// A node whose value comes from JavaScript in this project rather than from a
// file, a query, or the user. `src` names a module under src/nodes/scripts.
const ScriptNode = Described.extend({
  kind: z.literal("script"),
  src: z
    .string()
    .regex(SCRIPT_NAME, "must be a bare script name, like `geocode`"),
  // The node whose rows the script is handed.
  input: z.string(),
  // Input columns the script reads, checked against that node's real shape
  // before anything runs. Nothing requires the list to be complete: a column
  // left out of it is simply unchecked.
  reads: z.array(z.string()).default([]),
  // Input columns the script is handed as a set rather than one at a time.
  // Written inline or as the name of an option set, like a data_entry node's.
  options: z.array(z.string()).default([]),
  // Declared when the script returns rows, so they can be loaded and queried.
  // Omitted when it returns a document, which has no columns and no table.
  schema: z.string().optional(),
  // Recorded by hand, for a reader who wants to know what leaves the machine.
  // Nothing verifies it.
  network: z.boolean().default(false),
});

const DataLiteralRow = z.record(z.string(), z.string());
const DataLiteralNode = Described.extend({
  kind: z.literal("data_literal"),
  // Column name for bare-string rows, which carry none of their own.
  column: z.string().default("value"),
  data: z.array(z.union([DataLiteralRow, z.string()])),
});

const OperationSchema = Described.extend({
  // TODO - must be node names
  inputs: z.array(z.string()),
  query: z.string(),
  output: z.string(),
});

// A named set of `column: TYPE` pairs. Nodes whose data arrives from outside
// the pipeline have no query to infer a shape from, so they point at one of
// these instead; everything an operation produces is inferred and never named
// here.
export const TableSchema = z.record(z.string(), z.string());

const EdgeSchema = Identified.extend({
  // TODO: More info
  from: z.string().uuid(),
  to: z.string().uuid(),
});

export const NodeSchema = z.discriminatedUnion("kind", [
  FileNode,
  UserInputNode,
  UserDataEntryNode,
  OperationResultNode,
  ScriptNode,
  DataLiteralNode,
]);

const Document = z
  .object({
    pipeline_name: z.string(),
    version: z.string().regex(semverRegex, "invalid semver"),
    option_sets: OptionSets.default({}),
    schemas: z.record(z.string(), TableSchema).default({}),
    nodes: z.record(z.string(), NodeSchema),
    operations: z.record(z.string(), OperationSchema),
  })
  // A node's name is the only handle on it that survives an edit, so the id is
  // derived from it. Left random, every re-parse would orphan that node's
  // upload in the run store and its row in IndexedDB.
  .transform((dag) => {
    for (const [name, node] of Object.entries(dag.nodes)) {
      node.id = stableUuid(name);
    }
    return dag;
  });

// Option sets are spread before anything else looks at the document, so the
// rest of the pipeline only ever sees the columns they expand to.
export const DagSchema = z.preprocess(
  (raw, ctx) =>
    expandOptionSets(raw, (path, message) =>
      ctx.addIssue({ code: "custom", path, message, input: raw }),
    ),
  Document,
);

export type Node = z.infer<typeof NodeSchema>;
export type Dag = z.infer<typeof DagSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export type ScriptNode = Extract<Node, { kind: "script" }>;
export type DataEntryNode = Extract<Node, { kind: "data_entry" }>;
export type DataLiteralNode = Extract<Node, { kind: "data_literal" }>;
export type Operation = z.infer<typeof OperationSchema>;
export type Schemas = Dag["schemas"];

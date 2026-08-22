import { z } from "zod";
import { stableUuid, uuid } from "@core/utils";

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

// What has to be true of a node's table before anything downstream may use it.
export const Constraints = z.object({
  required_columns: z.array(z.string()).default([]),
});

// Constraints hang on the node, not the operation: the node is the table, and
// a file has to be checkable without an operation to hang anything on.
const Constrained = Described.extend({
  constraints: Constraints.default({ required_columns: [] }),
});

const FileNode = Constrained.extend({
  kind: z.literal("file"),
  // TODO: Implement schema matching
  schema: z.string().optional(),
  // Used if CORS prevents direct download (e.g. the IRS)
  source: z.url().optional(),
});

const UserInputNode = Constrained.extend({
  kind: z.literal("user_input"),
  user_input: z.string().optional(),
});

// Options are declared rather than inferred from the source columns: a node
// has to say what it asks for before anything upstream has run.
const UserDataEntryNode = Constrained.extend({
  kind: z.literal("data_entry"),
  input: z.string(),
  // Column identifying a record; what the marks are written against.
  key: z.string(),
  // Columns pinned to the left of the grid, in order. Defaults to the key.
  frozen: z.array(z.string()).default([]),
  // One checkbox column each, in the order they appear.
  options: z.array(z.string()),
});

const OperationResultNode = Constrained.extend({
  kind: z.literal("operation_result"),
});

/**
 * The declarative half of a web_request node: enough to fetch a URL without
 * any code at all, which is what most of these need.
 *
 * `{{input}}` in the url or body is replaced with the value of the node named
 * by `input`, so one request can be parameterised without a script.
 */
const WebRequestSpec = z.object({
  url: z.string(),
  method: z.enum(["GET", "POST"]).default("GET"),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.string().optional(),
});

const WebRequestNode = Constrained.extend({
  kind: z.literal("web_request"),
  // Names an entry in the top-level `schemas:` block, same as a file does.
  schema: z.string().optional(),
  /**
   * Optional name of a node whose value parameterises this request. Unlike an
   * operation's inputs this is declared on the node itself, because there's no
   * operation here to hang it on — the fetch *is* the operation.
   */
  input: z.string(),
  request: WebRequestSpec.optional(),
  /**
   * Optional JavaScript, run on the response.
   *
   * The body of an async function receiving `{ input, response }` and
   * returning the node's value; with no `request` above it, it's on its own to
   * produce one. It runs in a sandboxed iframe rather than in the page — see
   * ui/sandbox.ts for what that does and doesn't buy.
   *
   * Both fields are optional and a node with neither is simply unconfigured,
   * which is what every web_request node was before this existed.
   */
  script: z.string().optional(),
});

const DataLiteralRow = z.record(z.string(), z.string());
const DataLiteralNode = Constrained.extend({
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
  WebRequestNode,
  DataLiteralNode,
]);

export const DagSchema = z
  .object({
    pipeline_name: z.string(),
    version: z.string().regex(semverRegex, "invalid semver"),
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

export type Node = z.infer<typeof NodeSchema>;
export type Dag = z.infer<typeof DagSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export type WebRequestNode = Extract<Node, { kind: "web_request" }>;
export type DataEntryNode = Extract<Node, { kind: "data_entry" }>;
export type DataLiteralNode = Extract<Node, { kind: "data_literal" }>;
export type Operation = z.infer<typeof OperationSchema>;
export type Schemas = Dag["schemas"];

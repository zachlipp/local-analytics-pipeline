import { z } from "zod";
import { uuid } from "@core/utils";
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
});

const UserInputNode = Described.extend({
  kind: z.literal("user_input"),
  // TODO: Does this make sense?
  input: z.string().optional(),
});

const OperationResultNode = Described.extend({
  kind: z.literal("operation_result"),
});

const WebRequestNode = Described.extend({
  kind: z.literal("web_request"),
});

const OperationSchema = Described.extend({
  // TODO - must be node names
  inputs: z.array(z.string()),
  query: z.string(),
  output: z.string(),
  // TODO: Add constraints object
  // constraints:
});

const EdgeSchema = Identified.extend({
  // TODO: More info
  from: z.string().uuid(),
  to: z.string().uuid(),
});

export const NodeSchema = z.discriminatedUnion("kind", [
  FileNode,
  UserInputNode,
  OperationResultNode,
  WebRequestNode,
]);

export const DagSchema = z.object({
  pipeline_name: z.string(),
  version: z.string().regex(semverRegex, "invalid semver"),
  nodes: z.record(z.string(), NodeSchema),
  operations: z.record(z.string(), OperationSchema),
});

export type Node = z.infer<typeof NodeSchema>;
export type Dag = z.infer<typeof DagSchema>;
export type Edge = z.infer<typeof EdgeSchema>;

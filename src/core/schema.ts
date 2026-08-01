import { z } from "zod";

// From semver.org
export const semverRegex =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

// TODO: Validate on node names
export const NodeInput = z.object({
  kind: z.literal("node"),
  name: z.string(),
});

const FileNode = z.object({
  kind: z.literal("file"),
  description: z.string(),
  // TODO: Implement schema matching
  schema: z.string().optional(),
});

const UserInputNode = z.object({
  kind: z.literal("user_input"),
  description: z.string(),
  // TODO: Does this make sense?
  input: z.string().optional(),
});

const OperationResultNode = z.object({
  kind: z.literal("operation_result"),
  description: z.string(),
  // TODO: Implement matching
  operation_name: z.string(),
});

const OperationSchema = z.object({
  description: z.string(),
  // TODO - must be node names
  inputs: z.array(z.string()),
  query: z.string(),
  // TODO: Add constraints object
  // constraints:
});

export const NodeSchema = z.discriminatedUnion("kind", [
  FileNode,
  UserInputNode,
  OperationResultNode,
]);

export const DagSchema = z.object({
  pipeline_name: z.string(),
  version: z.string().regex(semverRegex, "invalid semver"),
  nodes: z.record(z.string(), NodeSchema),
  operations: z.record(z.string(), OperationSchema),
});

export type Node = z.infer<typeof NodeSchema>;
export type Dag = z.infer<typeof DagSchema>;

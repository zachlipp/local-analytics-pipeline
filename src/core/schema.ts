import { z } from "zod";
import { uuid } from "@core/utils";
// From semver.org
export const semverRegex =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

const ObjectWithIdentifier = z.object({
  id: z
    .string()
    .uuid()
    .default(() => uuid()),
});

// TODO: Validate on node names
export const NodeInput = ObjectWithIdentifier.extend({
  kind: z.literal("node"),
  name: z.string(),
});

const FileNode = ObjectWithIdentifier.extend({
  kind: z.literal("file"),
  description: z.string(),
  // TODO: Implement schema matching
  schema: z.string().optional(),
});

const UserInputNode = ObjectWithIdentifier.extend({
  kind: z.literal("user_input"),
  description: z.string(),
  // TODO: Does this make sense?
  input: z.string().optional(),
});

const OperationResultNode = ObjectWithIdentifier.extend({
  kind: z.literal("operation_result"),
  description: z.string(),
});

const OperationSchema = ObjectWithIdentifier.extend({
  description: z.string(),
  // TODO - must be node names
  inputs: z.array(z.string()),
  query: z.string(),
  output: z.string(),
  // TODO: Add constraints object
  // constraints:
});

const EdgeSchema = ObjectWithIdentifier.extend({
  // TODO: More info
  from: z.string().uuid(),
  to: z.string().uuid(),
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
export type Edge = z.infer<typeof EdgeSchema>;

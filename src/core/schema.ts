import { z } from "zod";

// From semver.org
export const semverRegex =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

const VariableInput = z.object({
  kind: z.literal("variable"),
  name: z.string(),
});

// TODO: Validate on node names
const NodeInput = z.object({
  kind: z.literal("node"),
  name: z.string(),
});

export const TransformInput = z.discriminatedUnion("kind", [
  VariableInput,
  NodeInput,
]);

const FileNode = z.object({
  kind: z.literal("file"),
  // TODO: Implement schema matching
  schema: z.string().optional(),
  description: z.string().optional(),
});

const TransformNode = z.object({
  kind: z.literal("transform"),
  inputs: z.array(TransformInput).min(1),
  query: z.string(),
});

export const NodeSchema = z.discriminatedUnion("kind", [
  FileNode,
  TransformNode,
]);

export const DagSchema = z.object({
  version: z.string().regex(semverRegex, "invalid semver"),
  nodes: z.record(z.string(), NodeSchema),
});

export type TransformInput = z.infer<typeof TransformInput>;
export type Node = z.infer<typeof NodeSchema>;
export type Dag = z.infer<typeof DagSchema>;

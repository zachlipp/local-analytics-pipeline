import { z } from "zod";

// From semver.org
export const semverRegex =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

const LoadNode = z.object({
  kind: z.literal("load"),
  description: z.string().optional(),
});

const TransformNode = z.object({
  kind: z.literal("transform"),
  inputs: z.array(z.string()).min(1),
  query: z.string(),
});

export const NodeSchema = z.discriminatedUnion("kind", [
  LoadNode,
  TransformNode,
]);

export const DagSchema = z.object({
  version: z.string().regex(semverRegex, "invalid semver"),
  nodes: z.record(z.string(), NodeSchema),
});

export type Node = z.infer<typeof NodeSchema>;
export type Dag = z.infer<typeof DagSchema>;

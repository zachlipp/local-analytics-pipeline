import type { Dag, Node } from "./schema";

/**
 * The graph as something walkable.
 *
 * `constructEdges` flattens the DAG into a list of edges for React Flow to
 * draw, which loses the thing a step-by-step view needs: which nodes feed
 * which. This keeps both directions, keyed by node name, and owes nothing to
 * the renderer — the slideshow reads it, and so could a runner.
 */
export type PipelineNode = {
  name: string;
  /**
   * The parsed node, kept whole rather than flattened: it carries the id, the
   * description, and the per-kind payload a step needs to render its own
   * control, and it still narrows on `kind`.
   */
  node: Node;
  /** Names of the nodes feeding this one. */
  inputs: string[];
  /** Names of the nodes this one feeds. */
  outputs: string[];
  /**
   * Input names that match no node in the DAG. Skipping them keeps one typo
   * from sinking the whole graph, but the node is unrunnable until it's fixed
   * — which is what makes it INVALID rather than merely waiting.
   */
  missingInputs: string[];
  /** The operation producing this node, if one does. */
  operation?: string;
  /** Whether its value has to come from the person running the pipeline. */
  interactive: boolean;
};

export type PipelineStep = PipelineNode & {
  /**
   * How many rounds of waiting stand between this node and the start: 0 for
   * anything with no upstream, 1 for anything whose inputs are all stage 0,
   * and so on. Everything in a stage can be worked on at once.
   */
  stage: number;
};

export type Pipeline = {
  /** Keyed by node name, which is what operations reference. */
  nodes: Map<string, PipelineNode>;
  /**
   * Every node, in an order no node precedes its own inputs — following one
   * branch of the graph to its result before starting the next.
   */
  steps: PipelineStep[];
};

const INTERACTIVE_KINDS = new Set<Node["kind"]>([
  "file",
  "web_request",
  "user_input",
  "data_entry",
]);

export function buildPipeline(dag: Dag): Pipeline {
  const nodes = new Map<string, PipelineNode>();
  for (const [name, node] of Object.entries(dag.nodes)) {
    nodes.set(name, {
      name,
      node,
      inputs: [],
      outputs: [],
      missingInputs: [],
      interactive: INTERACTIVE_KINDS.has(node.kind),
    });
  }

  for (const [opName, op] of Object.entries(dag.operations)) {
    const output = nodes.get(op.output);
    // A reference to a node that doesn't exist is the validator's problem;
    // here it's skipped so one bad name can't sink the whole walk.
    if (!output) continue;
    output.operation = opName;

    for (const input of op.inputs) {
      const source = nodes.get(input);
      if (!source) {
        output.missingInputs.push(input);
        continue;
      }
      output.inputs.push(input);
      source.outputs.push(output.name);
    }
  }

  // These nodes carry their own input rather than being produced by an
  // operation, so they're wired here — this is what keeps one from being
  // walked before the value that parameterises it.
  for (const target of nodes.values()) {
    const node = target.node;
    if ("input" in node) {
      const source = nodes.get(node.input);
      if (!source) {
        target.missingInputs.push(node.input);
        continue;
      }
      target.inputs.push(node.input);
      source.outputs.push(target.name);
    }
  }

  return { nodes, steps: orderByFlow(nodes) };
}

/**
 * Depth-first over the graph, emitting a node after its inputs.
 *
 * Ordering by stage instead — every root, then everything one hop in — is also
 * a valid topological order, but it front-loads every upload and text box in
 * the pipeline before a single result appears. Following the flow means you
 * fill in one operation's inputs, watch it produce its output, and move on:
 * the same total work, arriving as visible progress.
 *
 * Inputs are visited in declaration order, so within a branch the walk follows
 * the YAML the user wrote.
 */
function orderByFlow(nodes: Map<string, PipelineNode>): PipelineStep[] {
  const stages = stageDepths(nodes);
  const steps: PipelineStep[] = [];
  const emitted = new Set<string>();
  // Nodes on the current descent. A DAG can't come back around to one, so
  // hitting it means a cycle — bail rather than recurse forever.
  const descending = new Set<string>();

  function visit(node: PipelineNode) {
    if (emitted.has(node.name) || descending.has(node.name)) return;
    descending.add(node.name);
    for (const input of node.inputs) visit(nodes.get(input)!);
    descending.delete(node.name);

    emitted.add(node.name);
    steps.push({ ...node, stage: stages.get(node.name) ?? 0 });
  }

  // From the ends backwards: a sink pulls in its whole branch, deepest first.
  // Isolated nodes are sinks too, so they're covered here.
  for (const node of nodes.values()) {
    if (node.outputs.length === 0) visit(node);
  }

  // Anything left is inside a cycle or only reachable through one. The graph
  // is supposed to be acyclic, but a bad one shouldn't cost the user the
  // slides they could still see.
  for (const node of nodes.values()) visit(node);

  return steps;
}

/**
 * How many rounds of waiting each node is from the start — Kahn's algorithm, a
 * whole wave at a time. Independent of the order the steps are presented in:
 * this says what *could* be worked on at once, not what comes next.
 */
function stageDepths(nodes: Map<string, PipelineNode>): Map<string, number> {
  const stages = new Map<string, number>();
  let stage = 0;

  while (stages.size < nodes.size) {
    const ready = [...nodes.values()].filter(
      (n) => !stages.has(n.name) && n.inputs.every((i) => stages.has(i)),
    );

    // A cycle: nothing is ready and nodes remain. Its members get no depth,
    // and orderByFlow falls back to 0 for them.
    if (ready.length === 0) break;

    for (const node of ready) stages.set(node.name, stage);
    stage++;
  }

  return stages;
}

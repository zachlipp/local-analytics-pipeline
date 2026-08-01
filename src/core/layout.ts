import dagre from "@dagrejs/dagre";

export type Direction = "LR" | "RL" | "TB" | "BT";

/**
 * A node to place. Sizes are measured from the DOM by the caller, because
 * only the caller has a DOM — this file stays pure so it can be tested in
 * the node environment core/ runs under.
 */
export type LayoutNode = { id: string; width: number; height: number };

export type LayoutEdge = { from: string; to: string };

export type LayoutOptions = {
  direction?: Direction;
  /** Gap between nodes within a rank. */
  nodeSep?: number;
  /** Gap between ranks. */
  rankSep?: number;
};

/**
 * Place nodes with dagre.
 *
 * Returns top-left corners: dagre reports centers, and React Flow positions
 * from the corner.
 */
export function layout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  { direction = "LR", nodeSep = 40, rankSep = 80 }: LayoutOptions = {},
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: nodeSep, ranksep: rankSep });

  nodes.forEach((n) => g.setNode(n.id, { width: n.width, height: n.height }));

  // An edge pointing at an unplaced node makes dagre invent a zero-sized one
  // and drags the layout toward it. Dangling references are the validator's
  // problem; here they're just skipped.
  edges.forEach((e) => {
    if (g.hasNode(e.from) && g.hasNode(e.to)) g.setEdge(e.from, e.to);
  });

  dagre.layout(g);

  return new Map(
    nodes.map((n) => {
      const { x, y, width, height } = g.node(n.id);
      return [n.id, { x: x - width / 2, y: y - height / 2 }];
    }),
  );
}

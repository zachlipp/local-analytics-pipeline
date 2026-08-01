import dagre from "@dagrejs/dagre";
import { Dag } from "./schema";
import { constructEdges } from "./graph";

export function layout(dag: Dag) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR" });
  const nodes = Object.values(dag.nodes);
  nodes.forEach((n) => g.setNode(n.id, { width: 200, height: 50 }));
  const edges = constructEdges(dag);
  edges.forEach((e) => g.setEdge(e.from, e.to));
  dagre.layout(g);

  return new Map(
    nodes.map((n) => {
      const { x, y, width, height } = g.node(n.id);
      return [n.id, { x: x - width / 2, y: y - height / 2 }];
    }),
  );
}

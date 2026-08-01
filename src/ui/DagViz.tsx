import { useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
// Must come after the library stylesheet — it overrides React Flow defaults.
import "./DagViz.css";

import { constructEdges } from "@core/graph";
import { layout, type Direction, type LayoutEdge } from "@core/layout";
import type { Dag, Node } from "@core/schema";

type DagNodeData = {
  name: string;
  kind: Node["kind"];
  description: string;
};

type DagFlowNode = FlowNode<DagNodeData, "dagNode">;

export function DagViz({
  dag,
  direction = "LR",
}: {
  dag: Dag;
  direction?: Direction;
}) {
  // useNodesInitialized and useReactFlow read the React Flow store, which only
  // exists below a provider. <ReactFlow> makes its own, but we need the store
  // in the component that renders it, so the provider goes one level up.
  return (
    <ReactFlowProvider>
      <DagFlow dag={dag} direction={direction} />
    </ReactFlowProvider>
  );
}

function DagFlow({ dag, direction }: { dag: Dag; direction: Direction }) {
  // constructEdges() mints fresh uuids on every call, so this must be memoised
  // or every render would hand React Flow brand-new edge keys.
  const graph = useMemo(() => toFlowGraph(dag, direction), [dag, direction]);

  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);

  // Nodes start stacked at the origin and only get real positions once the
  // browser has told us how big they are. `placed` hides that first frame.
  const [placed, setPlaced] = useState(false);

  useEffect(() => {
    setPlaced(false);
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph, setNodes, setEdges]);

  const nodesInitialized = useNodesInitialized();
  const { fitView } = useReactFlow();

  // Rounded, because measured sizes are fractional and sub-pixel wobble would
  // otherwise re-trigger the layout effect forever.
  const sizes = useMemo(() => nodes.map(measure), [nodes]);
  const sizeKey = sizes.map((s) => `${s.id}:${s.width}x${s.height}`).join("|");

  // Runs once every node has been measured, and again whenever those
  // measurements change — React Flow's per-node ResizeObserver keeps
  // `measured` current, so content or font changes land here on their own.
  //
  // This writes positions and never sizes, so it cannot change sizeKey and
  // cannot re-trigger itself. Depending on `nodes` instead would spin.
  useEffect(() => {
    if (!nodesInitialized) return;

    const positions = layout(sizes, graph.layoutEdges, { direction });
    setNodes((ns) =>
      ns.map((n) => {
        const position = positions.get(n.id);
        return position ? { ...n, position } : n;
      }),
    );
    setPlaced(true);
    // sizes is rebuilt every render; sizeKey is the value that actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodesInitialized, sizeKey, direction, graph.layoutEdges, setNodes]);

  // A frame later, so the viewport is fitted to the positions we just wrote
  // rather than the ones being replaced.
  useEffect(() => {
    if (!placed) return;
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.15, duration: 200 });
    });
    return () => cancelAnimationFrame(frame);
  }, [placed, sizeKey, fitView]);

  return (
    <div className="dag-viz" style={{ opacity: placed ? 1 : 0 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        // The graph renders a pipeline definition; it isn't an editor.
        nodesConnectable={false}
        deleteKeyCode={null}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.4} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

// Rounded corners on the routing, arrowheads at the target. Stable identity,
// since React Flow treats a new object here as changed edge options.
const defaultEdgeOptions = {
  type: "smoothstep",
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
} as const;

function DagFlowNodeView({
  data,
  sourcePosition,
  targetPosition,
}: NodeProps<DagFlowNode>) {
  return (
    <div className="dag-node" data-kind={data.kind}>
      <Handle type="target" position={targetPosition ?? Position.Left} />
      <div className="dag-node-name">{data.name}</div>
      <div className="dag-node-kind">{data.kind}</div>
      {data.description && (
        <div className="dag-node-description">{data.description}</div>
      )}
      <Handle type="source" position={sourcePosition ?? Position.Right} />
    </div>
  );
}

// Must be stable across renders, or React Flow remounts every node.
const nodeTypes = { dagNode: DagFlowNodeView };

function measure(n: DagFlowNode) {
  return {
    id: n.id,
    width: Math.round(n.measured?.width ?? 0),
    height: Math.round(n.measured?.height ?? 0),
  };
}

function toFlowGraph(
  dag: Dag,
  direction: Direction,
): { nodes: DagFlowNode[]; edges: FlowEdge[]; layoutEdges: LayoutEdge[] } {
  const [sourcePosition, targetPosition] = handlePositions(direction);
  const dagEdges = constructEdges(dag);

  const nodes: DagFlowNode[] = Object.entries(dag.nodes).map(([name, node]) => ({
    id: node.id,
    type: "dagNode",
    // Placeholder until the first layout pass; `placed` keeps it off screen.
    position: { x: 0, y: 0 },
    sourcePosition,
    targetPosition,
    data: { name, kind: node.kind, description: node.description },
  }));

  const edges: FlowEdge[] = dagEdges.map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
  }));

  return { nodes, edges, layoutEdges: dagEdges };
}

/** Which side edges leave from and arrive at, for a given rank direction. */
function handlePositions(direction: Direction): [Position, Position] {
  switch (direction) {
    case "LR":
      return [Position.Right, Position.Left];
    case "RL":
      return [Position.Left, Position.Right];
    case "TB":
      return [Position.Bottom, Position.Top];
    case "BT":
      return [Position.Top, Position.Bottom];
  }
}

import { useEffect, useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { constructEdges } from "@core/graph";
import { layout } from "@core/layout";
import type { Dag, Node } from "@core/schema";

// layout() asks dagre to place boxes of exactly this size, so the rendered
// node has to be exactly this size too or the spacing dagre computed is wrong.
// Keep in sync with src/core/layout.ts.
const NODE_WIDTH = 200;
const NODE_HEIGHT = 50;

// layout() hardcodes rankdir "LR", so edges leave on the right and arrive on
// the left. These move together with that setting.
const SOURCE_POSITION = Position.Right;
const TARGET_POSITION = Position.Left;

type DagNodeData = {
  name: string;
  kind: Node["kind"];
  description: string;
};

type DagFlowNode = FlowNode<DagNodeData, "dagNode">;

function DagFlowNodeView({ data }: NodeProps<DagFlowNode>) {
  return (
    <div className="dag-node" data-kind={data.kind} style={boxStyle}>
      <Handle type="target" position={TARGET_POSITION} />
      <div className="dag-node-name">{data.name}</div>
      <div className="dag-node-kind">{data.kind}</div>
      <Handle type="source" position={SOURCE_POSITION} />
    </div>
  );
}

// Must be stable across renders; React Flow remounts every node otherwise.
const nodeTypes = { dagNode: DagFlowNodeView };

export function DagViz({ dag }: { dag: Dag }) {
  // constructEdges() mints fresh uuids on every call, so this has to be
  // memoised or each render would hand React Flow brand-new edge keys.
  const graph = useMemo(() => toFlowGraph(dag), [dag]);

  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);

  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph, setNodes, setEdges]);

  return (
    <div className="dag-viz" style={{ height: "70vh" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        // The graph is a rendering of the pipeline definition, not an editor.
        nodesConnectable={false}
        deleteKeyCode={null}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

function toFlowGraph(dag: Dag): { nodes: DagFlowNode[]; edges: FlowEdge[] } {
  const positions = layout(dag);

  const nodes: DagFlowNode[] = Object.entries(dag.nodes).map(([name, node]) => ({
    id: node.id,
    type: "dagNode",
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    sourcePosition: SOURCE_POSITION,
    targetPosition: TARGET_POSITION,
    data: { name, kind: node.kind, description: node.description },
  }));

  const edges: FlowEdge[] = constructEdges(dag).map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
  }));

  return { nodes, edges };
}

// Geometry only — everything cosmetic belongs to .dag-node in App.css.
const boxStyle = {
  width: NODE_WIDTH,
  height: NODE_HEIGHT,
  boxSizing: "border-box",
} as const;

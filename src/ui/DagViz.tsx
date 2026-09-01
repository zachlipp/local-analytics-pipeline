import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { buildPipeline } from "@core/pipeline";
import type { Dag, Node } from "@core/schema";
import { nodeStatuses, type Status } from "@core/status";
import { DataLiteral } from "./DataLiteral";
import { useRoute } from "./route";
import { useNodeResult, useRun } from "./RunState";
import { SourceLink } from "./SourceLink";
import { Spinner } from "./Spinner";
import { StatusBadge } from "./StatusBadge";
import { useFileUpload } from "./useFileUpload";

type DagNodeData = {
  name: string;
  kind: Node["kind"];
  description: string;
  literal?: Extract<Node, { kind: "data_literal" }>["data"];
  /** Where a file node's file comes from, if the pipeline says. */
  source?: string;
  /** Injected at render time, not built with the node — it changes per run. */
  status?: Status;
};

type DagFlowNode = FlowNode<DagNodeData, "dagNode">;

/** The operation behind one bundle of edges — everything sharing a target. */
type EdgeGroup = {
  name: string;
  description: string;
  inputs: string[];
  output: string;
  query: string;
};

/** Which bundle is under the cursor, and where to put the tooltip. */
type EdgeHover = { target: string; x: number; y: number };

export function DagViz({
  dag,
  direction = "LR",
  showUnreached = false,
  margin = 70,
}: {
  dag: Dag;
  direction?: Direction;
  /** Whether unreached nodes are shown before the user touches the toggle. */
  showUnreached?: boolean;
  /** Gap in pixels between the canvas edge and the graph's top-left corner. */
  margin?: number;
}) {
  // useNodesInitialized reads the React Flow store, which only
  // exists below a provider. <ReactFlow> makes its own, but we need the store
  // in the component that renders it, so the provider goes one level up.
  return (
    <ReactFlowProvider>
      <DagFlow
        dag={dag}
        direction={direction}
        showUnreached={showUnreached}
        margin={margin}
      />
    </ReactFlowProvider>
  );
}

function DagFlow({
  dag,
  direction,
  showUnreached: initialShowUnreached,
  margin,
}: {
  dag: Dag;
  direction: Direction;
  showUnreached: boolean;
  margin: number;
}) {
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

  // Status comes from the shared run store, so a file uploaded in the slides
  // view is already reflected here. Keyed by name; the flow nodes carry ids,
  // which is what statusById bridges.
  const { results } = useRun();
  const [, navigate] = useRoute();
  const pipeline = useMemo(() => buildPipeline(dag), [dag]);

  // The graph is the map; a double click walks to that node's slide. Single
  // click stays selection, and the file drop inside a node still works.
  const openStep = useCallback(
    (_: React.MouseEvent, node: DagFlowNode) =>
      navigate({ view: "steps", step: node.data.name }),
    [navigate],
  );
  const statusById = useMemo(() => {
    const byName = nodeStatuses(pipeline, results);
    const byId = new Map<string, Status>();
    for (const { name, node } of pipeline.nodes.values()) {
      byId.set(node.id, byName.get(name) ?? "UNREACHED");
    }
    return byId;
  }, [pipeline, results]);

  // Unreached means blocked on something upstream, so hiding it leaves the
  // work that can be done now plus the work already done.
  const [showUnreached, setShowUnreached] = useState(initialShowUnreached);
  const unreachedCount = [...statusById.values()].filter(
    (s) => s === "UNREACHED",
  ).length;

  // Nodes no edge touches at either end. They're part of the pipeline but sit
  // apart from its flow, so the toolbar can drop them to tighten the graph.
  const connected = useMemo(() => {
    const ids = new Set<string>();
    for (const e of graph.edges) {
      ids.add(e.source);
      ids.add(e.target);
    }
    return ids;
  }, [graph.edges]);

  const [showIsolated, setShowIsolated] = useState(true);
  const isolatedCount = graph.nodes.length - connected.size;

  // Both filters at once, so the node array is walked once and the layout
  // below can ask the same question.
  const visible = useCallback(
    (id: string) =>
      (showIsolated || connected.has(id)) &&
      (showUnreached || statusById.get(id) !== "UNREACHED"),
    [showIsolated, connected, showUnreached, statusById],
  );

  // `hidden` rather than dropping them from the array: React Flow keeps a
  // hidden node's measurements, so toggling back doesn't cost a re-measure.
  const renderedNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        hidden: !visible(n.id),
        data: { ...n.data, status: statusById.get(n.id) ?? "UNREACHED" },
      })),
    [nodes, visible, statusById],
  );

  const [hover, setHover] = useState<EdgeHover | null>(null);
  // A clicked bundle stays lit after the cursor leaves. It outranks hover, so
  // moving over other edges can't steal the highlight while one is pinned.
  const [pinned, setPinned] = useState<EdgeHover | null>(null);
  const active = pinned ?? hover;
  const container = useRef<HTMLDivElement>(null);

  const [positions, setPositions] = useState<Map<
    string,
    { x: number; y: number }
  > | null>(null);

  // Rounded, so sub-pixel wobble can't spin the fit effect.
  const [box, setBox] = useState<{ width: number; height: number } | null>(
    null,
  );

  useEffect(() => {
    const el = container.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      setBox((b) =>
        b && b.width === width && b.height === height ? b : { width, height },
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Hovering one edge lights the whole bundle and dims the rest, so a fan-in
  // reads as the single operation it is. Derived rather than stored, to keep
  // this out of the edge state that onEdgesChange owns.
  const renderedEdges = useMemo(() => {
    if (!active) return edges;
    return edges.map((e) =>
      e.target === active.target
        ? { ...e, className: "dag-edge-active", zIndex: 1 }
        : { ...e, className: "dag-edge-muted" },
    );
  }, [edges, active]);

  // React Flow reports client coordinates; the tooltip is positioned inside
  // the canvas, so it needs them relative to that box.
  function pointer(event: React.MouseEvent) {
    const box = container.current?.getBoundingClientRect();
    return {
      x: event.clientX - (box?.left ?? 0),
      y: event.clientY - (box?.top ?? 0),
    };
  }

  function onEdgeHover(event: React.MouseEvent, edge: FlowEdge) {
    // While pinned the tooltip stays put; tracking the cursor would drag it
    // away from the bundle it describes.
    if (pinned) return;
    setHover({ target: edge.target, ...pointer(event) });
  }

  // Clicking the same bundle again releases it, so the edge that pinned it is
  // also the one that lets it go.
  function onEdgeClick(event: React.MouseEvent, edge: FlowEdge) {
    const at = { target: edge.target, ...pointer(event) };
    setPinned((p) => (p?.target === edge.target ? null : at));
  }

  const hoveredGroup = active ? graph.groups[active.target] : undefined;

  const nodesInitialized = useNodesInitialized();
  const { setViewport } = useReactFlow();

  // Rounded, because measured sizes are fractional and sub-pixel wobble would
  // otherwise re-trigger the layout effect forever.
  // Hidden nodes are left out so dagre closes the space they'd otherwise hold
  // open. Nothing dangles: an isolated node is by definition on no edge.
  const sizes = useMemo(
    () => nodes.filter((n) => visible(n.id)).map(measure),
    [nodes, visible],
  );
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
    setPositions(positions);
    // sizes is rebuilt every render; sizeKey is the value that actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodesInitialized, sizeKey, direction, graph.layoutEdges, setNodes]);

  // Separate from the layout pass so a resize re-fits without re-running dagre.
  // A stale box is the whole bug: the first measurement can predate the final
  // canvas size, and the fit computed from it never gets corrected otherwise.
  useEffect(() => {
    if (!positions || !box) return;

    const viewport = fitLeftmost(positions, sizes, box, margin);
    // No duration: the graph appears where it will stay instead of flying there.
    if (viewport) setViewport(viewport);
    setPlaced(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, sizeKey, box, margin, setViewport]);

  return (
    <>
      <div className="dag-viz-toolbar">
        <button
          type="button"
          className="dag-viz-toggle"
          onClick={() => setShowUnreached((s) => !s)}
          aria-pressed={!showUnreached}
          disabled={unreachedCount === 0}
        >
          {showUnreached ? "Hide" : "Show"} unreached nodes ({unreachedCount})
        </button>
        <button
          type="button"
          className="dag-viz-toggle"
          onClick={() => setShowIsolated((s) => !s)}
          aria-pressed={!showIsolated}
          disabled={isolatedCount === 0}
        >
          {showIsolated ? "Hide" : "Show"} unconnected nodes ({isolatedCount})
        </button>
      </div>

      <div
        className="dag-viz"
        ref={container}
        style={{ opacity: placed ? 1 : 0 }}
      >
        <ReactFlow
          nodes={renderedNodes}
          edges={renderedEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          onEdgeMouseEnter={onEdgeHover}
          onEdgeMouseMove={onEdgeHover}
          onEdgeClick={onEdgeClick}
          onNodeDoubleClick={openStep}
          onEdgeMouseLeave={() => setHover(null)}
          // Clicking empty canvas dismisses a pinned bundle.
          onPaneClick={() => setPinned(null)}
          // The graph renders a pipeline definition; it isn't an editor.
          nodesConnectable={false}
          deleteKeyCode={null}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1.4} />
          <Controls showInteractive={false} />
        </ReactFlow>

        {active && hoveredGroup && (
          <EdgeTooltip group={hoveredGroup} x={active.x} y={active.y} />
        )}
      </div>
    </>
  );
}

// Rounded corners on the routing, arrowheads at the target. Stable identity,
// since React Flow treats a new object here as changed edge options.
const defaultEdgeOptions = {
  type: "smoothstep",
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
} as const;

function DagFlowNodeView({
  id,
  data,
  sourcePosition,
  targetPosition,
}: NodeProps<DagFlowNode>) {
  // The uploaded file lives in the run store, not here: the slides view shows
  // the same node, and the status badge is derived from the same fact.
  const [result, report] = useNodeResult(id);
  const { file, running: uploading, error } = result;
  const { dragging, onChange, drop } = useFileUpload(report);

  return (
    <div className="dag-node" data-kind={data.kind} data-status={data.status}>
      <Handle type="target" position={targetPosition ?? Position.Left} />
      <div className="dag-node-name">{data.name}</div>
      <div className="dag-node-kind">
        {data.kind}
        {data.status && <StatusBadge status={data.status} />}
      </div>
      {data.description && (
        <div className="dag-node-description">{data.description}</div>
      )}
      {data.kind === "file" && (
        <>
          {data.source && (
            <div className="dag-node-source">
              <SourceLink href={data.source} />
            </div>
          )}
          <label className="upload nodrag" data-dragging={dragging} {...drop}>
            {uploading ? "Uploading" : dragging ? "Drop it" : "Upload or drop"}
            {uploading && <Spinner label="Uploading" />}
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={uploading}
              onChange={onChange}
            />
            {file && !uploading && (
              <div className="dag-node-file">{file.name}</div>
            )}
            {error && <div className="dag-node-file-error">{error}</div>}
          </label>
        </>
      )}
      {data.kind === "user_input" && (
        <input
          // nodrag: without it React Flow swallows the mousedown and you
          // can't place the caret or select text.
          className="dag-node-input nodrag"
          type="text"
          value={result.value ?? ""}
          placeholder={data.name}
          aria-label={data.name}
          onChange={(e) => report({ value: e.target.value })}
        />
      )}
      {data.kind === "data_literal" && data.literal && (
        <div className="dag-node-data">
          <DataLiteral data={data.literal} />
        </div>
      )}
      <Handle type="source" position={sourcePosition ?? Position.Right} />
    </div>
  );
}

// Must be stable across renders, or React Flow remounts every node.
const nodeTypes = { dagNode: DagFlowNodeView };

function EdgeTooltip({
  group,
  x,
  y,
}: {
  group: EdgeGroup;
  x: number;
  y: number;
}) {
  return (
    <div className="dag-edge-tooltip" style={{ left: x, top: y }}>
      <div className="dag-edge-tooltip-name">{group.name}</div>
      {group.description && (
        <p className="dag-edge-tooltip-description">{group.description}</p>
      )}
      <div className="dag-edge-tooltip-io">
        <pre>
          <code>{group.query}</code>
        </pre>
      </div>
    </div>
  );
}

// The leftmost rank sets the zoom: fit its full height between the top and
// bottom margins, then pan so its left edge sits one margin in. Zooming past 1
// would just magnify the nodes, so that's the ceiling.
function fitLeftmost(
  positions: Map<string, { x: number; y: number }>,
  sizes: { id: string; width: number; height: number }[],
  box: { width: number; height: number } | undefined,
  margin: number,
) {
  if (!box) return null;

  const placed = sizes.flatMap((s) => {
    const at = positions.get(s.id);
    return at ? [{ ...s, ...at }] : [];
  });
  if (placed.length === 0) return null;

  // By centre, not by left edge: dagre gives a rank one centre line, and the
  // corners it returns are that centre minus each node's own half-width.
  const centre = (n: (typeof placed)[number]) => n.x + n.width / 2;
  const first = Math.min(...placed.map(centre));
  const rank = placed.filter((n) => centre(n) <= first + 1);

  const left = Math.min(...rank.map((n) => n.x));
  const top = Math.min(...rank.map((n) => n.y));
  const bottom = Math.max(...rank.map((n) => n.y + n.height));

  // Proportional, so a short canvas doesn't spend most of its height on margin.
  const m = Math.min(margin, box.height * 0.08);
  const zoom = Math.max(
    0.35,
    Math.min(1, (box.height - 2 * m) / (bottom - top)),
  );
  return { x: m - left * zoom, y: m - top * zoom, zoom };
}

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
): {
  nodes: DagFlowNode[];
  edges: FlowEdge[];
  layoutEdges: LayoutEdge[];
  groups: Record<string, EdgeGroup>;
} {
  const [sourcePosition, targetPosition] = handlePositions(direction);
  const dagEdges = constructEdges(dag);

  // Every edge into a node was produced by the operation that outputs it, so
  // grouping edges by target is the same thing as grouping them by operation.
  // Keyed by target node id, which is what the edges carry.
  const groups: Record<string, EdgeGroup> = {};
  for (const [name, op] of Object.entries(dag.operations)) {
    const output = dag.nodes[op.output];
    if (!output) continue;
    groups[output.id] = {
      name,
      description: op.description,
      inputs: op.inputs,
      output: op.output,
      query: op.query,
    };
  }

  const nodes: DagFlowNode[] = Object.entries(dag.nodes).map(
    ([name, node]) => ({
      id: node.id,
      type: "dagNode",
      // Placeholder until the first layout pass; `placed` keeps it off screen.
      position: { x: 0, y: 0 },
      sourcePosition,
      targetPosition,
      data: {
        name,
        kind: node.kind,
        description: node.description,
        literal: node.kind === "data_literal" ? node.data : undefined,
        source: node.kind === "file" ? node.source : undefined,
      },
    }),
  );

  const edges: FlowEdge[] = dagEdges.map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
  }));

  return { nodes, edges, layoutEdges: dagEdges, groups };
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

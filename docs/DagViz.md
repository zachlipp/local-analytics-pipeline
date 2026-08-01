# `src/ui/DagViz.tsx`, explained

A walkthrough of the DAG renderer, aimed at someone comfortable with
programming but new to React and to xyflow. It covers what the file does, why
it's shaped the way it is, and where it should be broken up later.

## What this file is for

`DagViz.tsx` is the only place in the DAG-rendering path that touches the
browser. Everything under `src/core/` is pure data: `schema.ts` describes what a
pipeline *is*, `graph.ts` turns operations into edges, `layout.ts` asks dagre
where boxes should go. None of them know what a pixel is — that's deliberate, and
it's why `vite.config.ts` runs the `core/` tests in a Node environment, so a
stray `window` reference fails loudly.

This file bridges that pure world to the screen. Its job is translation in three
directions:

1. Your `Dag` → the shapes React Flow wants (`Node[]`, `Edge[]`).
2. The browser's measurements → the numbers `layout()` needs.
3. Mouse events → visual state (highlighting, tooltips).

The dependency arrow points one way only: `DagViz.tsx` → `layout.ts` → dagre.
Nothing in `core/` imports anything from `ui/`.

## A little React vocabulary first

Four ideas explain most of the file.

- **Component** — a function that returns markup. `DagViz`, `DagFlow`,
  `EdgeTooltip`, and `DagFlowNodeView` are components. React calls them, and
  calls them *again* every time something changes. A component function may run
  hundreds of times in a session.
- **State** (`useState`) — a value React remembers *between* those calls.
  `const [hover, setHover] = useState(null)` gives you the current value and a
  setter. Calling the setter means "things changed, re-run this component."
- **Effect** (`useEffect`) — code that runs *after* React has painted, for work
  that isn't "return markup": measuring the DOM, timers, subscriptions. It takes
  a dependency array, and re-runs only when one of those values changes.
- **Memo** (`useMemo`) — "don't recompute this unless these inputs changed."
  Sometimes for speed, but here mostly for *identity*, which matters more than
  you'd expect.

## The identity problem, because it explains three things here

In JavaScript, `{a: 1} === {a: 1}` is `false`. Two objects with identical
contents are still different objects. React leans on this constantly: it decides
"did this change?" by comparing with `===`, not by inspecting contents.

That's why these live at module level rather than inside the component:

```tsx
const nodeTypes = { dagNode: DagFlowNodeView };
const defaultEdgeOptions = { type: "smoothstep", markerEnd: { ... } } as const;
```

If they were declared inside `DagFlow`, a fresh object would be built on every
render, React Flow would conclude "the node types changed!", and it would unmount
and remount every node — losing focus in your text inputs and restarting
animations on every keystroke. At module level they're created once.

The same reasoning drives:

```tsx
const graph = useMemo(() => toFlowGraph(dag, direction), [dag, direction]);
```

`toFlowGraph` calls `constructEdges`, which mints a fresh `uuid()` for every edge
each time it runs. Without the memo, every render would hand React Flow edges
with brand-new IDs, and React Flow would think all the edges were deleted and
different ones created. The memo pins it: recompute only when `dag` or
`direction` actually changes.

## Why there are two components

```tsx
export function DagViz({ dag, direction = "LR" }) {
  return (
    <ReactFlowProvider>
      <DagFlow dag={dag} direction={direction} />
    </ReactFlowProvider>
  );
}
```

React Flow keeps its internal state — positions, zoom, measurements — in a store.
Hooks like `useNodesInitialized` and `useReactFlow` read that store, and only work
*inside* a `<ReactFlowProvider>`.

`<ReactFlow>` creates a provider internally, but only for its own children.
`DagFlow` needs those hooks in the same component that *renders* `<ReactFlow>`,
which is outside that internal provider. So we hoist the provider one level up.
`DagViz` is a thin wrapper that exists purely for this.

## `toFlowGraph`: the translation layer

A plain function, no React involved, that takes a `Dag` and returns everything
the component needs:

| Field | What it is |
| --- | --- |
| `nodes` | React Flow nodes, all at position `(0, 0)` for now |
| `edges` | React Flow edges (`source`/`target`, its naming for `from`/`to`) |
| `layoutEdges` | The same edges in `layout()`'s vocabulary (`from`/`to`) |
| `initialValues` | Default text for each `user_input` node |
| `groups` | Operation metadata, keyed by the node it outputs |

Two translation details are worth naming. React Flow calls edge ends
`source`/`target` while `core/schema.ts` calls them `from`/`to`, so edges get
mapped twice — once for rendering, once for layout. And node *names* (the YAML
keys, like `historic_grants`) are not node *ids* (the UUIDs from the schema).
Edges reference ids; the name is carried along in `data.name` for display. Any
lookup that crosses between the two has to go through `dag.nodes[name].id`, which
is what the `groups` loop does.

## The heart of the file: measure, then place

This is the part worth understanding properly.

Dagre needs to know how big each box is before it can decide where the boxes go.
But the boxes are HTML — their size depends on font, padding, and how text wraps —
and nothing knows that until the browser has laid them out. Circular dependency.

The way out is to render twice.

**Pass one — measure.** `toFlowGraph` creates every node at `position: {x: 0, y:
0}`, all stacked at the origin. Note what it *doesn't* set: no `width`, no
`height`. Setting those would pin the node; leaving them off lets the browser
size each card from its CSS and content. React Flow puts a `ResizeObserver` on
every node's DOM element and writes what it finds into `node.measured`.

Because that first frame is a pile of overlapping cards, the container is held at
`opacity: 0` until the first layout lands:

```tsx
<div className="dag-viz" ref={container} style={{ opacity: placed ? 1 : 0 }}>
```

The nodes still render and still get measured — `opacity: 0` hides them without
removing them from layout, which `display: none` would.

**Pass two — place.** `useNodesInitialized()` flips to `true` once every node has
been measured. That's the cue:

```tsx
useEffect(() => {
  if (!nodesInitialized) return;
  const positions = layout(sizes, graph.layoutEdges, { direction });
  setNodes((ns) => ns.map((n) => {
    const position = positions.get(n.id);
    return position ? { ...n, position } : n;
  }));
  setPlaced(true);
}, [nodesInitialized, sizeKey, direction, graph.layoutEdges, setNodes]);
```

This effect writes **positions and only positions**. That's not a stylistic
choice — it's what stops the whole thing spinning forever.

### The infinite-loop hazard, and `sizeKey`

Think about what would happen with `nodes` in the dependency array. The effect
calls `setNodes`, which produces a new `nodes` array, which is a new object,
which fails the `===` check, which re-runs the effect, which calls `setNodes`…
forever.

So the effect depends on a *string* instead:

```tsx
const sizes = useMemo(() => nodes.map(measure), [nodes]);
const sizeKey = sizes.map((s) => `${s.id}:${s.width}x${s.height}`).join("|");
```

`sizeKey` is a summary of every node's id and measured size, like
`"abc:168x74|def:210x96"`. Since the effect never changes any node's size, it
cannot change `sizeKey`, so it cannot re-trigger itself. It settles after one
pass.

But it *does* re-run when sizes genuinely change — a longer description, a font
finishing loading, a CSS edit — because React Flow's ResizeObserver updates
`measured` on its own and `sizeKey` follows. That's the whole re-layout
mechanism; there's no manual `ResizeObserver` anywhere in this file.

`measure()` rounds the values with `Math.round` because measured sizes are
fractional. Sub-pixel wobble of `74.0001px` vs `74.0002px` would change the
string and kick off a pointless re-layout.

The `// eslint-disable-next-line react-hooks/exhaustive-deps` is there because
the lint rule wants `sizes` in the dependency array, but `sizes` is a new array
every render — adding it would reintroduce exactly the loop `sizeKey` exists to
prevent. This is one of the rare places where the rule is wrong and the comment
above it explains why.

### Fitting the view

```tsx
useEffect(() => {
  if (!placed) return;
  const frame = requestAnimationFrame(() => {
    void fitView({ padding: 0.15, duration: 200 });
  });
  return () => cancelAnimationFrame(frame);
}, [placed, sizeKey, fitView]);
```

`requestAnimationFrame` defers to the next paint, so `fitView` measures the
positions we just wrote rather than the ones being replaced. The returned
function is a *cleanup* — React runs it before re-running the effect or when the
component unmounts, cancelling a frame that's no longer wanted.

## Edge bundles: hover grouping

Every edge into a node comes from the operation that produces that node. So
"edges sharing a target" and "edges belonging to one operation" are the same set,
and grouping by `edge.target` is all that's needed.

The hovered group is *derived*, not stored on the edges:

```tsx
const renderedEdges = useMemo(() => {
  if (!hover) return edges;
  return edges.map((e) =>
    e.target === hover.target
      ? { ...e, className: "dag-edge-active", zIndex: 1 }
      : { ...e, className: "dag-edge-muted" },
  );
}, [edges, hover]);
```

`edges` stays the canonical state that `onEdgesChange` owns; `renderedEdges` is a
view of it with highlight classes applied, and that's what gets handed to
`<ReactFlow>`.

This has to work through class names rather than CSS `:hover`, because hovering
*one* edge must restyle its *siblings*, and no CSS selector can express "style
these other elements when this one is hovered."

The tooltip position comes from the mouse event. React Flow reports client
coordinates (relative to the viewport), but the tooltip is absolutely positioned
inside `.dag-viz`, so `onEdgeHover` subtracts the container's bounding box:

```tsx
const box = container.current?.getBoundingClientRect();
setHover({ target: edge.target, x: event.clientX - (box?.left ?? 0), ... });
```

`useRef` is how you get a handle on a real DOM element: `ref={container}` on the
div, then `container.current` is that element. Unlike state, changing a ref does
not trigger a re-render — which is what you want for something you only read.

## The custom node

`DagFlowNodeView` renders one card. React Flow calls it for every node, passing
`NodeProps`: the node's `id`, its `data`, and the handle positions we set in
`toFlowGraph`.

```tsx
<Handle type="target" position={targetPosition ?? Position.Left} />
```

A `Handle` is a connection point — the anchor an edge attaches to. Every node has
a target handle (edges arrive) and a source handle (edges leave). Which side they
sit on depends on the rank direction, which is what `handlePositions()` computes:
in `LR` mode edges leave the right and arrive on the left.

`data-kind={data.kind}` puts the node kind into a DOM attribute purely so CSS can
select on it — `DagViz.css` colours the left border per kind that way, with no
JavaScript involved.

### Why the text input needs context

Here's a constraint that surprises people: **you cannot pass props to a custom
node.** React Flow instantiates the component itself, from the `nodeTypes` map.
The only channel it offers is `node.data`.

Putting the typed values in `node.data` would work, but badly: every keystroke
would rebuild node objects, which is exactly the state the layout effect is
watching. Instead the values ride alongside in a **context**:

```tsx
const InputContext = createContext<InputStore>({ values: {}, setValue: () => {} });
```

Context is a value any descendant can read without being handed it explicitly.
`DagFlow` provides it, `DagFlowNodeView` reads it with `useContext`, and the
nodes in between don't have to know it exists. Keystrokes update `values` and
never touch the node objects, so typing can't trigger a re-layout.

The `nodrag` class on the input is a React Flow convention. Without it the
library treats mousedown on the input as the start of a node drag, and you can't
place a caret or select text.

## The mental model, in one pass

1. `dag` arrives as a prop.
2. `toFlowGraph` translates it — nodes at the origin, unsized.
3. React renders the cards; CSS decides how big they are.
4. React Flow's ResizeObserver measures them into `node.measured`.
5. `useNodesInitialized` flips true; `sizeKey` acquires real numbers.
6. The layout effect feeds those sizes to dagre and writes positions back.
7. `placed` flips true, the canvas fades in, `fitView` frames the graph.
8. Later size changes update `sizeKey`, and steps 6–7 repeat on their own.

## Where this should be broken up

The file is around 350 lines and does four separable jobs. Nothing here is
urgent, but the seams are already visible.

### 1. Extract the layout cycle into a hook

The measure/place/fitView machinery — `sizes`, `sizeKey`, both effects, `placed`
— is the most intricate part and has nothing to do with tooltips or text inputs.
It would move cleanly into `src/ui/useDagreLayout.ts`:

```tsx
const { placed } = useDagreLayout(nodes, setNodes, graph.layoutEdges, direction);
```

Custom hooks are just functions that call other hooks; the rules are the same.
This is the highest-value split, because it isolates the one piece with a real
correctness argument behind it.

### 2. One file per component

`DagFlowNodeView` (plus its `nodeTypes` map) and `EdgeTooltip` are independent
presentational pieces. `src/ui/DagNode.tsx` and `src/ui/EdgeTooltip.tsx` would
each be short and readable on their own. Note that `src/ui/Node.tsx` still holds
the older list-based `DagNode`; if the graph is now the only visualisation, that
file and its `.node*` rules in `App.css` are dead and should go.

### 3. Push `toFlowGraph` toward `core/`

It's already a pure function, and pure functions are the testable ones — but it
imports `Position` from xyflow, which would drag a UI dependency into `core/`. The
fix is to split it: `core/flow.ts` builds nodes, edges, groups, and initial
values with no notion of handle sides, and the UI attaches `sourcePosition` /
`targetPosition` afterwards. Then `tests/` can assert things like "a three-input
operation produces three edges into one target" in the Node test environment.

### 4. Let `constructEdges` carry the operation

The `groups` map re-derives something `graph.ts` already knew and discarded: which
operation produced each edge. Adding an `operation` field to `Edge` in
`schema.ts` would remove the second loop here, and would fix the case where two
operations share an output node — today they collapse into one bundle, because
grouping strictly by target can't tell them apart.

### 5. Give the input values somewhere to go

They currently live and die inside `DagViz`. Nothing reads them, so `$YEAR` in an
operation's query is still unsubstituted. Options, roughly in order of weight:
lift them to `App` via an `onInputsChange` prop; write them back into the `Dag`;
or introduce a small store (Zustand, which xyflow itself uses) once more than one
component needs them. The right answer depends on where query execution ends up
living.

### 6. Smaller cleanups

- `React.memo` around the node component, so hovering an edge doesn't re-render
  every card. Worth measuring before assuming it matters.
- Keyboard accessibility: the tooltip is mouse-only, and nodes aren't focusable.
  Grouping information should be reachable some other way.
- The design tokens in `DagViz.css` (`--dag-surface`, `--dag-accent`, …) could
  move next to the existing variables in `index.css` if anything else ever needs
  them.

## Known rough edges

- Highlighted bundles keep grey arrowheads. React Flow shares one marker
  definition across all edges, so recolouring on hover needs a second marker and
  a per-edge `markerEnd` swap.
- The tooltip can overflow the canvas near the right or bottom edge. It's capped
  at `max-width: 280px` but doesn't flip sides.
- Two operations writing to the same output node merge into a single hover
  bundle, and the tooltip shows whichever appears last in `dag.operations`.

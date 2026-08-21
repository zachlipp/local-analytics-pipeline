import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { Dag } from "@core/schema";
import type { NodeResult } from "@core/status";

type RunStore = {
  /** Keyed by node id, so it survives renaming nothing and colliding never. */
  results: Record<string, NodeResult>;
  /** Merge a patch into one node's result. */
  update: (id: string, patch: NodeResult) => void;
  /** Forget everything — a new pipeline is a new run. */
  reset: () => void;
};

const RunContext = createContext<RunStore>({
  results: {},
  update: () => {},
  reset: () => {},
});

/**
 * One run's state, above both views.
 *
 * It has to live here rather than inside either view: a file uploaded in the
 * slides is the same fact as that node showing SUCCEEDED on the canvas, and
 * switching views unmounts whichever one you left. Node status is derived from
 * this, so there's exactly one thing to keep true.
 */
export function RunProvider({
  dag,
  children,
}: {
  dag?: Dag;
  children: React.ReactNode;
}) {
  const [results, setResults] = useState<Record<string, NodeResult>>(() =>
    seed(dag),
  );

  // Re-parsing mints new node ids, so carrying results over needs the dag the
  // old ids came from.
  const parsed = useRef(dag);

  // Editing the pipeline keeps what the user handed over and forgets what the
  // last run made of it.
  useEffect(() => {
    setResults((rs) => carry(rs, parsed.current, dag));
    parsed.current = dag;
  }, [dag]);

  const store = useMemo<RunStore>(
    () => ({
      results,
      update: (id, patch) =>
        setResults((rs) => ({ ...rs, [id]: { ...rs[id], ...patch } })),
      reset: () => setResults(seed(dag)),
    }),
    [results, dag],
  );

  return <RunContext.Provider value={store}>{children}</RunContext.Provider>;
}

// Keeps what the user produced; drops tables, since the query that made them
// may be what just changed. Matching is by name: a node's id is regenerated
// every time the YAML is parsed, so it says nothing about which node this was.
// Renaming a node therefore loses its upload, which is the honest outcome.
function carry(
  previous: Record<string, NodeResult>,
  before: Dag | undefined,
  after: Dag | undefined,
): Record<string, NodeResult> {
  const results = seed(after);
  if (!after) return results;

  const idWas = new Map<string, string>();
  for (const [name, node] of Object.entries(before?.nodes ?? {})) {
    idWas.set(name, node.id);
  }

  for (const [name, node] of Object.entries(after.nodes)) {
    const { file, value, entries } = previous[idWas.get(name) ?? node.id] ?? {};
    // A typed value beats the node's default; nothing typed falls back to it.
    const kept = { file, value: value ?? results[node.id]?.value, entries };
    if (kept.file || kept.value !== undefined || kept.entries) {
      results[node.id] = kept;
    }
  }

  return results;
}

/** user_input nodes can ship a default, so a run starts partly filled in. */
function seed(dag?: Dag): Record<string, NodeResult> {
  const results: Record<string, NodeResult> = {};
  if (!dag) return results;

  for (const node of Object.values(dag.nodes)) {
    if (node.kind === "user_input" && node.user_input) {
      results[node.id] = { value: node.user_input };
    }
  }
  return results;
}

export function useRun(): RunStore {
  return useContext(RunContext);
}

/** One node's slice, for the controls that only care about themselves. */
export function useNodeResult(id: string) {
  const { results, update } = useRun();
  return [
    results[id] ?? {},
    useMemo(() => (patch: NodeResult) => update(id, patch), [id, update]),
  ] as const;
}

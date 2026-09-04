import { useCallback, useEffect, useRef, useState } from "react";

import { parseDag } from "@core/parse";
import {
  change,
  identify,
  setVersion,
  type Change,
} from "@core/pipelineChange";
import type { Dag } from "@core/schema";

import { clearResults, loadIdentity, saveIdentity } from "./persist";
import type { Source } from "./route";

const DEMO = () => import("../../data/demo.yaml?raw");

// Dev gets a real pipeline on #/custom-pipeline so the route is usable
// without a file to hand. `import.meta.env.DEV` is replaced by `false` at
// build time, so the
// ternary folds, the dynamic import goes unreachable, and Rollup drops it —
// generated.yaml never enters the production graph. VITE_NO_FIXTURE=1 reaches
// the empty upload state that production users see.
const FIXTURE =
  import.meta.env.DEV && import.meta.env.VITE_NO_FIXTURE !== "1"
    ? () => import("../../data/generated.yaml?raw")
    : undefined;

/** A pipeline waiting on the user, because loading it would cost them work. */
export type Pending = { change: Change; dag: Dag; source: string };

export type Pipeline = {
  dag?: Dag;
  /** The text the dag was parsed from, which is what Export patches. */
  source?: string;
  /** The route segment the loaded pipeline arrived through. */
  from?: Source;
  errors: string[];
  /** A source route's bytes are still on their way in. */
  loading: boolean;
  pending?: Pending;
  /** Bumped when the run store is wiped, to remount RunProvider onto nothing. */
  generation: number;
  /** Hand over pipeline text and let the change rule decide what happens. */
  offer: (raw: string) => void;
  /** Take the pending change, losing whatever work the store held. */
  accept: () => void;
  /** Leave the pending change untaken and keep what is loaded. */
  cancel: () => void;
};

// The demo's bytes ship in the bundle, so its route can load itself. Upload has
// nothing to load from in production and waits on the file input.
function loader(routeSource?: Source) {
  if (routeSource === "demo-pipeline") return DEMO;
  if (routeSource === "custom-pipeline") return FIXTURE;
  return undefined;
}

/**
 * The store holds one pipeline's work at a time, so loading a second one is a
 * decision rather than a side effect. Everything that produces pipeline text —
 * the demo route, the dev fixture, an upload — goes through `offer`, which
 * either commits it or parks it in `pending` for the user to answer.
 */
export function usePipeline(routeSource?: Source): Pipeline {
  const [dag, setDag] = useState<Dag>();
  const [source, setSource] = useState<string>();
  const [from, setFrom] = useState<Source>();
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, setPending] = useState<Pending>();
  const [generation, setGeneration] = useState(0);
  // Seeded from the route so the first paint is the spinner, not the blank
  // frame the effect would otherwise leave up until it runs.
  const [loading, setLoading] = useState(() => !!loader(routeSource));

  // Read inside callbacks that must stay stable, so the loading effect below
  // doesn't re-fire every time the route object is rebuilt. Declared before
  // that effect so this commit's value is in place by the time it runs.
  const at = useRef(routeSource);
  useEffect(() => {
    at.current = routeSource;
  }, [routeSource]);

  const commit = useCallback(
    async (next: Dag, raw: string, wipe: boolean) => {
      if (wipe) {
        await clearResults().catch(() => {});
        setGeneration((g) => g + 1);
      }
      await saveIdentity(identify(next, raw)).catch(() => {});
      setDag(next);
      setSource(raw);
      setFrom(at.current);
      setPending(undefined);
      setErrors([]);
      setLoading(false);
    },
    [],
  );

  const offer = useCallback(
    (raw: string) => {
      const result = parseDag(raw);
      if (!result.ok) {
        setErrors(result.errors);
        setLoading(false);
        return;
      }
      setErrors([]);

      void (async () => {
        const stored = await loadIdentity().catch(() => undefined);
        const verdict = change(identify(result.dag, raw), stored);
        // fresh, same and update all keep the work: RunProvider restores it on
        // load and carries it across the dag change by node name.
        if (verdict.kind !== "replace" && verdict.kind !== "conflict") {
          await commit(result.dag, raw, false);
          return;
        }
        setPending({ change: verdict, dag: result.dag, source: raw });
        setLoading(false);
      })();
    },
    [commit],
  );

  const accept = useCallback(() => {
    if (!pending) return;
    const hotfix =
      pending.change.kind === "conflict" ? pending.change.hotfix : undefined;
    // A conflict with nowhere to hotfix to has no accept — the button is not
    // rendered, and this guards the path anyway.
    if (pending.change.kind === "conflict" && !hotfix) return;

    const raw = hotfix ? setVersion(pending.source, hotfix) : pending.source;
    const result = parseDag(raw);
    if (!result.ok) {
      setErrors(result.errors);
      setPending(undefined);
      return;
    }
    void commit(result.dag, raw, true);
  }, [pending, commit]);

  const cancel = useCallback(() => setPending(undefined), []);

  useEffect(() => {
    const load = loader(routeSource);
    if (!load) {
      setLoading(false);
      return;
    }

    let live = true;
    setLoading(true);
    void load()
      .then((module) => {
        if (live) offer(module.default);
      })
      .catch((cause: unknown) => {
        if (!live) return;
        setErrors([cause instanceof Error ? cause.message : String(cause)]);
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [routeSource, offer]);

  return {
    dag,
    source,
    from,
    errors,
    loading,
    pending,
    generation,
    offer,
    accept,
    cancel,
  };
}

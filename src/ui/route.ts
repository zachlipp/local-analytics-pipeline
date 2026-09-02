import { useCallback, useMemo, useSyncExternalStore } from "react";

/** The three ways of looking at the same DAG. */
export type View = "overview" | "graph" | "steps";

/** Where the loaded pipeline came from. No source at all is the landing page. */
export type Source = "demo-pipeline" | "custom-pipeline";

export type Route = {
  source?: Source;
  view: View;
  /** The node name of the slide, when one has been chosen. */
  step?: string;
};

// Names are node names, which can hold anything a YAML key can, so the segment
// is encoded — a raw "/" would otherwise split the path.
export function formatRoute(route: Route): string {
  if (!route.source) return "#/";
  const step = route.step ? `/${encodeURIComponent(route.step)}` : "";
  return `#/${route.source}/${route.view}${step}`;
}

// A hash that names no source is the landing page, which is why the source is
// read first: without one there is no pipeline to have a view of.
export function parseRoute(hash: string, fallback: View = "overview"): Route {
  const [source, view, step] = hash.replace(/^#\/?/, "").split("/");
  if (source !== "demo-pipeline" && source !== "custom-pipeline") {
    return { view: fallback };
  }
  return {
    view:
      view === "overview" || view === "graph" || view === "steps"
        ? view
        : fallback,
    source,
    step: decode(step),
  };
}

function decode(segment: string | undefined): string | undefined {
  if (!segment) return undefined;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

// A patch, so a caller changing the view can't drop the pipeline it's a view
// of. An absent field means unchanged; every field here is set by someone.
export function mergeRoute(current: Route, patch: Partial<Route>): Route {
  return {
    source: patch.source ?? current.source,
    view: patch.view ?? current.view,
    step: patch.step ?? current.step,
  };
}

export type Navigate = (
  patch: Partial<Route>,
  options?: { replace?: boolean },
) => void;

/** The hash, read as a route, and the way to change it. */
export function useRoute(fallback: View = "overview"): [Route, Navigate] {
  const hash = useSyncExternalStore(subscribe, snapshot);
  const route = useMemo(() => parseRoute(hash, fallback), [hash, fallback]);

  // Merged against the live hash rather than the rendered route, so a handler
  // holding a stale closure still moves from where the user actually is.
  const navigate = useCallback<Navigate>(
    (patch, { replace = false } = {}) => {
      const now = parseRoute(window.location.hash, fallback);
      const target = formatRoute(mergeRoute(now, patch));
      if (target === window.location.hash) return;
      if (replace) window.history.replaceState(null, "", target);
      else window.history.pushState(null, "", target);
      // Neither pushState nor replaceState fires an event; subscribers are ours
      // to notify.
      for (const listener of listeners) listener();
    },
    [fallback],
  );

  return [route, navigate];
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("hashchange", listener);
    window.removeEventListener("popstate", listener);
  };
}

function snapshot() {
  return window.location.hash;
}

import { useCallback, useMemo, useSyncExternalStore } from "react";

/** The two ways of looking at the same DAG. */
export type View = "graph" | "steps";

export type Route = {
  view: View;
  /** The node name of the slide, when one has been chosen. */
  step?: string;
};

// Names are node names, which can hold anything a YAML key can, so the segment
// is encoded — a raw "/" would otherwise split the path.
export function formatRoute(route: Route): string {
  const step = route.step ? `/${encodeURIComponent(route.step)}` : "";
  return `#/${route.view}${step}`;
}

export function parseRoute(hash: string): Route {
  const [view, step] = hash.replace(/^#\/?/, "").split("/");
  return {
    view: view === "graph" ? "graph" : "steps",
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

export type Navigate = (route: Route, options?: { replace?: boolean }) => void;

/** The hash, read as a route, and the way to change it. */
export function useRoute(): [Route, Navigate] {
  const hash = useSyncExternalStore(subscribe, snapshot);
  const route = useMemo(() => parseRoute(hash), [hash]);

  const navigate = useCallback<Navigate>((next, { replace = false } = {}) => {
    const target = formatRoute(next);
    if (target === window.location.hash) return;
    if (replace) window.history.replaceState(null, "", target);
    else window.history.pushState(null, "", target);
    // Neither pushState nor replaceState fires an event; subscribers are ours
    // to notify.
    for (const listener of listeners) listener();
  }, []);

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

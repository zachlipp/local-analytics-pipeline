// Fixed when the bundle is built: `vite dev` has it on, `vite build` has it
// off unless VITE_DEBUG=1 is set for that build. Vite substitutes both at
// build time, so a production bundle drops the debug branches entirely, and
// nothing at runtime can turn them back on.
export const debug =
  import.meta.env.DEV || import.meta.env.VITE_DEBUG === "1";

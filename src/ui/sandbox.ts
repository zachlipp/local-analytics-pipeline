/**
 * Running a pipeline's JavaScript somewhere it can't reach the app.
 *
 * A pipeline definition is an uploaded file, so its `script` fields are
 * untrusted input — treating them as code we run in the page would hand
 * whoever wrote the YAML the user's localStorage, their loaded CSVs, and a
 * credentialed fetch against our own origin. `eval` and `new Function` in the
 * page are therefore both out.
 *
 * Instead the script runs in an iframe with `sandbox="allow-scripts"` and
 * *not* `allow-same-origin`, which puts it on an opaque origin: no access to
 * our storage, no same-origin requests, no DOM of ours. It talks to us over
 * postMessage and hands back structured-cloned values only.
 *
 * What this does NOT protect against:
 *
 *  - A synchronous infinite loop. The iframe shares our main thread, so
 *    `while (true) {}` freezes the tab and the timeout below can't fire. The
 *    fix is a Worker nested inside this iframe, which is terminable; the
 *    timeout here only rescues a script hung on an await.
 *  - Network access. The script can still fetch anything CORS lets it, from
 *    an opaque origin (`Origin: null`), so a hostile script can exfiltrate
 *    whatever it was handed. Isolation limits the blast radius to the data
 *    this node was given, not everything the app holds.
 */

export type ScriptResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

/** What the script body can name directly, besides `context`. */
export type ScriptContext = {
  /** The value of the node's declared input, if it has one. */
  input?: string;
  /** The body of the declarative request, if the node made one. */
  response?: string;
};

// Fixed content: the script under test arrives by postMessage, never by
// interpolation, so there is nothing to escape here and no injection seam.
const RUNNER = `<!doctype html><meta charset="utf-8"><script>
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

  window.addEventListener("message", async (event) => {
    const reply = (message) => parent.postMessage(message, "*");
    const { source, context } = event.data ?? {};

    let value;
    try {
      const run = new AsyncFunction("context", "input", "response", source);
      value = await run(context, context.input, context.response);
    } catch (cause) {
      reply({ ok: false, error: String(cause && cause.message || cause) });
      return;
    }

    try {
      reply({ ok: true, value });
    } catch {
      // Structured clone refused it — a function, a DOM node, a proxy.
      reply({ ok: false, error: "Script returned a value that can't be sent back" });
    }
  });
<\/script>`;

export function runScript(
  source: string,
  context: ScriptContext = {},
  { timeoutMs = 10_000 }: { timeoutMs?: number } = {},
): Promise<ScriptResult> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("aria-hidden", "true");
    frame.style.display = "none";
    frame.srcdoc = RUNNER;

    let settled = false;
    function finish(result: ScriptResult) {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      frame.remove();
      resolve(result);
    }

    // An opaque origin posts with origin "null", so the sender identity is the
    // check that matters — anything not from our own frame is someone else's.
    function onMessage(event: MessageEvent) {
      if (event.source !== frame.contentWindow) return;
      const data = event.data as ScriptResult | undefined;
      if (!data || typeof data.ok !== "boolean") return;
      finish(data);
    }

    const timer = setTimeout(
      () => finish({ ok: false, error: `Script timed out after ${timeoutMs}ms` }),
      timeoutMs,
    );

    window.addEventListener("message", onMessage);
    frame.addEventListener("load", () => {
      frame.contentWindow?.postMessage({ source, context }, "*");
    });

    document.body.append(frame);
  });
}

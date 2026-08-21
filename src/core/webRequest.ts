import type { WebRequestNode } from "./schema";

/** A request ready to hand to fetch(), with templates already filled in. */
export type ResolvedRequest = {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
};

const TEMPLATE = /\{\{\s*input\s*\}\}/g;

/**
 * Substitute the node's input value into a template.
 *
 * `encode` is on for URLs and off everywhere else: a value going into a query
 * string has to survive `&` and spaces, while the same value in a JSON body
 * would be corrupted by percent-encoding it.
 */
export function fillTemplate(
  template: string,
  input: string,
  { encode = false }: { encode?: boolean } = {},
): string {
  return template.replace(TEMPLATE, encode ? encodeURIComponent(input) : input);
}

/**
 * What this node would fetch, given its input's current value.
 *
 * Returns undefined for a node with no `request` — that one is either
 * script-only or not configured yet, and neither is an error here.
 */
export function resolveRequest(
  node: WebRequestNode,
  input = "",
): ResolvedRequest | undefined {
  if (!node.request) return undefined;
  const { url, method, headers, body } = node.request;

  return {
    url: fillTemplate(url, input, { encode: true }),
    method,
    // Header values are templated too, which is how a token typed into a
    // user_input node reaches an Authorization header.
    headers: Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k, fillTemplate(v, input)]),
    ),
    body: body === undefined ? undefined : fillTemplate(body, input),
  };
}

/** Whether there's anything to run at all — a node can be neither yet. */
export function isConfigured(node: WebRequestNode): boolean {
  return Boolean(node.request || node.script);
}

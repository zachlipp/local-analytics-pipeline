// Signatures only — the bodies are yours to fill in. Note that an empty body
// passes, so these are green until they actually assert something.
import { NodeSchema } from "@core/schema";
import type { WebRequestNode } from "@core/schema";
import { describe, test } from "vitest";

function node(fields: Record<string, unknown> = {}): WebRequestNode {
  return NodeSchema.parse({
    kind: "web_request",
    description: "",
    ...fields,
  }) as WebRequestNode;
}

/** A node whose url, header, and body all reference the input. */
function templated(): WebRequestNode {
  return node({
    input: "year",
    request: {
      url: "https://example.test/data.csv?year={{input}}",
      method: "POST",
      headers: { Authorization: "Bearer {{input}}" },
      body: '{"year":"{{input}}"}',
    },
  });
}

describe("resolveRequest", () => {
  test("a node with no request resolves to nothing", () => {
    node({ script: "return 1;" });
  });

  test("the input value replaces {{input}} in the url", () => {
    templated();
  });

  test("a value in the url is percent-encoded, but not one in the body", () => {
    templated();
  });

  test("header values are templated too", () => {
    templated();
  });

  test("a missing input leaves the template filled with nothing", () => {
    templated();
  });

  test("method defaults to GET", () => {
    node({ request: { url: "https://example.test/data.csv" } });
  });
});

describe("isConfigured", () => {
  test("false when the node has neither a request nor a script", () => {
    node();
  });

  test("true with either one alone", () => {
    node({ script: "return 1;" });
  });
});

import type { Dag, Edge } from "./schema";
import { uuid } from "@core/utils";

export function constructEdges(dag: Dag): Edge[] {
  const edges: Edge[] = [];
  for (const [_, op] of Object.entries(dag.operations)) {
    for (const inp of op.inputs) {
      const edge: Edge = {
        id: uuid(),
        from: dag.nodes[inp].id,
        to: dag.nodes[op.output].id,
      };
      edges.push(edge);
    }
  }
  return edges;
}

/*

import type { Dag } from "./schema";

export function checkReferences(dag: Dag): string[] {
  const names = new Set(Object.keys(dag.nodes));
  const errors: string[] = [];

  for (const [name, node] of Object.entries(dag.nodes)) {
    switch (node.kind) {
      case "file":
        break; // no inputs
      case "operation":
        for (const input of node.inputs) {
          errors.push(...checkInput(name, input, names));
        }
        break;
    }
  }
  return errors;
}

function checkInput(
  name: string,
  input: TransformInput,
  names: Set<string>,
): string[] {
  switch (input.kind) {
    case "variable":
      return []; // not resolved against the node graph
    case "node":
      return names.has(input.name)
        ? []
        : [`Node '${name}' depends on '${input.name}', which doesn't exist`];
  }
}
*/

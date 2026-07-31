import type { Dag, TransformInput } from "./schema";

export function checkReferences(dag: Dag): string[] {
  const names = new Set(Object.keys(dag.nodes));
  const errors: string[] = [];

  for (const [name, node] of Object.entries(dag.nodes)) {
    switch (node.kind) {
      case "file":
        break; // no inputs
      case "transform":
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

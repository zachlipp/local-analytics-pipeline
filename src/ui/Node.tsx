import type { Node } from "@core/schema";
// import { uploadCsv } from "@core/upload";

export function DagNode({ name, node }: { name: string; node: Node }) {
  return (
    <li className="node" data-kind={node.kind}>
      <div className="node-name">{name}</div>
      <div className="node-kind">{node.kind}</div>
      <div className="node-description">{node.description}</div>
      <NodeBody node={node} />
    </li>
  );
}

function NodeBody({ node }: { node: Node }) {
  switch (node.kind) {
    case "file":
      return (
        <label className="upload">
          Upload
          <input type="file" accept=".csv,text/csv" />
        </label>
      );
    case "transform":
      return (
        <p className="node-detail">
          {node.inputs.map((input) => input.name).join(", ")}
        </p>
      );
  }
}

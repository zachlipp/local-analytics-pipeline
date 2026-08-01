import { useEffect, useState } from "react";
import { parseDag } from "@core/parse";
// import { checkReferences } from "@core/graph";
import { DagNode } from "@ui/Node";
import type { Dag } from "@core/schema";

export function DagUpload({ initialSource }: { initialSource?: string }) {
  const [messages, setMessages] = useState<string[]>([]);
  const [dag, setDag] = useState<Dag>();

  // Load a DAG on mount, before the user has uploaded anything.
  useEffect(() => {
    if (!initialSource) return;
    const result = parseDag(initialSource);
    if (!result.ok) {
      setMessages(result.errors);
      return;
    }
    setDag(result.dag);
  }, [initialSource]);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = parseDag(await file.text());
    if (!result.ok) {
      setMessages(result.errors);
      setDag(undefined);
      return;
    }
    /*
    const dangling = checkReferences(result.dag);
    setMessages(
      dangling.length > 0
        ? dangling
        : [`OK — ${Object.keys(result.dag.nodes).length} nodes`],
    );
		*/
    // setDag(dangling.length > 0 ? undefined : result.dag);
    setDag(result.dag);
  }

  return (
    <>
      <label className="upload">
        Upload your pipeline definition (YAML, JSON)
        <input type="file" accept=".yaml,.yml,.json" onChange={onChange} />
        <ul>
          {messages.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      </label>

      {dag && (
        <ul className="nodes">
          {Object.entries(dag.nodes).map(([name, node]) => (
            <DagNode key={name} name={name} node={node} />
          ))}
        </ul>
      )}
    </>
  );
}

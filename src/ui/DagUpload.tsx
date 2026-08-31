import { useEffect, useState } from "react";
import { parseDag } from "@core/parse";
import type { Dag } from "@core/schema";

export function DagUpload({
  initialSource,
  onDag,
  onSource,
}: {
  initialSource?: string;
  /** Fires whenever the parsed DAG changes, so App can render it. */
  onDag?: (dag: Dag | undefined) => void;
  /** Fires with the raw text the DAG was parsed from — needed to export it. */
  onSource?: (source: string | undefined) => void;
}) {
  const [messages, setMessages] = useState<string[]>([]);
  const [dag, setDag] = useState<Dag>();
  const [source, setSource] = useState<string>();

  // Reporting the DAG from one effect rather than from each setDag() call
  // means a new parse path can't forget to tell the parent about it.
  useEffect(() => {
    onDag?.(dag);
  }, [dag, onDag]);

  useEffect(() => {
    onSource?.(source);
  }, [source, onSource]);

  // Load a DAG on mount, before the user has uploaded anything.
  useEffect(() => {
    if (!initialSource) return;
    const result = parseDag(initialSource);
    if (!result.ok) {
      setMessages(result.errors);
      return;
    }
    setDag(result.dag);
    setSource(initialSource);
  }, [initialSource]);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const result = parseDag(text);
    if (!result.ok) {
      setMessages(result.errors);
      setDag(undefined);
      setSource(undefined);
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
    setSource(text);
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
    </>
  );
}

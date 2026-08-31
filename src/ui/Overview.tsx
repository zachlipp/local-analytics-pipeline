import { useMemo } from "react";

import "./Overview.css";

import { buildPipeline } from "@core/pipeline";
import type { Dag, Node } from "@core/schema";
import { nodeStatuses } from "@core/status";
import { formatRoute } from "./route";
import { useRun } from "./RunState";
import { StatusBadge } from "./StatusBadge";

// Data sources hand the pipeline raw material; data entry, scripts, and SQL
// operations each transform it in their own way, so they're counted apart.
const SOURCE_KINDS = new Set<Node["kind"]>(["data_literal", "user_input", "file"]);

// The front door: states in prose what the loaded pipeline is made of, then
// sends the reader on to the graph or the walkthrough. Counts and
// descriptions are read off the dag at render time, so they can never go
// stale and no schema change is needed.
export function Overview({ dag }: { dag: Dag }) {
  const pipeline = useMemo(() => buildPipeline(dag), [dag]);
  const { results } = useRun();
  const statuses = useMemo(
    () => nodeStatuses(pipeline, results),
    [pipeline, results],
  );

  const nodes = Object.entries(dag.nodes);
  const sources = nodes.filter(([, n]) => SOURCE_KINDS.has(n.kind)).length;
  const grids = nodes.filter(([, n]) => n.kind === "data_entry").length;
  const scripts = nodes.filter(([, n]) => n.kind === "script").length;
  const operations = Object.keys(dag.operations).length;
  const firstStep = pipeline.steps[0]?.name;

  return (
    <div className="overview">
      <p className="overview-summary">
        {dag.pipeline_name} draws on {count(sources, "data source")}, fills
        out {count(grids, "data entry grid")}, runs {count(scripts, "script")}
        , and performs {count(operations, "SQL operation")}.
      </p>

      <div className="overview-actions">
        <a className="overview-action" href={formatRoute({ view: "graph" })}>
          Visualize the pipeline
        </a>
        <a
          className="overview-action"
          href={formatRoute({ view: "steps", step: firstStep })}
        >
          Start running it
        </a>
      </div>

      <ul className="overview-nodes">
        {nodes.map(([name, node]) => (
          <li className="overview-node" key={node.id}>
            <div className="overview-node-name">
              {name}
              <StatusBadge status={statuses.get(name) ?? "UNREACHED"} />
            </div>
            <p className="overview-node-description">{node.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Pluralized for a person reading the sentence, not for the count itself.
function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

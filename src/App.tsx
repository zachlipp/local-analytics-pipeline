import "./App.css";

import { useState } from "react";

import { DagUpload } from "@ui/DagUpload";
import { DagViz } from "@ui/DagViz";
import type { Dag } from "@core/schema";

// Inlined at build time, so the sample pipeline renders on boot without a
// network round-trip and without shipping data/ as a static asset.
import sampleDag from "../data/schema.yaml?raw";

function App() {
  // App owns the parsed DAG: DagUpload produces it, DagViz renders it.
  const [dag, setDag] = useState<Dag>();

  return (
    <main>
      <h1>LAP</h1>
      <p className="subtitle">Local Analytics Pipeline</p>

      <DagUpload initialSource={sampleDag} onDag={setDag} />

      {dag && <DagViz dag={dag} />}
    </main>
  );
}

export default App;

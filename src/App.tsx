import "./App.css";

import { DagUpload } from "@ui/DagUpload";

// Inlined at build time, so the sample pipeline renders on boot without a
// network round-trip and without shipping data/ as a static asset.
import sampleDag from "../data/schema.yaml?raw";

function App() {
  return (
    <main>
      <h1>LAP</h1>
      <p className="subtitle">Local Analytics Pipeline</p>

      <DagUpload initialSource={sampleDag} />
    </main>
  );
}

export default App;

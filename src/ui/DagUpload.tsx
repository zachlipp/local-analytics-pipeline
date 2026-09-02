export function DagUpload({
  onOffer,
  messages,
}: {
  /** Hands the file's text up; parsing and the change rule live above here. */
  onOffer: (raw: string) => void;
  messages: string[];
}) {
  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    onOffer(await file.text());
    // Cleared so re-picking the same file after a cancelled prompt still fires.
    e.target.value = "";
  }

  return (
    <label className="upload">
      Upload your pipeline definition (YAML, JSON)
      <input
        type="file"
        accept=".yaml,.yml,.json"
        onChange={(e) => void onChange(e)}
      />
      <ul>
        {messages.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
    </label>
  );
}

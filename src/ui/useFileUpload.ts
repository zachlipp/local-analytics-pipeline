import { useState } from "react";

import type { NodeResult } from "@core/status";

/** A file the user handed to a file node, once it has been read. */
export type LoadedFile = { name: string; text: string };

/**
 * Reading a picked file, without the markup.
 *
 * Both views put a file control on file nodes and they look nothing alike, so
 * what they share is the reading — the await, and the retry that a failed pick
 * needs. Progress and failure go out as patches to the run store rather than
 * being held here, because the node's status is derived from them and the
 * other view has to see it too.
 *
 * A file arrives one of two ways: picked through the hidden input, or dropped
 * on the control. Spread `drop` onto whatever element should accept one.
 */
export function useFileUpload(report: (patch: NodeResult) => void) {
  const [dragging, setDragging] = useState(false);

  async function read(picked: File) {
    report({ running: true, error: undefined });
    try {
      report({
        running: false,
        file: { name: picked.name, text: await picked.text() },
      });
    } catch (cause) {
      report({
        running: false,
        file: undefined,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;

    const input = e.target;
    await read(picked);
    // Clearing lets the same file be picked again after a failure, which
    // otherwise fires no change event.
    input.value = "";
  }

  const drop = {
    // Both handlers must preventDefault or the browser navigates to the file
    // instead of letting us have it.
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(true);
    },
    // Fires when crossing onto a child element too, so this flickers off and
    // straight back on — harmless, because dragover keeps re-arming it.
    onDragLeave: () => setDragging(false),
    onDrop: async (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const picked = e.dataTransfer.files?.[0];
      if (picked) await read(picked);
    },
  };

  return { dragging, onChange, drop };
}

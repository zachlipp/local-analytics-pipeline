import JSZip from "jszip";
import type { ExportFile } from "@core/exportPipeline";

// Zipped in the browser and handed straight to the user.
export async function downloadZip(
  filename: string,
  files: ExportFile[],
): Promise<void> {
  const zip = new JSZip();
  for (const file of files) zip.file(file.name, file.content);
  const blob = await zip.generateAsync({ type: "blob" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoked a tick later: Safari cancels a download whose blob URL is gone.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

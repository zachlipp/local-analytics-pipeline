import { useState, type ChangeEvent } from "react";
import { countRows } from "../example-query";

const [, setFileName] = useState<string>();
const [, setRowCount] = useState<number>();
export async function uploadCsv(e: ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  setFileName(file.name);
  setRowCount(undefined);
  try {
    setRowCount(await countRows(file));
  } catch (err) {
    console.error(err);
  }
}

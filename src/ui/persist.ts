import type { NodeResult } from "@core/status";

/**
 * The half of a result worth keeping across a reload: what the user handed
 * over, and nothing the run derived from it.
 *
 * Tables and row counts live in DuckDB, which doesn't survive a reload either,
 * so storing them would only produce a node claiming a table that isn't there.
 */
export type Persisted = Pick<NodeResult, "file" | "value" | "entries" | "literal">;

export function durable(result: NodeResult): Persisted {
  return {
    file: result.file,
    value: result.value,
    entries: result.entries,
    literal: result.literal,
  };
}

// Field-by-field on purpose: patches replace these wholesale, so an unchanged
// field is the same object and a changed one never is.
export function sameDurable(a: Persisted, b?: Persisted): boolean {
  return (
    a.file === b?.file &&
    a.value === b?.value &&
    a.entries === b?.entries &&
    a.literal === b?.literal
  );
}

const DATABASE = "lap";
const STORE = "results";

let connection: Promise<IDBDatabase> | undefined;

function database(): Promise<IDBDatabase> {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return connection;
}

async function transact<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => T,
): Promise<T> {
  const conn = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = conn.transaction(STORE, mode);
    const outcome = work(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(outcome);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function loadResults(): Promise<Record<string, Persisted>> {
  const [keys, values] = await transact("readonly", (store) => [
    store.getAllKeys(),
    store.getAll(),
  ]);

  const results: Record<string, Persisted> = {};
  keys.result.forEach((key, i) => {
    results[String(key)] = values.result[i] as Persisted;
  });
  return results;
}

export async function saveResult(id: string, result: Persisted): Promise<void> {
  // Structured clone rejects undefined-valued keys in some engines, and a
  // result with nothing in it has nothing to say anyway.
  const stored: Persisted = {};
  if (result.file) stored.file = result.file;
  if (result.value !== undefined) stored.value = result.value;
  if (result.entries) stored.entries = result.entries;
  if (result.literal) stored.literal = result.literal;

  await transact("readwrite", (store) => store.put(stored, id));
}

export async function clearResults(): Promise<void> {
  await transact("readwrite", (store) => store.clear());
}

import type { Identity } from "@core/pipelineChange";
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

const DATABASE = "off-grid-analytics";
const STORE = "results";
// Which pipeline the results belong to. Without it a reload restores whatever
// is in the store into whatever gets uploaded next, matching on node id alone.
const META = "meta";
const IDENTITY = "identity";

let connection: Promise<IDBDatabase> | undefined;

// A blocked upgrade fires neither onsuccess nor onerror, so every path here
// settles the promise or nothing downstream ever resumes.
function database(): Promise<IDBDatabase> {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 2);
    const timer = setTimeout(() => reject(new Error("indexedDB.open stalled")), 5000);
    const done = (settle: () => void) => {
      clearTimeout(timer);
      settle();
    };
    // Guarded rather than unconditional: v1 users arrive here with `results`
    // already made, and creating it twice throws.
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    request.onsuccess = () => done(() => resolve(request.result));
    request.onerror = () => done(() => reject(request.error));
    request.onblocked = () =>
      done(() => reject(new Error("another tab is holding an older database open")));
  }).catch((cause: unknown) => {
    // Dropped so a later call retries rather than awaiting a dead promise.
    connection = undefined;
    throw cause;
  });
  return connection;
}

async function transact<T>(
  name: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => T,
): Promise<T> {
  const conn = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = conn.transaction(name, mode);
    const outcome = work(tx.objectStore(name));
    tx.oncomplete = () => resolve(outcome);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function loadResults(): Promise<Record<string, Persisted>> {
  const [keys, values] = await transact(STORE, "readonly", (store) => [
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

  await transact(STORE, "readwrite", (store) => store.put(stored, id));
}

export async function clearResults(): Promise<void> {
  await transact(STORE, "readwrite", (store) => store.clear());
}

export async function loadIdentity(): Promise<Identity | undefined> {
  const stored = await transact(META, "readonly", (store) =>
    store.get(IDENTITY),
  );
  return stored.result as Identity | undefined;
}

export async function saveIdentity(identity: Identity): Promise<void> {
  await transact(META, "readwrite", (store) => store.put(identity, IDENTITY));
}

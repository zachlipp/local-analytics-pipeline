import {
  secret,
  select,
  type Rows,
  type ScriptContext,
  type Selected,
} from "@core/scripts";

const ENDPOINT = "https://us1.locationiq.com/v1/search";

const API_KEY = "LOCATIONIQ_API_KEY";

// The free tier allows two a second. One is inside that with room to spare,
// and the daily cap runs out long before the per-second one matters.
const DELAY = 1_000;

// What to wait after a refusal, in order. Running out of these gives up.
const BACKOFF = [5_000, 15_000, 45_000];

// Worth retrying. Anything else is our fault and will not fix itself.
const RETRY = new Set([429, 500, 502, 503, 504]);

// An address LocationIQ cannot place, where Nominatim sent an empty array.
const NOT_FOUND = 404;

// An honoured Retry-After longer than this is a block rather than a queue, and
// waiting it out in a browser tab is not a plan.
const MAX_RETRY_AFTER = 120_000;

// How many bad rows to name before the message stops being worth reading.
const NAMED = 10;

// The same columns the node's `reads:` lists, so validate can compare them
// against the input table before any of this runs.
type Organization = Selected<
  "ein",
  "name" | "street" | "city" | "state" | "zip"
>;

type Located = { row: Organization; address: string };

type Match = { lat?: string; lon?: string };

export default async function geocode({
  input,
  secrets,
  progress,
}: ScriptContext): Promise<Rows> {
  const key = secret(secrets, API_KEY);

  const rows: Organization[] = select(
    input,
    ["ein"],
    ["street", "name", "city", "state", "zip"],
  );

  const located: Located[] = [];
  const incomplete: string[] = [];

  rows.forEach((row, i) => {
    const address = consolidateAddressFields(row);
    if (!address) return void incomplete.push(identify(row, i));
    located.push({ row, address });
  });

  // Checked up front, so an input that cannot be geocoded fails before any
  // request goes out rather than halfway through the day's quota.
  if (incomplete.length > 0) throw new Error(describe(incomplete));

  progress(`${located.length} to geocode, about ${estimate(located.length)}.`);

  const out: Rows = [];
  let found = 0;

  // One request at a time, with a wait between them, so a large input stays
  // inside the rate limit without needing to think about concurrency.
  for (const [i, { row, address }] of located.entries()) {
    if (i > 0) await sleep(DELAY);
    progress(`${i + 1} of ${located.length}: ${address}`);

    const match = await lookup(address, key, progress);
    if (match) found += 1;

    out.push({
      ein: row.ein,
      full_address: address,
      latitude: match?.lat ?? "",
      longitude: match?.lon ?? "",
    });
  }

  progress(`Done. ${found} of ${located.length} placed.`);
  return out;
}

async function lookup(
  address: string,
  key: string,
  progress: (message: string) => void,
): Promise<Match | undefined> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("key", key);
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (response.ok) {
      const [match] = (await response.json()) as Match[];
      return match;
    }
    if (response.status === NOT_FOUND) return undefined;

    const reason = await failure(response);
    const backoff = BACKOFF[attempt];
    // The per-second limit clears on its own and the daily one does not, so
    // only one of the two is worth sitting through.
    if (!RETRY.has(response.status) || backoff === undefined || daily(reason)) {
      throw new Error(`Geocoding ${address} failed: ${reason}`);
    }

    const wait = retryAfter(response) ?? backoff;
    progress(
      `${reason}. Waiting ${Math.round(wait / 1000)}s, then trying ${address} again.`,
    );
    await sleep(wait);
  }
}

// LocationIQ says why in the body — "Invalid key", "Rate Limited Day" — which
// is worth more than the status code on its own.
async function failure(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return body?.error ? `${response.status} ${body.error}` : `${response.status}`;
}

function daily(reason: string): boolean {
  return /\bday\b/i.test(reason);
}

// Sent in seconds when it is sent at all. The HTTP-date form is legal too, and
// ignored here: a date means a long block, which BACKOFF handles better.
function retryAfter(response: Response): number | undefined {
  const header = response.headers.get("Retry-After");
  if (!header) return undefined;

  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.min(seconds * 1_000, MAX_RETRY_AFTER);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimate(count: number): string {
  const minutes = Math.ceil((count * DELAY) / 60_000);
  if (minutes < 1) return "under a minute";
  return `${minutes} minute${minutes === 1 ? "" : "s"} if nothing throttles us`;
}

// A street on its own places nothing, so a locality of some kind is required
// alongside it.
function consolidateAddressFields(row: Organization): string | undefined {
  const locality = [row.street, row.city, row.state, row.zip].filter(Boolean);
  if (locality.length === 0) return undefined;
  return [...locality].join(", ");
}

function identify(row: Organization, i: number): string {
  return row.name ? `${row.ein} (${row.name})` : `${row.ein} (row ${i + 1})`;
}

function describe(names: string[]): string {
  const shown = names.slice(0, NAMED).join(", ");
  const rest = names.length > NAMED ? `, and ${names.length - NAMED} more` : "";
  return `${names.length} of these rows cannot be geocoded: ${shown}${rest}. Each needs a city, state or zip alongside its street address. Fix them at the source, or add them to manual_address_overrides.`;
}

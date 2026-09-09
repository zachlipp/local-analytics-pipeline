import {
  select,
  type Rows,
  type ScriptContext,
  type Selected,
} from "@core/scripts";

const ENDPOINT =
  "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

// The address ranges the Census keeps current, rather than a decennial snapshot.
const BENCHMARK = "Public_AR_Current";

// The endpoint sends no CORS headers, so a response cannot be read out of
// fetch(). It does answer JSONP, and a script tag was never bound by the same
// origin policy, so that is how these requests go out.
const TIMEOUT = 20_000;

// How many bad rows to name before the message stops being worth reading.
const NAMED = 10;

// The same columns the node's `reads:` lists, so validate can compare them
// against the input table before any of this runs.
type Organization = Selected<
  "ein",
  "name" | "street" | "city" | "state" | "zip"
>;

type Located = { row: Organization; address: string };

// Only the fields this reads; a match carries its Tiger line and parsed
// components as well.
type CensusResponse = {
  result?: {
    addressMatches?: { coordinates?: { x: number; y: number } }[];
  };
};

export default async function geocode({ input }: ScriptContext): Promise<Rows> {
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
  // request goes out rather than halfway through the batch.
  if (incomplete.length > 0) throw new Error(describe(incomplete));

  const out: Rows = [];
  for (const { row, address } of located) {
    const url =
      `${ENDPOINT}?benchmark=${BENCHMARK}&format=jsonp` +
      `&address=${encodeURIComponent(address)}`;
    const body = await jsonp<CensusResponse>(url, address);

    // x is longitude and y is latitude, in that order.
    const point = body.result?.addressMatches?.[0]?.coordinates;
    out.push({
      ein: row.ein,
      full_address: address,
      latitude: point ? String(point.y) : "",
      longitude: point ? String(point.x) : "",
    });
  }

  return out;
}

let pending = 0;

// A JSONP response is executed, not parsed, so there is no status code to read:
// a failure arrives as a script error or as nothing at all.
function jsonp<T>(url: string, address: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const name = `__geocode_jsonp_${(pending += 1)}`;
    const holder = window as unknown as Record<string, unknown>;
    const script = document.createElement("script");

    const timer = setTimeout(() => {
      finish();
      reject(new Error(`Geocoding ${address} timed out.`));
    }, TIMEOUT);

    function finish() {
      clearTimeout(timer);
      delete holder[name];
      script.remove();
    }

    holder[name] = (body: T) => {
      finish();
      resolve(body);
    };
    script.onerror = () => {
      finish();
      reject(new Error(`Geocoding ${address} failed: the request did not load.`));
    };

    script.src = `${url}&callback=${name}`;
    document.head.append(script);
  });
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

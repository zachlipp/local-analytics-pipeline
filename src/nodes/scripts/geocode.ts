import { select, type Rows, type ScriptContext, type Selected } from "@core/scripts";

const ENDPOINT = "https://nominatim.openstreetmap.org/search";

// How many bad rows to name before the message stops being worth reading.
const NAMED = 10;

// The same columns the node's `reads:` lists, so validate can compare them
// against the input table before any of this runs.
type Organization = Selected<"ein" | "address", "name" | "city" | "state" | "zip">;

type Located = { row: Organization; address: string };

export default async function geocode({ input }: ScriptContext): Promise<Rows> {
  const rows: Organization[] = select(
    input,
    ["ein", "address"],
    ["name", "city", "state", "zip"],
  );

  const located: Located[] = [];
  const incomplete: string[] = [];

  rows.forEach((row, i) => {
    const address = fullAddress(row);
    if (!address) return void incomplete.push(identify(row, i));
    located.push({ row, address });
  });

  // Checked up front, so an input that cannot be geocoded fails before any
  // request goes out rather than halfway through the rate limit.
  if (incomplete.length > 0) throw new Error(describe(incomplete));

  const out: Rows = [];
  // One request at a time: the public endpoint asks for no more than one call
  // a second and will start refusing under a burst.
  for (const { row, address } of located) {
    const url = `${ENDPOINT}?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      throw new Error(`Geocoding ${address} failed: ${response.status}`);
    }

    const [match] = (await response.json()) as { lat?: string; lon?: string }[];
    out.push({
      ein: row.ein,
      full_address: address,
      latitude: match?.lat ?? "",
      longitude: match?.lon ?? "",
    });
  }

  return out;
}

// A street on its own places nothing, so a locality of some kind is required
// alongside it. select() has already guaranteed the street.
function fullAddress(row: Organization): string | undefined {
  const locality = [row.city, row.state, row.zip].filter(Boolean);
  if (locality.length === 0) return undefined;
  return [row.address, ...locality].join(", ");
}

function identify(row: Organization, i: number): string {
  return row.name ? `${row.ein} (${row.name})` : `${row.ein} (row ${i + 1})`;
}

function describe(names: string[]): string {
  const shown = names.slice(0, NAMED).join(", ");
  const rest = names.length > NAMED ? `, and ${names.length - NAMED} more` : "";
  return `${names.length} of these rows cannot be geocoded: ${shown}${rest}. Each needs a city, state or zip alongside its street address. Fix them at the source, or add them to manual_address_overrides.`;
}

import { select, type ScriptContext, type ScriptDocument } from "@core/scripts";

const MARKER_COLOR = "#B06FFA";

// How many decimal places the map needs out of a geocoded coordinate.
const PRECISION = 3;

// Columns every organization on the map needs a value for. The focus columns
// are not among them: the node's `options:` names those, and a blank one is a
// focus the organization does not work in.
const REQUIRED = [
  "ein",
  "name",
  "full_address",
  "latitude",
  "longitude",
  "number_of_grants",
  "cumulative_grant_dollars",
] as const;

type Organization = Record<string, string | undefined>;

type Feature = {
  type: "Feature";
  geometry: { coordinates: [number, number]; type: "Point" };
  properties: Record<string, string>;
};

export default function organizationsAsGeojson({
  input,
  options,
}: ScriptContext): ScriptDocument {
  if (options.length === 0) {
    throw new Error(
      "This script needs the focus columns in the node's `options:`, written inline or as the name of an option set.",
    );
  }

  const rows: Organization[] = select(input, REQUIRED, options);
  const features: Feature[] = [];

  for (const row of rows) {
    const properties: Record<string, string> = {
      "marker-color": MARKER_COLOR,
      ein: htmlEscape(row.ein ?? ""),
      name: htmlEscape(row.name ?? ""),
      full_address: htmlEscape(row.full_address ?? ""),
      combined_focuses: htmlEscape(combinedFocuses(row, options)),
      number_of_grants: String(toInt(row.number_of_grants)),
    };
    for (const focus of options) {
      properties[focus] = toBool(row[focus]) ? "True" : "False";
    }
    properties.cumulative_grant_dollars = dollarFormat(
      row.cumulative_grant_dollars,
    );

    features.push({
      type: "Feature",
      geometry: {
        coordinates: [round(row.longitude), round(row.latitude)],
        type: "Point",
      },
      properties,
    });
  }

  return {
    filename: "organizations.geojson",
    mediaType: "application/geo+json",
    body: JSON.stringify({ type: "FeatureCollection", features }, null, 2),
  };
}

function combinedFocuses(row: Organization, focuses: string[]): string {
  return focuses
    .filter((focus) => toBool(row[focus]))
    .map((focus) => titleCase(focus.replaceAll("_", " ")))
    .join(", ");
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[a-z]+/g, (word) => word[0].toUpperCase() + word.slice(1));
}

function round(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(PRECISION)) : 0;
}

function toInt(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function toBool(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "0" && normalized !== "false";
}

function dollarFormat(value: string | undefined): string {
  const parsed = Number(value);
  const amount = Number.isFinite(parsed) ? parsed : 0;
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function htmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&#34;")
    .replaceAll("'", "&#39;");
}

import type { ScriptContext, ScriptDocument } from "@core/scripts";

type Feature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, string>;
};

// Rows without usable coordinates are dropped rather than emitted at 0,0 in
// the Gulf of Guinea.
export default function organizationsAsGeojson({
  input,
}: ScriptContext): ScriptDocument {
  const features: Feature[] = [];

  for (const row of input) {
    const longitude = Number(row.longitude);
    const latitude = Number(row.latitude);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;

    const properties = { ...row };
    delete properties.latitude;
    delete properties.longitude;

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [longitude, latitude] },
      properties,
    });
  }

  return {
    filename: "organizations.geojson",
    mediaType: "application/geo+json",
    body: JSON.stringify({ type: "FeatureCollection", features }, null, 2),
  };
}

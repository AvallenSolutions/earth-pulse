/**
 * Builds the slim world boundaries file the map uses, from Natural Earth 110m
 * admin-0 countries. Keeps only ISO3 + display name per feature so the payload
 * stays small. Natural Earth marks some territories' ISO_A3 as "-99" (France,
 * Norway); ISO_A3_EH carries the correct code, with ADM0_A3 as last resort.
 *
 * Also emits the countries reference list (ISO3, name, continent, region) used
 * to seed the database and validate all ingest.
 *
 * Run: npx tsx scripts/build-boundaries.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

type Feature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: unknown;
  bbox?: number[];
};

const raw = JSON.parse(
  readFileSync("data/raw/ne_110m_countries.geojson", "utf8")
) as { features: Feature[] };

const isoOf = (p: Record<string, unknown>): string | null => {
  for (const key of ["ISO_A3", "ISO_A3_EH", "ADM0_A3"]) {
    const v = p[key];
    if (typeof v === "string" && /^[A-Z]{3}$/.test(v)) return v;
  }
  return null;
};

const rejected: string[] = [];
const seen = new Set<string>();
const features: Feature[] = [];
const countries: {
  iso3: string;
  name: string;
  continent: string;
  region: string;
}[] = [];

for (const f of raw.features) {
  const p = f.properties;
  const iso3 = isoOf(p);
  const name = String(p.NAME_LONG ?? p.NAME ?? "");
  if (!iso3) {
    rejected.push(name);
    continue;
  }
  if (seen.has(iso3)) continue;
  seen.add(iso3);
  features.push({
    type: "Feature",
    properties: { iso3, name },
    geometry: f.geometry,
  });
  countries.push({
    iso3,
    name,
    continent: String(p.CONTINENT ?? ""),
    region: String(p.SUBREGION ?? ""),
  });
}

countries.sort((a, b) => a.iso3.localeCompare(b.iso3));

mkdirSync("public/data", { recursive: true });
writeFileSync(
  "public/data/world.geo.json",
  JSON.stringify({ type: "FeatureCollection", features })
);
writeFileSync(
  "data/static/map-countries.json",
  JSON.stringify(countries, null, 2)
);

console.log(`boundaries: ${features.length} countries written`);
if (rejected.length) console.log(`rejected (no ISO3): ${rejected.join(", ")}`);

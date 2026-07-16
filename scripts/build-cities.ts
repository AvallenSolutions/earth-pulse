/**
 * Build public/data/cities.json from Natural Earth populated places (50m).
 *
 * Source: data/raw/ne_50m_populated_places_simple.geojson (public domain,
 * https://www.naturalearthdata.com). Download with:
 *   curl -sL https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_populated_places_simple.geojson \
 *     -o data/raw/ne_50m_populated_places_simple.geojson
 *
 * Keeps national capitals and every place above a population floor, ranks
 * them into three display tiers so the map can reveal labels progressively:
 *   tier 0: megacities + the world's biggest cities (visible from space)
 *   tier 1: large cities and capitals
 *   tier 2: the rest (visible once zoomed in)
 *
 * Run: npx tsx scripts/build-cities.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type NEFeature = {
  properties: {
    name: string;
    adm0_a3: string;
    adm0name: string;
    adm0cap: number;
    megacity: number;
    worldcity: number;
    latitude: number;
    longitude: number;
    pop_max: number;
  };
};

export type City = {
  name: string;
  iso3: string;
  country: string;
  lon: number;
  lat: number;
  pop: number;
  capital: boolean;
  tier: 0 | 1 | 2;
};

const RAW = resolve("data/raw/ne_50m_populated_places_simple.geojson");
const OUT = resolve("public/data/cities.json");

const POP_FLOOR = 300_000; // non-capitals below this are dropped

const geo = JSON.parse(readFileSync(RAW, "utf8")) as { features: NEFeature[] };

const cities: City[] = [];
const rejected: string[] = [];

for (const f of geo.features) {
  const p = f.properties;
  const capital = p.adm0cap === 1;
  if (!capital && (p.pop_max ?? 0) < POP_FLOOR) continue;
  // ISO3 discipline: NE uses a few non-ISO sovereignty codes (e.g. KOS).
  // Anything that is not three uppercase letters goes to the review log.
  if (!/^[A-Z]{3}$/.test(p.adm0_a3)) {
    rejected.push(`${p.name} (${p.adm0_a3})`);
    continue;
  }
  cities.push({
    name: p.name,
    iso3: p.adm0_a3,
    country: p.adm0name,
    lon: Math.round(p.longitude * 1000) / 1000,
    lat: Math.round(p.latitude * 1000) / 1000,
    pop: p.pop_max ?? 0,
    capital,
    tier: 2, // assigned below
  });
}

// Tiering: top 40 by population are tier 0; the next 160 plus every national
// capital are tier 1; everything else tier 2.
cities.sort((a, b) => b.pop - a.pop);
cities.forEach((c, i) => {
  c.tier = i < 40 ? 0 : i < 200 || c.capital ? 1 : 2;
});

writeFileSync(OUT, JSON.stringify({ cities }));

console.log(
  `cities.json: ${cities.length} cities ` +
    `(tier0 ${cities.filter((c) => c.tier === 0).length}, ` +
    `tier1 ${cities.filter((c) => c.tier === 1).length}, ` +
    `tier2 ${cities.filter((c) => c.tier === 2).length}), ` +
    `${cities.filter((c) => c.capital).length} capitals`
);
if (rejected.length) console.log(`rejected (no ISO3): ${rejected.join(", ")}`);

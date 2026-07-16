/**
 * Enrich public/data/cities.json with night sky quality and build the
 * per-city historical series public/data/sky-quality.json.
 *
 * Source: Light Pollution Atlas binary tiles by David J. Lorenz
 * (https://djlorenz.github.io/astronomy/lp2024/), decoded via src/lib/sky.ts.
 * Tiles are cached in data/raw/lp-tiles/<year>/ so re-runs are offline.
 *
 * Run AFTER build-cities.ts (it rewrites fields onto the existing records):
 *   npx tsx scripts/build-sky-quality.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  ATLAS_YEARS,
  atlasIndexFor,
  atlasTileUrl,
  decodeAtlasPoint,
  mpsasFromRatio,
} from "../src/lib/sky";

type City = {
  name: string; iso3: string; country: string; lon: number; lat: number;
  pop: number; capital: boolean; tier: number; mpsas?: number | null;
};

const CITIES = resolve("public/data/cities.json");
const OUT = resolve("public/data/sky-quality.json");
const CACHE = resolve("data/raw/lp-tiles");

async function tileBytes(year: number, tilex: number, tiley: number): Promise<Int8Array | null> {
  const dir = join(CACHE, String(year));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `binary_tile_${tilex}_${tiley}.dat.gz`);
  if (!existsSync(file)) {
    const res = await fetch(atlasTileUrl(year, tilex, tiley), {
      headers: { "User-Agent": "earth-pulse/1.0 (public climate dashboard)" },
    });
    if (!res.ok) {
      console.warn(`  missing tile ${year}/${tilex}_${tiley} (${res.status})`);
      return null;
    }
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return new Int8Array(gunzipSync(readFileSync(file)).buffer);
}

async function main() {
  const { cities } = JSON.parse(readFileSync(CITIES, "utf8")) as { cities: City[] };

  // Group cities by tile so each tile is decoded once per year
  const byTile = new Map<string, { idx: ReturnType<typeof atlasIndexFor>; city: City }[]>();
  let outOfCoverage = 0;
  for (const city of cities) {
    const idx = atlasIndexFor(city.lon, city.lat);
    if (!idx) {
      outOfCoverage++;
      continue;
    }
    const key = `${idx.tilex}_${idx.tiley}`;
    if (!byTile.has(key)) byTile.set(key, []);
    byTile.get(key)!.push({ idx, city });
  }
  console.log(`${cities.length} cities across ${byTile.size} atlas tiles; ${outOfCoverage} outside coverage`);

  const seriesKey = (c: City) => `${c.iso3}/${c.name}`;
  const dupes = new Set<string>();
  {
    const seen = new Set<string>();
    for (const c of cities) {
      const k = seriesKey(c);
      if (seen.has(k)) dupes.add(k);
      seen.add(k);
    }
    if (dupes.size) console.warn(`duplicate city keys (first record wins): ${[...dupes].join(", ")}`);
  }

  const series = new Map<string, (number | null)[]>();
  for (const c of cities) series.set(seriesKey(c), ATLAS_YEARS.map(() => null));

  for (const [yi, year] of ATLAS_YEARS.entries()) {
    let done = 0;
    for (const [key, entries] of byTile) {
      const [tilex, tiley] = key.split("_").map(Number);
      const bytes = await tileBytes(year, tilex, tiley);
      if (bytes) {
        for (const { idx, city } of entries) {
          const mpsas = mpsasFromRatio(decodeAtlasPoint(bytes, idx!.ix, idx!.iy));
          const arr = series.get(seriesKey(city))!;
          if (arr[yi] === null) arr[yi] = Math.round(mpsas * 100) / 100;
        }
      }
      if (++done % 100 === 0) console.log(`  ${year}: ${done}/${byTile.size} tiles`);
    }
    console.log(`${year}: done`);
  }

  // Latest year (1 d.p.) onto the city records for the popup
  const latest = ATLAS_YEARS.length - 1;
  for (const c of cities) {
    const arr = series.get(seriesKey(c))!;
    c.mpsas = arr[latest] === null ? null : Math.round(arr[latest]! * 10) / 10;
  }
  writeFileSync(CITIES, JSON.stringify({ cities }));

  writeFileSync(
    OUT,
    JSON.stringify({
      years: ATLAS_YEARS,
      attribution:
        "Light Pollution Atlas 2016-2024 by David J. Lorenz, from VIIRS satellite data",
      cities: Object.fromEntries(series),
    })
  );

  const withData = cities.filter((c) => c.mpsas !== null && c.mpsas !== undefined).length;
  console.log(`sky-quality.json written; ${withData}/${cities.length} cities have 2024 data`);
  const sample = (name: string) => {
    const c = cities.find((x) => x.name === name);
    if (c) console.log(`  ${name}: 2024 mpsas ${c.mpsas} | series ${JSON.stringify(series.get(seriesKey(c)))}`);
  };
  sample("London");
  sample("Tokyo");
  sample("Reykjavík");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

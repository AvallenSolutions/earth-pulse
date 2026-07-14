/**
 * Downloads every M6+ earthquake since 1900 from the USGS FDSN archive into
 * per-year files matching the live feed's shape, so the map's history layer
 * and the popup reuse the same machinery:
 *
 *   public/data/quakes-history/{year}.json =
 *     { quakes: [{ lon, lat, mag, depth, place, time, url }] }
 *
 * ~126 sequential requests, politely spaced. Idempotent: skips years whose
 * file already exists unless --force.
 *
 * Run: npx tsx scripts/ingest-quakes-history.ts
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { markFresh } from "./lib/freshness";

const FIRST = 1900;
const LAST = new Date().getFullYear();
const force = process.argv.includes("--force");

type UsgsFeature = {
  geometry: { coordinates: [number, number, number] };
  properties: { mag: number; place: string | null; time: number; url: string };
};

async function fetchYear(year: number, attempt = 1): Promise<UsgsFeature[]> {
  const url =
    `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson` +
    `&starttime=${year}-01-01&endtime=${year + 1}-01-01&minmagnitude=6`;
  const res = await fetch(url, {
    headers: { "User-Agent": "earth-pulse/1.0 (public climate dashboard)" },
  });
  if (!res.ok) {
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 3000 * attempt));
      return fetchYear(year, attempt + 1);
    }
    throw new Error(`${res.status} for ${year}`);
  }
  return ((await res.json()).features ?? []) as UsgsFeature[];
}

async function main() {
  mkdirSync("public/data/quakes-history", { recursive: true });
  let total = 0;
  for (let year = FIRST; year <= LAST; year++) {
    const path = `public/data/quakes-history/${year}.json`;
    if (!force && existsSync(path)) continue;
    const features = await fetchYear(year);
    const quakes = features
      .filter((f) => f.geometry?.coordinates && Number.isFinite(f.properties.mag))
      .map((f) => ({
        lon: Number(f.geometry.coordinates[0].toFixed(2)),
        lat: Number(f.geometry.coordinates[1].toFixed(2)),
        depth: Number((f.geometry.coordinates[2] ?? 0).toFixed(0)),
        mag: Number(f.properties.mag.toFixed(1)),
        place: (f.properties.place ?? "").slice(0, 80),
        time: f.properties.time,
        url: f.properties.url,
      }));
    writeFileSync(path, JSON.stringify({ quakes }));
    total += quakes.length;
    console.log(`${year}: ${quakes.length} quakes`);
    await new Promise((r) => setTimeout(r, 400));
  }
  writeFileSync(
    "public/data/quakes-history/index.json",
    JSON.stringify({ firstYear: FIRST, lastYear: LAST })
  );
  console.log(`done: ${total} new quakes written`);
  markFresh("quakes-history");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

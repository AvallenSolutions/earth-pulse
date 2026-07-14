/**
 * Sweeps the GDACS archive (2000+) for floods, droughts, wildfires and
 * volcanoes into per-year files matching the live feed's shape:
 *
 *   public/data/disasters-history/{year}.json = { events: [...] }
 *
 * GDACS starts around 2000 and wildfire alerts only exist from ~2022; years
 * simply contain what the archive has. Earthquakes are excluded (the USGS
 * archive is deeper). Idempotent: skips existing files unless --force.
 *
 * Run: npx tsx scripts/ingest-disasters-history.ts
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { markFresh } from "./lib/freshness";

const FIRST = 2000;
const LAST = new Date().getFullYear();
const TYPES = ["FL", "DR", "WF", "VO", "TC"];
const force = process.argv.includes("--force");

type GdacsFeature = {
  geometry: { type: string; coordinates: [number, number] };
  properties: {
    eventtype: string;
    eventid: number;
    alertlevel: string;
    name?: string;
    eventname?: string;
    country?: string;
    fromdate?: string;
    todate?: string;
    severitydata?: { severitytext?: string };
  };
};

async function fetchTypeYear(year: number, type: string): Promise<GdacsFeature[]> {
  const url =
    `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH` +
    `?fromDate=${year}-01-01&toDate=${year}-12-31&eventlist=${type}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "earth-pulse/1.0 (public climate dashboard)" },
    });
    if (!res.ok) return [];
    return (((await res.json()) as { features?: GdacsFeature[] }).features ?? []);
  } catch {
    return [];
  }
}

async function main() {
  mkdirSync("public/data/disasters-history", { recursive: true });
  let total = 0;
  for (let year = FIRST; year <= LAST; year++) {
    const path = `public/data/disasters-history/${year}.json`;
    if (!force && existsSync(path)) continue;
    const seen = new Set<number>();
    const events: object[] = [];
    for (const type of TYPES) {
      const features = await fetchTypeYear(year, type);
      for (const f of features) {
        if (f.geometry?.type !== "Point") continue;
        if (seen.has(f.properties.eventid)) continue;
        seen.add(f.properties.eventid);
        events.push({
          lon: Number(f.geometry.coordinates[0].toFixed(2)),
          lat: Number(f.geometry.coordinates[1].toFixed(2)),
          type: f.properties.eventtype,
          level: f.properties.alertlevel,
          name: (f.properties.name || f.properties.eventname || "").slice(0, 80),
          country: (f.properties.country || "").slice(0, 120),
          severity: (f.properties.severitydata?.severitytext || "").slice(0, 120),
          from: (f.properties.fromdate || "").slice(0, 10),
          to: (f.properties.todate || "").slice(0, 10),
          eventid: f.properties.eventid,
        });
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    writeFileSync(path, JSON.stringify({ events }));
    total += events.length;
    console.log(`${year}: ${events.length} events`);
  }
  writeFileSync(
    "public/data/disasters-history/index.json",
    JSON.stringify({ firstYear: FIRST, lastYear: LAST })
  );
  console.log(`done: ${total} events written`);
  markFresh("disasters-history");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Converts the IBTrACS archive (every tropical cyclone since the 1840s) into
 * one compact JSON file per season for the map's storm-tracks layer:
 *
 *   public/data/storms/{year}.json =
 *     { storms: [{ id, name, cat, maxWind, points: [[lon, lat, wind], ...] }] }
 *
 * - main tracks only (spurs excluded), thinned to 6-hourly points
 * - wind in knots (WMO first, USA agency fallback, 0 = unknown)
 * - cat: 0 TD/unknown, 1 TS, 2..6 = Saffir-Simpson category 1..5
 *
 * Run: npx tsx scripts/ingest-storms.ts
 */
import { createReadStream, writeFileSync, mkdirSync } from "node:fs";
import { markFresh } from "./lib/freshness";
import { createInterface } from "node:readline";

type Storm = {
  id: string;
  name: string;
  maxWind: number;
  points: [number, number, number][];
};

function category(windKt: number): number {
  if (windKt >= 137) return 6;
  if (windKt >= 113) return 5;
  if (windKt >= 96) return 4;
  if (windKt >= 83) return 3;
  if (windKt >= 64) return 2;
  if (windKt >= 34) return 1;
  return 0;
}

async function main() {
  const byYear = new Map<number, Map<string, Storm>>();
  const rl = createInterface({
    input: createReadStream("data/raw/ibtracs.ALL.csv"),
    crlfDelay: Infinity,
  });

  let header: string[] | null = null;
  let idx: Record<string, number> = {};
  let rows = 0;

  for await (const line of rl) {
    if (!header) {
      header = line.split(",");
      idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
      continue;
    }
    // second line is the units row
    if (line.startsWith(" ,") || line.startsWith(",")) continue;
    const c = line.split(",");
    if (c.length < 15) continue;
    const trackType = c[idx.TRACK_TYPE]?.trim();
    if (trackType && trackType !== "main") continue;
    const season = Number(c[idx.SEASON]);
    if (!Number.isFinite(season) || season < 1842) continue;
    const isoTime = c[idx.ISO_TIME]?.trim() ?? "";
    const hour = Number(isoTime.slice(11, 13));
    if (hour % 6 !== 0) continue; // thin to 6-hourly
    const lat = Number(c[idx.LAT]);
    let lon = Number(c[idx.LON]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const wind =
      Number(c[idx.WMO_WIND]) || Number(c[idx.USA_WIND]) || 0;

    const sid = c[idx.SID];
    if (!byYear.has(season)) byYear.set(season, new Map());
    const storms = byYear.get(season)!;
    if (!storms.has(sid)) {
      const rawName = (c[idx.NAME] ?? "").trim();
      storms.set(sid, {
        id: sid,
        name:
          rawName && rawName !== "NOT_NAMED" && rawName !== "UNNAMED"
            ? rawName.charAt(0) + rawName.slice(1).toLowerCase()
            : "Unnamed storm",
        maxWind: 0,
        points: [],
      });
    }
    const storm = storms.get(sid)!;
    // Unwrap longitude so tracks crossing the antimeridian stay continuous
    // (MapLibre renders lngs beyond ±180 on the adjacent world copy). A raw
    // wrap from +179.9 to -179.9 would otherwise draw a straight line around
    // the whole planet.
    const prev = storm.points[storm.points.length - 1];
    if (prev) {
      while (lon - prev[0] > 180) lon -= 360;
      while (lon - prev[0] < -180) lon += 360;
    } else if (lon > 180) {
      lon -= 360;
    }
    storm.points.push([
      Number(lon.toFixed(1)),
      Number(lat.toFixed(1)),
      Math.round(wind),
    ]);
    if (wind > storm.maxWind) storm.maxWind = Math.round(wind);
    rows++;
  }

  mkdirSync("public/data/storms", { recursive: true });
  let total = 0;
  let bytes = 0;
  const years = [...byYear.keys()].sort();
  for (const year of years) {
    const storms = [...byYear.get(year)!.values()]
      .filter((s) => s.points.length >= 3)
      .map((s) => ({ ...s, cat: category(s.maxWind) }));
    if (!storms.length) continue;
    const json = JSON.stringify({ storms });
    writeFileSync(`public/data/storms/${year}.json`, json);
    total += storms.length;
    bytes += json.length;
  }
  writeFileSync(
    "public/data/storms/index.json",
    JSON.stringify({ firstYear: years[0], lastYear: years[years.length - 1] })
  );
  console.log(
    `${rows} track points -> ${total} storms across ${years.length} seasons (${years[0]}-${years[years.length - 1]}), ${(bytes / 1e6).toFixed(1)}MB total`
  );
  markFresh("storms");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

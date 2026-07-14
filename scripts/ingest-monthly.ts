/**
 * Monthly-resolution observations for the map's month slider.
 *
 * Source: World Bank CCKP observed ERA5 (era5-x0.25), country-aggregated
 * monthly means, 1950-2024 - the same portal the CMIP6 projections come
 * from, so the country aggregation is consistent.
 *
 * Both metrics are anomalies against that calendar month's own 1991-2020
 * mean, mirroring the annual metrics' semantics and colour ramps:
 *   temperature_anomaly  degC vs the month's 1991-2020 mean
 *   precip_anomaly       % vs the month's 1991-2020 mean (skipped where the
 *                        baseline is under 5 mm - deserts make % meaningless)
 *
 * Outputs:
 *   public/data/monthly/<metric>/<year>.json   { iso3: [12 values | null] }
 *   public/data/monthly/<metric>/index.json    { firstYear, lastYear, ... }
 *
 * Run: npx tsx scripts/ingest-monthly.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { markFresh } from "./lib/freshness";

const PERIOD = "1950-2024";
const FIRST_YEAR = 1950;
const LAST_YEAR = 2024;
const BASELINE: [number, number] = [1991, 2020];
const BATCH = 20;

type MonthMap = Record<string, number>; // "1950-01" -> value

async function fetchBatch(
  variable: "tas" | "pr",
  isos: string[],
  attempt = 1
): Promise<Record<string, MonthMap>> {
  const url =
    `https://cckpapi.worldbank.org/cckp/v1/` +
    `era5-x0.25_timeseries_${variable}_timeseries_monthly_${PERIOD}_mean_historical_era5_x0.25_mean/` +
    `${isos.join(",")}?_format=json`;
  const res = await fetch(url, {
    headers: { "User-Agent": "earth-pulse/1.0 (public climate dashboard)" },
  });
  if (!res.ok) {
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 4000 * attempt));
      return fetchBatch(variable, isos, attempt + 1);
    }
    throw new Error(`${res.status} for ${variable} batch ${isos[0]}...`);
  }
  return ((await res.json()).data ?? {}) as Record<string, MonthMap>;
}

function ingestVariable(
  metricId: string,
  months: Record<string, MonthMap>,
  kind: "abs_anomaly" | "pct_anomaly",
  byYear: Map<number, Record<string, (number | null)[]>>
): number {
  let kept = 0;
  for (const [iso3, series] of Object.entries(months)) {
    // per-calendar-month 1991-2020 climatology
    const clim: number[][] = Array.from({ length: 12 }, () => []);
    for (const [key, value] of Object.entries(series)) {
      const y = Number(key.slice(0, 4));
      const m = Number(key.slice(5, 7)) - 1;
      if (y >= BASELINE[0] && y <= BASELINE[1] && Number.isFinite(value))
        clim[m].push(value);
    }
    const base = clim.map((xs) =>
      xs.length >= 20 ? xs.reduce((s, x) => s + x, 0) / xs.length : null
    );
    if (base.every((b) => b === null)) continue;
    kept++;
    for (const [key, value] of Object.entries(series)) {
      const y = Number(key.slice(0, 4));
      const m = Number(key.slice(5, 7)) - 1;
      if (y < FIRST_YEAR || y > LAST_YEAR || !Number.isFinite(value)) continue;
      const b = base[m];
      let out: number | null = null;
      if (b !== null) {
        if (kind === "abs_anomaly") out = Number((value - b).toFixed(2));
        else if (b >= 5)
          // % anomaly is meaningless against a near-zero rainfall baseline
          out = Number(
            (Math.max(-100, Math.min(200, ((value - b) / b) * 100))).toFixed(1)
          );
      }
      if (!byYear.has(y)) byYear.set(y, {});
      const yearMap = byYear.get(y)!;
      if (!yearMap[iso3]) yearMap[iso3] = Array(12).fill(null);
      yearMap[iso3][m] = out;
    }
  }
  return kept;
}

async function main() {
  const countries = (
    JSON.parse(readFileSync("data/static/countries.json", "utf8")) as {
      iso3: string;
    }[]
  )
    .map((c) => c.iso3)
    .filter((i) => i !== "WLD");

  const variables: {
    variable: "tas" | "pr";
    metricId: string;
    kind: "abs_anomaly" | "pct_anomaly";
    unit: string;
  }[] = [
    {
      variable: "tas",
      metricId: "temperature_anomaly",
      kind: "abs_anomaly",
      unit: "°C vs the month's 1991-2020 mean",
    },
    {
      variable: "pr",
      metricId: "precip_anomaly",
      kind: "pct_anomaly",
      unit: "% vs the month's 1991-2020 mean",
    },
  ];

  for (const v of variables) {
    const byYear = new Map<number, Record<string, (number | null)[]>>();
    let total = 0;
    for (let i = 0; i < countries.length; i += BATCH) {
      const batch = countries.slice(i, i + BATCH);
      const data = await fetchBatch(v.variable, batch);
      total += ingestVariable(v.metricId, data, v.kind, byYear);
      process.stdout.write(
        `\r${v.metricId}: ${Math.min(i + BATCH, countries.length)}/${countries.length} countries`
      );
      await new Promise((r) => setTimeout(r, 400));
    }
    console.log("");
    const dir = `public/data/monthly/${v.metricId}`;
    mkdirSync(dir, { recursive: true });
    let bytes = 0;
    for (const [year, values] of byYear) {
      const json = JSON.stringify(values);
      bytes += json.length;
      writeFileSync(`${dir}/${year}.json`, json);
    }
    writeFileSync(
      `${dir}/index.json`,
      JSON.stringify({
        firstYear: FIRST_YEAR,
        lastYear: LAST_YEAR,
        unit: v.unit,
        source: "ERA5 observed, country means via World Bank CCKP",
        method: `Anomaly against that calendar month's own ${BASELINE[0]}-${BASELINE[1]} mean.`,
      })
    );
    console.log(
      `${v.metricId}: ${total} countries, ${byYear.size} years, ${(bytes / 1e6).toFixed(1)}MB`
    );
  }
  markFresh("monthly");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Pulls CMIP6 multi-model median projections (2015-2100) per country and
 * scenario from the World Bank Climate Change Knowledge Portal, and anchors
 * them to the matching OBSERVED Earth Pulse metric.
 *
 * Variables: tas -> temperature_anomaly (degC vs 1991-2020)
 *            pr  -> precipitation (mm/year)
 *
 * Bias correction is the standard delta method: the projection is expressed
 * as change relative to the model ensemble's own 2015-2024 mean, then added
 * to the country's OBSERVED mean over 2015-2024. Models and observations
 * therefore agree by construction where they overlap, and only the modelled
 * *change* is projected forward.
 *
 * Outputs (per metric):
 *   public/data/projections/<metric>/{scenario}/{year}.json  choropleths
 *   public/data/projections/<metric>/series_{scenario}.json  per-country series
 *   public/data/projections/<metric>/index.json
 *
 * Run: npx tsx scripts/ingest-projections.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { markFresh } from "./lib/freshness";

const SCENARIOS = ["ssp126", "ssp245", "ssp585"];
const FIRST_PROJ_YEAR = 2026;
const LAST_PROJ_YEAR = 2100;
const ANCHOR_YEARS: [number, number] = [2015, 2024];
const BATCH = 20;

const VARIABLES = [
  { variable: "tas", metricId: "temperature_anomaly", decimals: 2, floor: null },
  // rainfall cannot go negative however dry the model gets
  { variable: "pr", metricId: "precipitation", decimals: 0, floor: 0 },
] as const;

type Series = Record<string, [number, number][]>;

async function fetchBatch(
  variable: string,
  scenario: string,
  isos: string[],
  attempt = 1
): Promise<Record<string, Record<string, number>>> {
  const url =
    `https://cckpapi.worldbank.org/cckp/v1/` +
    `cmip6-x0.25_timeseries_${variable}_timeseries_annual_2015-2100_median_${scenario}_ensemble_all_mean/` +
    `${isos.join(",")}?_format=json`;
  const res = await fetch(url, {
    headers: { "User-Agent": "earth-pulse/1.0 (public climate dashboard)" },
  });
  if (!res.ok) {
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 4000 * attempt));
      return fetchBatch(variable, scenario, isos, attempt + 1);
    }
    throw new Error(`${res.status} for ${variable}/${scenario} batch ${isos[0]}...`);
  }
  return ((await res.json()).data ?? {}) as Record<string, Record<string, number>>;
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

async function main() {
  const countries = (
    JSON.parse(readFileSync("data/static/countries.json", "utf8")) as {
      iso3: string;
    }[]
  )
    .map((c) => c.iso3)
    .filter((i) => i !== "WLD");

  for (const v of VARIABLES) {
    // Observed anchor: mean of the matching observed metric 2015-2024
    const observed = JSON.parse(
      readFileSync(`public/data/series/${v.metricId}.json`, "utf8")
    ) as Series;
    const anchor = new Map<string, number>();
    for (const [iso3, points] of Object.entries(observed)) {
      const window = points
        .filter(([y]) => y >= ANCHOR_YEARS[0] && y <= ANCHOR_YEARS[1])
        .map(([, val]) => val);
      if (window.length >= 5) anchor.set(iso3, mean(window));
    }

    mkdirSync(`public/data/projections/${v.metricId}`, { recursive: true });

    for (const scenario of SCENARIOS) {
      const seriesOut: Series = {};
      const byYear = new Map<number, Record<string, number>>();
      for (let i = 0; i < countries.length; i += BATCH) {
        const batch = countries.slice(i, i + BATCH);
        const data = await fetchBatch(v.variable, scenario, batch);
        for (const [iso3, years] of Object.entries(data)) {
          if (!anchor.has(iso3)) continue;
          const model: [number, number][] = Object.entries(years)
            .map(([k, val]) => [Number(k.slice(0, 4)), val] as [number, number])
            .filter(([y, val]) => Number.isFinite(y) && Number.isFinite(val))
            .sort((a, b) => a[0] - b[0]);
          const base = model
            .filter(([y]) => y >= ANCHOR_YEARS[0] && y <= ANCHOR_YEARS[1])
            .map(([, val]) => val);
          if (base.length < 5) continue;
          const modelBase = mean(base);
          const obsAnchor = anchor.get(iso3)!;
          const proj = model
            .filter(([y]) => y >= FIRST_PROJ_YEAR && y <= LAST_PROJ_YEAR)
            .map(([y, val]) => {
              let out = obsAnchor + val - modelBase;
              if (v.floor !== null) out = Math.max(v.floor, out);
              return [y, Number(out.toFixed(v.decimals))] as [number, number];
            });
          if (!proj.length) continue;
          seriesOut[iso3] = proj;
          for (const [y, val] of proj) {
            if (!byYear.has(y)) byYear.set(y, {});
            byYear.get(y)![iso3] = val;
          }
        }
        process.stdout.write(
          `\r${v.metricId}/${scenario}: ${Math.min(i + BATCH, countries.length)}/${countries.length} countries`
        );
        await new Promise((r) => setTimeout(r, 500));
      }
      console.log("");
      mkdirSync(`public/data/projections/${v.metricId}/${scenario}`, {
        recursive: true,
      });
      for (const [year, values] of byYear) {
        writeFileSync(
          `public/data/projections/${v.metricId}/${scenario}/${year}.json`,
          JSON.stringify(values)
        );
      }
      writeFileSync(
        `public/data/projections/${v.metricId}/series_${scenario}.json`,
        JSON.stringify(seriesOut)
      );
      console.log(
        `${v.metricId}/${scenario}: ${Object.keys(seriesOut).length} countries, ${byYear.size} years`
      );
    }

    writeFileSync(
      `public/data/projections/${v.metricId}/index.json`,
      JSON.stringify({
        scenarios: SCENARIOS,
        firstYear: FIRST_PROJ_YEAR,
        lastYear: LAST_PROJ_YEAR,
        source: "CMIP6 multi-model median via World Bank CCKP",
        method:
          "Delta method: modelled change vs the ensemble's 2015-2024 mean, added to the observed 2015-2024 mean of the matching Earth Pulse metric.",
      })
    );
  }
  markFresh("projections");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

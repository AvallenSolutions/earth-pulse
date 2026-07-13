/**
 * Pulls CMIP6 multi-model median temperature projections (2015-2100) per
 * country and scenario from the World Bank Climate Change Knowledge Portal,
 * and converts them to anomalies on the same 1991-2020 ERA5 baseline as the
 * observed temperature_anomaly metric.
 *
 * Bias correction is the standard delta method: the projection is expressed
 * as change relative to the model ensemble's own 2015-2024 mean, then added
 * to the country's OBSERVED mean anomaly over 2015-2024. Models and
 * observations therefore agree by construction where they overlap, and only
 * the modelled *change* is projected forward.
 *
 * Outputs:
 *   public/data/projections/temperature_anomaly/{scenario}/{year}.json  choropleths
 *   public/data/projections/temperature_anomaly/series_{scenario}.json  per-country series
 *   public/data/projections/temperature_anomaly/index.json
 *
 * Run: npx tsx scripts/ingest-projections.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const SCENARIOS = ["ssp126", "ssp245", "ssp585"];
const FIRST_PROJ_YEAR = 2026;
const LAST_PROJ_YEAR = 2100;
const ANCHOR_YEARS: [number, number] = [2015, 2024];
const BATCH = 20;

type Series = Record<string, [number, number][]>;

async function fetchBatch(
  scenario: string,
  isos: string[],
  attempt = 1
): Promise<Record<string, Record<string, number>>> {
  const url =
    `https://cckpapi.worldbank.org/cckp/v1/` +
    `cmip6-x0.25_timeseries_tas_timeseries_annual_2015-2100_median_${scenario}_ensemble_all_mean/` +
    `${isos.join(",")}?_format=json`;
  const res = await fetch(url, {
    headers: { "User-Agent": "earth-pulse/1.0 (public climate dashboard)" },
  });
  if (!res.ok) {
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 4000 * attempt));
      return fetchBatch(scenario, isos, attempt + 1);
    }
    throw new Error(`${res.status} for ${scenario} batch ${isos[0]}...`);
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

  // Observed anchor: mean ERA5 anomaly 2015-2024 per country
  const observed = JSON.parse(
    readFileSync("public/data/series/temperature_anomaly.json", "utf8")
  ) as Series;
  const anchor = new Map<string, number>();
  for (const [iso3, points] of Object.entries(observed)) {
    const window = points
      .filter(([y]) => y >= ANCHOR_YEARS[0] && y <= ANCHOR_YEARS[1])
      .map(([, v]) => v);
    if (window.length >= 5) anchor.set(iso3, mean(window));
  }

  mkdirSync("public/data/projections/temperature_anomaly", { recursive: true });

  for (const scenario of SCENARIOS) {
    const seriesOut: Series = {};
    const byYear = new Map<number, Record<string, number>>();
    for (let i = 0; i < countries.length; i += BATCH) {
      const batch = countries.slice(i, i + BATCH);
      const data = await fetchBatch(scenario, batch);
      for (const [iso3, months] of Object.entries(data)) {
        if (!anchor.has(iso3)) continue;
        const tas: [number, number][] = Object.entries(months)
          .map(([k, v]) => [Number(k.slice(0, 4)), v] as [number, number])
          .filter(([y, v]) => Number.isFinite(y) && Number.isFinite(v))
          .sort((a, b) => a[0] - b[0]);
        const base = tas
          .filter(([y]) => y >= ANCHOR_YEARS[0] && y <= ANCHOR_YEARS[1])
          .map(([, v]) => v);
        if (base.length < 5) continue;
        const modelBase = mean(base);
        const obsAnchor = anchor.get(iso3)!;
        const proj = tas
          .filter(([y]) => y >= FIRST_PROJ_YEAR && y <= LAST_PROJ_YEAR)
          .map(
            ([y, v]) =>
              [y, Number((obsAnchor + v - modelBase).toFixed(2))] as [
                number,
                number,
              ]
          );
        if (!proj.length) continue;
        seriesOut[iso3] = proj;
        for (const [y, v] of proj) {
          if (!byYear.has(y)) byYear.set(y, {});
          byYear.get(y)![iso3] = v;
        }
      }
      process.stdout.write(
        `\r${scenario}: ${Math.min(i + BATCH, countries.length)}/${countries.length} countries`
      );
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log("");
    mkdirSync(`public/data/projections/temperature_anomaly/${scenario}`, {
      recursive: true,
    });
    for (const [year, values] of byYear) {
      writeFileSync(
        `public/data/projections/temperature_anomaly/${scenario}/${year}.json`,
        JSON.stringify(values)
      );
    }
    writeFileSync(
      `public/data/projections/temperature_anomaly/series_${scenario}.json`,
      JSON.stringify(seriesOut)
    );
    console.log(
      `${scenario}: ${Object.keys(seriesOut).length} countries, ${byYear.size} years`
    );
  }

  writeFileSync(
    "public/data/projections/temperature_anomaly/index.json",
    JSON.stringify({
      scenarios: SCENARIOS,
      firstYear: FIRST_PROJ_YEAR,
      lastYear: LAST_PROJ_YEAR,
      source: "CMIP6 multi-model median via World Bank CCKP",
      method:
        "Delta method: modelled change vs the ensemble's 2015-2024 mean, added to the observed ERA5 anomaly mean for 2015-2024 (baseline 1991-2020).",
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Downloads the OWID datasets named in the registry, extracts each metric's
 * column keyed by ISO3 + year, and writes the static tier:
 *
 *   public/data/metrics.json                  metric registry for the UI
 *   public/data/choropleth/<metric>/<year>.json   { iso3: value } per year
 *   public/data/series/<metric>.json          { iso3: [[year, value], ...] }
 *   data/static/countries.json                merged country reference
 *   data/static/rejects.json                  entities that could not resolve to ISO3
 *
 * Rows with no iso_code (OWID regional aggregates like "Asia") are skipped,
 * except "World" which is kept as pseudo-country WLD for the planet vitals.
 * Idempotent: safe to re-run; overwrites outputs.
 *
 * Run: npx tsx scripts/ingest-owid.ts [--skip-download]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { parseCsv } from "./lib/csv";
import { METRICS, DATASET_URLS, grapherUrl, type MetricDef } from "./lib/registry";

const skipDownload = process.argv.includes("--skip-download");

const datasetKey = (d: MetricDef["dataset"]): string =>
  typeof d === "string" ? d : `grapher_${d.grapherSlug}`;

const datasetUrl = (d: MetricDef["dataset"]): string =>
  typeof d === "string" ? DATASET_URLS[d] : grapherUrl(d.grapherSlug);

async function download(url: string, path: string) {
  if (skipDownload && existsSync(path)) return;
  console.log(`downloading ${url}`);
  const res = await fetch(url, { headers: { "User-Agent": "earth-pulse-ingest" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  writeFileSync(path, await res.text());
}

type CountryRef = {
  iso3: string;
  name: string;
  continent: string;
  region: string;
  on_map: boolean;
};

async function main() {
  // Countries seen on the Natural Earth map (built by build-boundaries.ts).
  // Kept separate from the merged countries.json this script writes, so
  // re-runs never inflate the on_map flag.
  const mapCountries = JSON.parse(
    readFileSync("data/static/map-countries.json", "utf8")
  ) as { iso3: string; name: string; continent: string; region: string }[];
  const countries = new Map<string, CountryRef>(
    mapCountries.map((c) => [c.iso3, { ...c, on_map: true }])
  );
  countries.set("WLD", {
    iso3: "WLD",
    name: "World",
    continent: "",
    region: "",
    on_map: false,
  });

  const rejects = new Map<string, string>(); // entity -> reason (deduped)

  // Group metrics by dataset so each big CSV is parsed once
  const byDataset = new Map<string, MetricDef[]>();
  for (const m of METRICS) {
    const key = datasetKey(m.dataset);
    byDataset.set(key, [...(byDataset.get(key) ?? []), m]);
  }

  mkdirSync("public/data", { recursive: true });

  for (const [key, metrics] of byDataset) {
    const path = `data/raw/${key}.csv`;
    await download(datasetUrl(metrics[0].dataset), path);
    const rows = parseCsv(readFileSync(path, "utf8"));
    const cols = Object.keys(rows[0] ?? {});
    console.log(`${key}: ${rows.length} rows`);

    // OWID conventions: full datasets use country/iso_code/year; grapher CSVs
    // use entity/code/year (casing has varied, so match case-insensitively).
    const col = (...names: string[]) =>
      cols.find((c) => names.includes(c.toLowerCase()));
    const entityCol = col("country", "entity")!;
    const codeCol = col("iso_code", "code")!;
    const yearCol = col("year")!;

    for (const m of metrics) {
      // Grapher CSVs have exactly one value column beyond Entity/Code/Year.
      const valueCol = cols.includes(m.column)
        ? m.column
        : cols.find((c) => ![entityCol, codeCol, yearCol].includes(c));
      if (!valueCol) throw new Error(`no value column for ${m.id} in ${key}`);

      // iso3 -> sorted [year, value][]
      const series = new Map<string, [number, number][]>();
      for (const row of rows) {
        const raw = row[valueCol];
        if (raw === "" || raw === undefined) continue;
        const year = Number(row[yearCol]);
        const value = Number(raw);
        if (!Number.isFinite(year) || !Number.isFinite(value)) continue;

        let iso3 = row[codeCol];
        if (iso3 === "OWID_WRL") iso3 = "WLD";
        if (!/^[A-Z]{3}$/.test(iso3)) {
          if (row[entityCol]) rejects.set(`${key}:${row[entityCol]}`, "no ISO3 code");
          continue;
        }
        if (!countries.has(iso3)) {
          // Real ISO3 country absent from the 110m map (e.g. Singapore):
          // register it so search and country pages still work.
          countries.set(iso3, {
            iso3,
            name: row[entityCol],
            continent: "",
            region: "",
            on_map: false,
          });
        }
        series.set(iso3, [...(series.get(iso3) ?? []), [year, value]]);
      }

      // Write per-year choropleth files and the per-metric series file
      const years = new Map<number, Record<string, number>>();
      const seriesOut: Record<string, [number, number][]> = {};
      let firstYear = Infinity;
      let lastYear = -Infinity;
      for (const [iso3, points] of series) {
        points.sort((a, b) => a[0] - b[0]);
        seriesOut[iso3] = points;
        for (const [year, value] of points) {
          if (iso3 === "WLD") continue; // world stays out of country choropleths
          firstYear = Math.min(firstYear, year);
          lastYear = Math.max(lastYear, year);
          if (!years.has(year)) years.set(year, {});
          years.get(year)![iso3] = value;
        }
      }
      mkdirSync(`public/data/choropleth/${m.id}`, { recursive: true });
      for (const [year, values] of years) {
        writeFileSync(
          `public/data/choropleth/${m.id}/${year}.json`,
          JSON.stringify(values)
        );
      }
      mkdirSync("public/data/series", { recursive: true });
      writeFileSync(`public/data/series/${m.id}.json`, JSON.stringify(seriesOut));

      (m as MetricDef & { firstYear?: number; lastYear?: number }).firstYear =
        firstYear;
      (m as MetricDef & { firstYear?: number; lastYear?: number }).lastYear =
        lastYear;
      console.log(
        `  ${m.id}: ${series.size} countries, ${firstYear}-${lastYear}`
      );
    }
  }

  // UI-facing registry (includes year bounds discovered during ingest)
  writeFileSync(
    "public/data/metrics.json",
    JSON.stringify(
      METRICS.map((m) => ({
        id: m.id,
        name: m.name,
        unit: m.unit,
        domain: m.domain,
        source: m.source,
        sourceUrl: m.sourceUrl,
        explainer: m.explainer,
        scale: m.scale,
        scaleType: m.scaleType,
        stops: m.stops,
        firstYear: (m as MetricDef & { firstYear?: number }).firstYear,
        lastYear: (m as MetricDef & { lastYear?: number }).lastYear,
      })),
      null,
      2
    )
  );

  const countryList = [...countries.values()].sort((a, b) =>
    a.iso3.localeCompare(b.iso3)
  );
  writeFileSync("data/static/countries.json", JSON.stringify(countryList, null, 2));
  writeFileSync(
    "public/data/countries.json",
    JSON.stringify(countryList, null, 2)
  );
  writeFileSync(
    "data/static/rejects.json",
    JSON.stringify([...rejects.entries()], null, 2)
  );
  console.log(
    `countries: ${countryList.length} total; rejects (regional aggregates etc.): ${rejects.size}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

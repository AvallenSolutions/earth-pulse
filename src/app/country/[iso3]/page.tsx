import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LineChart } from "@/components/LineChart";
import { ActionsCard } from "@/components/ActionsCard";
import { accentFor } from "@/lib/colors";
import {
  DOMAIN_LABELS,
  formatValue,
  type Country,
  type Metric,
  type SeriesFile,
} from "@/lib/types";

const dataDir = join(process.cwd(), "public", "data");

function load<T>(rel: string): T {
  return JSON.parse(readFileSync(join(dataDir, rel), "utf8")) as T;
}

/** World overlay only where units are directly comparable across countries. */
function comparable(unit: string): boolean {
  return /person|%|°C|µg\/m³|mm/.test(unit);
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** Rank among all countries in the country's own latest data year. */
function rankFor(
  metricId: string,
  iso3: string,
  year: number
): { rank: number; total: number; year: number } | null {
  const file = join(dataDir, "choropleth", metricId, `${year}.json`);
  if (!existsSync(file)) return null;
  const values = JSON.parse(readFileSync(file, "utf8")) as Record<string, number>;
  const mine = values[iso3];
  if (mine === undefined) return null;
  const all = Object.values(values);
  const rank = 1 + all.filter((v) => v > mine).length;
  return { rank, total: all.length, year };
}

/** Change over roughly the last 30 years of data. */
function deltaFor(
  series: [number, number][],
  unit: string
): string | null {
  const [lastYear, lastVal] = series[series.length - 1];
  const target = lastYear - 30;
  let base = series[0];
  for (const p of series) if (p[0] <= target) base = p;
  if (base[0] === lastYear) return null;
  // Anomaly/share-style units compare in absolute terms; magnitudes in %
  if (/%|°C|vs/.test(unit)) {
    const d = lastVal - base[1];
    const u = unit.startsWith("%") ? "pp" : unit.split(" ")[0];
    return `${d >= 0 ? "+" : ""}${Math.abs(d) >= 10 ? d.toFixed(0) : d.toFixed(1)} ${u} since ${base[0]}`;
  }
  if (base[1] === 0) return null;
  const pct = ((lastVal - base[1]) / Math.abs(base[1])) * 100;
  return `${pct >= 0 ? "+" : ""}${Math.abs(pct) >= 10 ? pct.toFixed(0) : pct.toFixed(1)}% since ${base[0]}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ iso3: string }>;
}): Promise<Metadata> {
  const { iso3 } = await params;
  const countries = load<Country[]>("countries.json");
  const country = countries.find((c) => c.iso3 === iso3.toUpperCase());
  return {
    title: country ? `${country.name} · Earth Pulse` : "Earth Pulse",
    description: country
      ? `Climate, energy, water and pollution history for ${country.name}, from 1750 to today where data exists.`
      : undefined,
  };
}

export default async function CountryPage({
  params,
}: {
  params: Promise<{ iso3: string }>;
}) {
  const { iso3: rawIso3 } = await params;
  const iso3 = rawIso3.toUpperCase();
  const countries = load<Country[]>("countries.json");
  const country = countries.find((c) => c.iso3 === iso3);
  if (!country || iso3 === "WLD") notFound();

  const metrics = load<Metric[]>("metrics.json");
  const seriesByMetric: Record<string, SeriesFile> = Object.fromEntries(
    metrics.map((m) => [m.id, load<SeriesFile>(`series/${m.id}.json`)])
  );

  const charts = metrics
    .map((metric) => {
      const series = seriesByMetric[metric.id][iso3];
      if (!series || series.length < 2) return null;
      const world = comparable(metric.unit)
        ? seriesByMetric[metric.id]["WLD"]
        : undefined;
      return {
        metric,
        series,
        world:
          world && world.length > 1
            ? { label: "World", points: world }
            : undefined,
        rank: metric.global
          ? null
          : rankFor(metric.id, iso3, series[series.length - 1][0]),
        delta: deltaFor(series, metric.unit),
      };
    })
    .filter(Boolean) as {
    metric: Metric;
    series: [number, number][];
    world?: { label: string; points: [number, number][] };
    rank: { rank: number; total: number; year: number } | null;
    delta: string | null;
  }[];

  const domains = [...new Set(charts.map((c) => c.metric.domain))];

  // Headline stat tiles
  const heroIds = [
    "co2_per_capita",
    "temperature_anomaly",
    "renewables_share_energy",
    "pm25",
  ];
  const hero = heroIds
    .map((id) => charts.find((c) => c.metric.id === id))
    .filter(Boolean) as typeof charts;

  // Same-region countries for quick comparison
  const neighbours = country.region
    ? countries
        .filter(
          (c) =>
            c.region === country.region && c.iso3 !== iso3 && c.iso3 !== "WLD"
        )
        .slice(0, 6)
    : [];

  return (
    <div className="min-h-dvh bg-[#0d0d0d] text-white">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Link href="/" className="text-sm text-[#6da7ec] hover:underline">
          ← Back to the world map
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {country.name}
        </h1>
        <p className="mt-1 text-sm text-[#c3c2b7]">
          {[...new Set([country.region, country.continent].filter(Boolean))].join(
            ", "
          ) || "Country profile"}
        </p>

        {hero.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {hero.map(({ metric, series, rank }) => {
              const [year, value] = series[series.length - 1];
              return (
                <div
                  key={metric.id}
                  className="rounded-xl border border-white/10 bg-[#1a1a19] p-3"
                >
                  <div className="text-[10px] font-medium uppercase tracking-wide text-[#898781]">
                    {metric.name}
                  </div>
                  <div
                    className="mt-1 text-xl font-semibold tabular-nums"
                    style={{ color: accentFor(metric.scaleType, metric.ramp) }}
                  >
                    {formatValue(value, "").trim()}
                  </div>
                  <div className="text-[10px] text-[#898781]">
                    {metric.unit} · {year}
                  </div>
                  {rank && (
                    <div className="mt-1.5 inline-block rounded-full bg-white/5 px-2 py-0.5 text-[10px] tabular-nums text-[#c3c2b7]">
                      {ordinal(rank.rank)} of {rank.total} countries
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {charts.length === 0 && (
          <p className="mt-10 text-[#c3c2b7]">
            No historical data is available for {country.name} yet.
          </p>
        )}

        {domains.map((d) => (
          <section key={d} className="mt-10">
            <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-[#898781]">
              {DOMAIN_LABELS[d] ?? d}
            </h2>
            <div className="grid gap-6 lg:grid-cols-2">
              {charts
                .filter((c) => c.metric.domain === d)
                .map(({ metric, series, world, rank, delta }) => {
                  const latest = series[series.length - 1];
                  return (
                    <div
                      key={metric.id}
                      className="rounded-xl border border-white/10 bg-[#1a1a19] p-4"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="text-sm font-medium">{metric.name}</h3>
                        <span className="shrink-0 text-xs tabular-nums text-[#c3c2b7]">
                          {formatValue(latest[1], metric.unit)} · {latest[0]}
                        </span>
                      </div>
                      {(delta || rank) && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {delta && (
                            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] tabular-nums text-[#c3c2b7]">
                              {delta}
                            </span>
                          )}
                          {rank && (
                            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] tabular-nums text-[#c3c2b7]">
                              {ordinal(rank.rank)} highest of {rank.total} ·{" "}
                              {rank.year}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="mt-3">
                        <LineChart
                          points={series}
                          unit={metric.unit}
                          colour={accentFor(metric.scaleType, metric.ramp)}
                          compare={world}
                        />
                      </div>
                      <p className="mt-2 text-xs leading-snug text-[#898781]">
                        {metric.explainer}{" "}
                        <a
                          href={metric.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#6da7ec] hover:underline"
                        >
                          {metric.source}
                        </a>
                      </p>
                    </div>
                  );
                })}
            </div>
          </section>
        ))}

        {charts.length > 0 && (
          <ActionsCard seriesByMetric={seriesByMetric} iso3={iso3} />
        )}

        {neighbours.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-[#898781]">
              Compare with neighbours
            </h2>
            <div className="flex flex-wrap gap-2">
              {neighbours.map((n) => (
                <Link
                  key={n.iso3}
                  href={`/country/${n.iso3}`}
                  className="rounded-full border border-white/10 bg-[#1a1a19] px-3 py-1.5 text-sm text-[#c3c2b7] transition-colors hover:bg-white/10 hover:text-white"
                >
                  {n.name}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

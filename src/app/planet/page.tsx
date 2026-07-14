import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import type { Metadata } from "next";
import { LineChart } from "@/components/LineChart";
import { MoversPanel } from "@/components/MoversPanel";
import { Stripes } from "@/components/Stripes";
import { accentFor } from "@/lib/colors";
import { formatValue, type Country, type Metric, type SeriesFile } from "@/lib/types";

export const metadata: Metadata = {
  title: "Planet trends · Earth Pulse",
  description:
    "The planet-scale signals: global sea level, ocean heat and polar ice sheet mass, from long-run observational records.",
};

const dataDir = join(process.cwd(), "public", "data");

function load<T>(rel: string): T {
  return JSON.parse(readFileSync(join(dataDir, rel), "utf8")) as T;
}

const WORLD_IDS = [
  "co2",
  "total_ghg",
  "methane",
  "temperature_anomaly",
  "renewables_share_energy",
  "coal_share_elec",
  "energy_per_capita",
  "pm25",
  "meat_supply",
];

function dataUpdatedLabel(): string | null {
  try {
    const stamps = load<Record<string, string>>("freshness.json");
    if (!stamps.metrics) return null;
    const days = Math.floor(
      (Date.now() - new Date(stamps.metrics).getTime()) / 86_400_000
    );
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    return `${days} days ago`;
  } catch {
    return null;
  }
}

export default function PlanetPage() {
  const allMetrics = load<Metric[]>("metrics.json");
  const metrics = allMetrics.filter((m) => m.global);
  const worldCharts = WORLD_IDS.map((id) => {
    const metric = allMetrics.find((m) => m.id === id);
    if (!metric) return null;
    const points = load<SeriesFile>(`series/${id}.json`)["WLD"];
    return points && points.length > 1 ? { metric, points } : null;
  }).filter(Boolean) as { metric: Metric; points: [number, number][] }[];
  const countries = load<Country[]>("countries.json");
  const nameOf = (iso3: string) =>
    iso3 === "WLD"
      ? null
      : (countries.find((c) => c.iso3 === iso3)?.name ?? iso3);

  const charts = metrics.flatMap((metric) => {
    const series = load<SeriesFile>(`series/${metric.id}.json`);
    return Object.entries(series)
      .filter(([, points]) => points.length > 1)
      .map(([iso3, points]) => ({ metric, iso3, points }));
  });

  return (
    <div className="min-h-dvh bg-[#0d0d0d] text-white">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Link href="/" className="text-sm text-[#6da7ec] hover:underline">
          ← Back to the world map
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Planet trends
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[#c3c2b7]">
          Some signals belong to the whole planet rather than any one country.
          These are the big three: the ocean storing the heat, the sea rising,
          and the ice sheets losing mass.
        </p>

        {(() => {
          const worldTemp = load<SeriesFile>(
            "series/temperature_anomaly.json"
          )["WLD"];
          return worldTemp && worldTemp.length > 1 ? (
            <div className="mt-6">
              <Stripes
                points={worldTemp}
                height={72}
                label={`Warming stripes for the world, ${worldTemp[0][0]} to ${worldTemp[worldTemp.length - 1][0]}: each band is one year, blue cooler than the 1991-2020 average, red hotter`}
              />
              <p className="mt-1 text-xs text-[#898781]">
                The world in stripes: every year since {worldTemp[0][0]}, blue
                cooler than the 1991-2020 average, red hotter.
              </p>
            </div>
          ) : null;
        })()}

        <div className="mt-8 grid gap-6 sm:grid-cols-1">
          {charts.map(({ metric, iso3, points }) => {
            const latest = points[points.length - 1];
            const region = nameOf(iso3);
            return (
              <div
                key={`${metric.id}-${iso3}`}
                className="rounded-xl border border-white/10 bg-[#1a1a19] p-4"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-medium">
                    {metric.name}
                    {region ? ` · ${region}` : ""}
                  </h3>
                  <span className="shrink-0 text-xs tabular-nums text-[#c3c2b7]">
                    {formatValue(latest[1], metric.unit)} · {latest[0]}
                  </span>
                </div>
                <div className="mt-3">
                  <LineChart
                    points={points}
                    unit={metric.unit}
                    colour={accentFor(metric.scaleType, metric.ramp)}
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

        <h2 className="mt-12 text-xl font-semibold tracking-tight">
          The world in aggregate
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-[#c3c2b7]">
          Every country on the map, summed or averaged into one line per
          metric. This is the whole story in a handful of curves.
        </p>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {worldCharts.map(({ metric, points }) => {
            const latest = points[points.length - 1];
            return (
              <div
                key={metric.id}
                className="rounded-xl border border-white/10 bg-[#1a1a19] p-4"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-medium">{metric.name} · World</h3>
                  <span className="shrink-0 text-xs tabular-nums text-[#c3c2b7]">
                    {formatValue(latest[1], metric.unit)} · {latest[0]}
                  </span>
                </div>
                <div className="mt-3">
                  <LineChart
                    points={points}
                    unit={metric.unit}
                    colour={accentFor(metric.scaleType, metric.ramp)}
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

        {(() => {
          // The sea to 2100: observed record + IPCC AR6 scenario fan
          type SeaProj = {
            source: string;
            sourceUrl: string;
            scenarios: Record<
              string,
              { label: string; points: { year: number; median: number }[] }
            >;
          };
          let proj: SeaProj | null = null;
          try {
            proj = load<SeaProj>("planet/sealevel-projections.json");
          } catch {
            proj = null;
          }
          const observed = load<SeriesFile>("series/sea_level.json")["WLD"];
          if (!proj || !observed || observed.length < 2) return null;
          // AR6 baseline is 1995-2014 (midpoint ~2005); shift the projections
          // onto the observed record's own baseline so the curves join up.
          const at2005 =
            observed.find(([y]) => y === 2005)?.[1] ??
            observed[observed.length - 1][1];
          const last = observed[observed.length - 1];
          const colours: Record<string, string> = {
            ssp126: "#199e70",
            ssp245: "#e0a355",
            ssp585: "#e66767",
          };
          const overlays = Object.entries(proj.scenarios).map(([id, sc]) => ({
            label: sc.label,
            colour: colours[id] ?? "#898781",
            points: [
              last,
              ...sc.points.map(
                (p) =>
                  [p.year, Math.round(p.median * 1000 + at2005)] as [
                    number,
                    number,
                  ]
              ),
            ],
          }));
          return (
            <section className="mt-10">
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-[#898781]">
                The sea to 2100
              </h2>
              <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-4">
                <h3 className="text-sm font-medium">
                  Global sea level, observed and projected under three scenarios
                </h3>
                <div className="mt-3">
                  <LineChart
                    points={observed}
                    unit="mm vs 1993-2008"
                    colour={accentFor("sequential", "blues")}
                    overlays={overlays}
                  />
                </div>
                <p className="mt-2 text-xs leading-snug text-[#898781]">
                  Solid line: the observed global average. Dashed lines: median
                  projections from{" "}
                  <a
                    href={proj.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#6da7ec] hover:underline"
                  >
                    {proj.source}
                  </a>
                  , aligned to the observed record&apos;s baseline. Even the
                  lowest pathway commits the sea to further rise; the scenarios
                  only truly part ways after mid-century.
                </p>
              </div>
            </section>
          );
        })()}

        {(() => {
          const renewables = allMetrics.find(
            (m) => m.id === "renewables_share_energy"
          );
          return renewables ? (
            <section className="mt-10">
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-[#898781]">
                Biggest movers
              </h2>
              <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-4">
                <MoversPanel
                  series={load<SeriesFile>("series/renewables_share_energy.json")}
                  countries={countries.filter((c) => c.iso3 !== "WLD")}
                  metric={renewables}
                />
              </div>
            </section>
          ) : null;
        })()}

        {dataUpdatedLabel() && (
          <p className="mt-8 border-t border-white/10 pt-4 text-xs text-[#898781]">
            Historical data updated {dataUpdatedLabel()}. Refreshed weekly from
            the original sources.
          </p>
        )}
      </div>
    </div>
  );
}

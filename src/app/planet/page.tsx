import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import type { Metadata } from "next";
import { LineChart } from "@/components/LineChart";
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

export default function PlanetPage() {
  const metrics = load<Metric[]>("metrics.json").filter((m) => m.global);
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
      </div>
    </div>
  );
}

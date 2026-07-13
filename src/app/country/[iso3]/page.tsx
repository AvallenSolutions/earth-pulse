import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LineChart } from "@/components/LineChart";
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
      ? `Climate, energy and pollution history for ${country.name}, from 1750 to today where data exists.`
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
  const charts = metrics
    .map((m) => {
      const series = load<SeriesFile>(`series/${m.id}.json`)[iso3];
      return series && series.length > 1 ? { metric: m, series } : null;
    })
    .filter(Boolean) as { metric: Metric; series: [number, number][] }[];

  const domains = [...new Set(charts.map((c) => c.metric.domain))];

  return (
    <div className="min-h-dvh bg-[#0d0d0d] text-white">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Link
          href="/"
          className="text-sm text-[#6da7ec] hover:underline"
        >
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
            <div className="grid gap-6 sm:grid-cols-2">
              {charts
                .filter((c) => c.metric.domain === d)
                .map(({ metric, series }) => {
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
                      <div className="mt-3">
                        <LineChart points={series} unit={metric.unit} />
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
      </div>
    </div>
  );
}

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import type { Metadata } from "next";
import { LineChart } from "@/components/LineChart";
import { CompareControls } from "@/components/CompareControls";
import { accentFor } from "@/lib/colors";
import {
  DOMAIN_LABELS,
  formatValue,
  type Country,
  type Metric,
  type SeriesFile,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "Compare countries · Earth Pulse",
  description:
    "Put any two countries side by side across climate, energy, water, land and pollution history.",
};

const dataDir = join(process.cwd(), "public", "data");

function load<T>(rel: string): T {
  return JSON.parse(readFileSync(join(dataDir, rel), "utf8")) as T;
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const params = await searchParams;
  const countries = load<Country[]>("countries.json").filter(
    (c) => c.iso3 !== "WLD"
  );
  const valid = (x?: string) =>
    x && countries.some((c) => c.iso3 === x.toUpperCase())
      ? x.toUpperCase()
      : null;
  const a = valid(params.a) ?? "GBR";
  const b = valid(params.b) ?? "FRA";
  const countryA = countries.find((c) => c.iso3 === a)!;
  const countryB = countries.find((c) => c.iso3 === b)!;

  const metrics = load<Metric[]>("metrics.json").filter((m) => !m.global);
  const charts = metrics
    .map((metric) => {
      const series = load<SeriesFile>(`series/${metric.id}.json`);
      const sa = series[a];
      const sb = series[b];
      if (!sa || sa.length < 2 || !sb || sb.length < 2) return null;
      return { metric, sa, sb };
    })
    .filter(Boolean) as {
    metric: Metric;
    sa: [number, number][];
    sb: [number, number][];
  }[];

  const domains = [...new Set(charts.map((c) => c.metric.domain))];

  return (
    <div className="min-h-dvh bg-[#0d0d0d] text-white">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Link href="/" className="text-sm text-[#6da7ec] hover:underline">
          ← Back to the world map
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {countryA.name} <span className="text-[#898781]">vs</span>{" "}
          {countryB.name}
        </h1>
        <p className="mt-1 text-sm text-[#c3c2b7]">
          {charts.length} metrics with data for both countries. The solid line
          is {countryA.name}; the dashed grey line is {countryB.name}.
        </p>

        <CompareControls countries={countries} a={a} b={b} />

        {domains.map((d) => (
          <section key={d} className="mt-10">
            <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-[#898781]">
              {DOMAIN_LABELS[d] ?? d}
            </h2>
            <div className="grid gap-6 lg:grid-cols-2">
              {charts
                .filter((c) => c.metric.domain === d)
                .map(({ metric, sa, sb }) => {
                  const la = sa[sa.length - 1];
                  const lb = sb[sb.length - 1];
                  return (
                    <div
                      key={metric.id}
                      className="rounded-xl border border-white/10 bg-[#1a1a19] p-4"
                    >
                      <h3 className="text-sm font-medium">{metric.name}</h3>
                      <div className="mt-1 flex flex-wrap gap-x-4 text-xs tabular-nums text-[#c3c2b7]">
                        <span>
                          <span
                            className="mr-1 inline-block h-2 w-2 rounded-full"
                            style={{
                              background: accentFor(metric.scaleType, metric.ramp),
                            }}
                          />
                          {countryA.name}: {formatValue(la[1], metric.unit)} ·{" "}
                          {la[0]}
                        </span>
                        <span>
                          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#898781]" />
                          {countryB.name}: {formatValue(lb[1], metric.unit)} ·{" "}
                          {lb[0]}
                        </span>
                      </div>
                      <div className="mt-3">
                        <LineChart
                          points={sa}
                          unit={metric.unit}
                          colour={accentFor(metric.scaleType, metric.ramp)}
                          compare={{ label: countryB.name, points: sb }}
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
      </div>
    </div>
  );
}

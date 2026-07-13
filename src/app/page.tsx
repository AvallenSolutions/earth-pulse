import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MapExplorer } from "@/components/MapExplorer";
import { getVitals } from "@/lib/vitals";
import type { Country, Metric } from "@/lib/types";

// Refresh the vitals strip every 6 hours
export const revalidate = 21600;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    metric?: string;
    year?: string;
    view?: string;
    scenario?: string;
  }>;
}) {
  const { metric, year, view, scenario } = await searchParams;
  const dir = join(process.cwd(), "public", "data");
  const metrics = JSON.parse(
    readFileSync(join(dir, "metrics.json"), "utf8")
  ) as Metric[];
  const countries = JSON.parse(
    readFileSync(join(dir, "countries.json"), "utf8")
  ) as Country[];
  const vitals = await getVitals();
  return (
    <MapExplorer
      metrics={metrics.filter((m) => !m.global)}
      countries={countries.filter((c) => c.iso3 !== "WLD")}
      vitals={vitals}
      initialMetric={metric}
      initialYear={year ? Number(year) : undefined}
      initialView={view}
      initialScenario={scenario}
    />
  );
}

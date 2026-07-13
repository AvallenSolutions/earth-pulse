import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MapExplorer } from "@/components/MapExplorer";
import type { Country, Metric } from "@/lib/types";

export default function Home() {
  const dir = join(process.cwd(), "public", "data");
  const metrics = JSON.parse(
    readFileSync(join(dir, "metrics.json"), "utf8")
  ) as Metric[];
  const countries = JSON.parse(
    readFileSync(join(dir, "countries.json"), "utf8")
  ) as Country[];
  return (
    <MapExplorer
      metrics={metrics}
      countries={countries.filter((c) => c.iso3 !== "WLD")}
    />
  );
}

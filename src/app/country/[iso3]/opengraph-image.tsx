import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { Country, Metric, SeriesFile } from "@/lib/types";

export const alt = "Earth Pulse country profile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const dataDir = join(process.cwd(), "public", "data");

function load<T>(rel: string): T {
  return JSON.parse(readFileSync(join(dataDir, rel), "utf8")) as T;
}

export default async function Image({
  params,
}: {
  params: Promise<{ iso3: string }>;
}) {
  const { iso3: raw } = await params;
  const iso3 = raw.toUpperCase();
  const country = load<Country[]>("countries.json").find((c) => c.iso3 === iso3);

  // Three headline stats for the card
  const picks = [
    { id: "co2_per_capita", label: "CO2 per person", fmt: (v: number) => `${v.toFixed(1)} t` },
    { id: "temperature_anomaly", label: "Temperature vs 1991-2020", fmt: (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)} °C` },
    { id: "renewables_share_energy", label: "Renewable energy", fmt: (v: number) => `${v.toFixed(0)}%` },
  ];
  const metrics = load<Metric[]>("metrics.json");
  const stats = picks
    .map((p) => {
      if (!metrics.some((m) => m.id === p.id)) return null;
      const series = load<SeriesFile>(`series/${p.id}.json`)[iso3];
      if (!series?.length) return null;
      const [year, value] = series[series.length - 1];
      return { label: p.label, value: p.fmt(value), year };
    })
    .filter(Boolean) as { label: string; value: string; year: number }[];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "linear-gradient(135deg, #0d0d0d 0%, #0a1420 60%, #12233f 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 28, color: "#6da7ec" }}>Earth Pulse</div>
          <div style={{ fontSize: 72, fontWeight: 700, marginTop: 8 }}>
            {country?.name ?? iso3}
          </div>
          <div style={{ fontSize: 26, color: "#c3c2b7", marginTop: 6 }}>
            Climate, energy, water and pollution history
          </div>
        </div>
        <div style={{ display: "flex", gap: 48 }}>
          {stats.map((s) => (
            <div key={s.label} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 44, fontWeight: 700 }}>{s.value}</div>
              <div style={{ fontSize: 20, color: "#c3c2b7", marginTop: 4 }}>
                {`${s.label} · ${s.year}`}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}

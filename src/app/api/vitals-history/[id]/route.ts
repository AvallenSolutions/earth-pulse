/**
 * Full historical series behind the three vitals cards:
 *   co2         Mauna Loa monthly CO2 since 1958 (the Keeling curve)
 *   temperature GISTEMP global annual anomaly since 1880
 *   seaice      NSIDC Arctic yearly minimum extent since 1979
 * Fetched from the agencies server-side and cached 6h.
 */

export const revalidate = 21600;

const UA = { "User-Agent": "earth-pulse/1.0 (public climate dashboard)" };

async function text(url: string, big = false): Promise<string> {
  const res = await fetch(url, {
    ...(big ? { cache: "no-store" as const } : { next: { revalidate: 21600 } }),
    headers: UA,
  });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.text();
}

async function co2(): Promise<[number, number][]> {
  const csv = await text(
    "https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_mlo.csv"
  );
  return csv
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(",").map(Number))
    .filter((r) => Number.isFinite(r[3]) && r[3] > 0)
    .map((r) => [Number(r[2].toFixed(2)), r[3]] as [number, number]);
}

async function temperature(): Promise<[number, number][]> {
  const csv = await text(
    "https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv"
  );
  const points: [number, number][] = [];
  for (const line of csv.split("\n")) {
    if (!/^\d{4},/.test(line)) continue;
    const cells = line.split(",");
    const annual = Number(cells[13]); // J-D column
    if (Number.isFinite(annual)) points.push([Number(cells[0]), annual]);
  }
  return points;
}

async function seaice(): Promise<[number, number][]> {
  const csv = await text(
    "https://noaadata.apps.nsidc.org/NOAA/G02135/north/daily/data/N_seaice_extent_daily_v4.0.csv",
    true
  );
  const minByYear = new Map<number, number>();
  for (const line of csv.split("\n")) {
    const c = line.split(",").map((x) => x.trim());
    const year = Number(c[0]);
    const extent = Number(c[3]);
    if (!Number.isFinite(year) || !Number.isFinite(extent)) continue;
    const cur = minByYear.get(year);
    if (cur === undefined || extent < cur) minByYear.set(year, extent);
  }
  // the current year's minimum hasn't happened yet (September)
  minByYear.delete(new Date().getUTCFullYear());
  return [...minByYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([y]) => y >= 1979)
    .map(([y, v]) => [y, Number(v.toFixed(2))]);
}

const SERIES: Record<
  string,
  {
    label: string;
    unit: string;
    source: string;
    sourceUrl: string;
    fetch: () => Promise<[number, number][]>;
  }
> = {
  co2: {
    label: "Atmospheric CO2 · the Keeling curve",
    unit: "ppm",
    source: "NOAA Global Monitoring Laboratory, Mauna Loa",
    sourceUrl: "https://gml.noaa.gov/ccgg/trends/",
    fetch: co2,
  },
  temperature: {
    label: "Global temperature anomaly",
    unit: "°C vs 1951-1980",
    source: "NASA GISTEMP v4",
    sourceUrl: "https://data.giss.nasa.gov/gistemp/",
    fetch: temperature,
  },
  seaice: {
    label: "Arctic sea ice · yearly minimum extent",
    unit: "million km²",
    source: "NSIDC Sea Ice Index v4",
    sourceUrl: "https://nsidc.org/data/seaice_index",
    fetch: seaice,
  },
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const def = SERIES[id];
  if (!def) return Response.json({ error: "unknown series" }, { status: 404 });
  try {
    const points = await def.fetch();
    return Response.json(
      {
        label: def.label,
        unit: def.unit,
        source: def.source,
        sourceUrl: def.sourceUrl,
        points,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=43200",
        },
      }
    );
  } catch {
    return Response.json({ error: "upstream error" }, { status: 502 });
  }
}

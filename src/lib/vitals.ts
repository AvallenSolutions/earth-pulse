/**
 * Planet vitals: the live heartbeat numbers on the map page.
 * Fetched server-side with ISR caching (6h) so visitors never hit the
 * upstream agencies directly. Every fetcher fails soft to null.
 */

export type Vitals = {
  co2: { ppm: number; delta1yr: number; date: string } | null;
  temp: { anomaly: number; monthLabel: string } | null;
  seaIce: { extent: number; anomalyPct: number; date: string } | null;
};

const REVALIDATE = { next: { revalidate: 21600 } };

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

async function text(url: string, big = false): Promise<string> {
  // NASA GISS 403s Node's default user agent; identify ourselves properly.
  // Files over 2MB exceed Next's data-cache limit, so those skip it; the
  // page-level ISR (6h) still bounds how often they are fetched.
  const res = await fetch(url, {
    ...(big ? { cache: "no-store" as const } : REVALIDATE),
    headers: { "User-Agent": "earth-pulse/1.0 (public climate dashboard)" },
  });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.text();
}

/** NOAA GML daily Mauna Loa CO2 (the Keeling record, updated each day).
 * Columns: yr,mon,day,decimal_year,ppm. The year-on-year delta comes from
 * the closest reading to 365 days earlier in the same file. */
async function fetchCo2(): Promise<Vitals["co2"]> {
  const csv = await text(
    "https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_daily_mlo.csv"
  );
  const rows = csv
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(",").map(Number))
    .filter((r) => Number.isFinite(r[4]) && r[4] > 0);
  const last = rows[rows.length - 1];
  const [yr, mon, day, dec, ppm] = last;
  // closest reading to one year earlier (within ~10 days)
  let oneYearAgo: number | null = null;
  let bestGap = 0.03; // ~11 days in decimal years
  for (let i = rows.length - 1; i >= 0 && rows[i][3] > dec - 1.1; i--) {
    const gap = Math.abs(rows[i][3] - (dec - 1));
    if (gap < bestGap) {
      bestGap = gap;
      oneYearAgo = rows[i][4];
    }
  }
  return {
    ppm,
    delta1yr:
      oneYearAgo !== null ? Number((ppm - oneYearAgo).toFixed(2)) : 0,
    date: `${day} ${MONTHS[mon - 1]} ${yr}`,
  };
}

/** NASA GISTEMP global monthly anomaly vs 1951-1980. */
async function fetchTemp(): Promise<Vitals["temp"]> {
  const csv = await text(
    "https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv"
  );
  const lines = csv.split("\n").filter((l) => /^\d{4},/.test(l));
  // Walk backwards to the most recent year with at least one valid month
  for (let i = lines.length - 1; i >= 0; i--) {
    const cells = lines[i].split(",");
    const year = cells[0];
    for (let m = 12; m >= 1; m--) {
      const v = Number(cells[m]);
      if (Number.isFinite(v)) {
        return { anomaly: v, monthLabel: `${MONTHS[m - 1]} ${year}` };
      }
    }
  }
  return null;
}

/** NSIDC Arctic daily sea ice extent vs the 1981-2010 day-of-year average. */
async function fetchSeaIce(): Promise<Vitals["seaIce"]> {
  const base =
    "https://noaadata.apps.nsidc.org/NOAA/G02135/north/daily/data/";
  const [daily, clim] = await Promise.all([
    text(`${base}N_seaice_extent_daily_v4.0.csv`, true),
    text(`${base}N_seaice_extent_climatology_1981-2010_v4.0.csv`),
  ]);
  const dailyRows = daily.split("\n").filter((l) => /^\d{4},/.test(l.trim()));
  const last = dailyRows[dailyRows.length - 1]
    .split(",")
    .map((c) => c.trim());
  const [yr, mon, day] = [Number(last[0]), Number(last[1]), Number(last[2])];
  const extent = Number(last[3]);
  if (!Number.isFinite(extent)) return null;

  const date = new Date(Date.UTC(yr, mon - 1, day));
  const doy = Math.round(
    (date.getTime() - Date.UTC(yr, 0, 0)) / 86_400_000
  );
  const climRow = clim
    .split("\n")
    .filter((l) => /^\s*\d+,/.test(l))
    .map((l) => l.split(",").map(Number))
    .find((r) => r[0] === doy);
  if (!climRow) return null;
  const avg = climRow[1];
  return {
    extent,
    anomalyPct: Number((((extent - avg) / avg) * 100).toFixed(1)),
    date: `${day} ${MONTHS[mon - 1]} ${yr}`,
  };
}

export async function getVitals(): Promise<Vitals> {
  const [co2, temp, seaIce] = await Promise.all([
    fetchCo2().catch(() => null),
    fetchTemp().catch(() => null),
    fetchSeaIce().catch(() => null),
  ]);
  return { co2, temp, seaIce };
}

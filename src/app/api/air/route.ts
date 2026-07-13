/**
 * Aggregates the latest global PM2.5 readings from OpenAQ (v3) into a compact
 * [lon, lat, value] array for the air-quality map layer. The API key stays
 * server-side; the whole sweep is cached for an hour, so visitors never hit
 * OpenAQ directly and the free-tier rate limit is untouched.
 */

const PAGE_LIMIT = 1000;
const MAX_PAGES = 30;

export const revalidate = 3600;

type LatestRow = {
  datetime: { utc: string };
  value: number;
  coordinates: { latitude: number; longitude: number } | null;
  locationsId: number;
};

export async function GET() {
  const key = process.env.OPENAQ_API_KEY;
  if (!key) {
    return Response.json({ error: "air layer not configured" }, { status: 503 });
  }

  const fetchPage = async (page: number): Promise<LatestRow[]> => {
    const res = await fetch(
      `https://api.openaq.org/v3/parameters/2/latest?limit=${PAGE_LIMIT}&page=${page}`,
      { headers: { "X-API-Key": key }, next: { revalidate: 3600 } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json.results ?? []) as LatestRow[];
  };

  // First page tells us how many exist; fetch the rest in small batches
  const firstRes = await fetch(
    `https://api.openaq.org/v3/parameters/2/latest?limit=${PAGE_LIMIT}&page=1`,
    { headers: { "X-API-Key": key }, next: { revalidate: 3600 } }
  );
  if (!firstRes.ok) {
    return Response.json({ error: "upstream error" }, { status: 502 });
  }
  const first = await firstRes.json();
  const found: number = first.meta?.found ?? 0;
  const pages = Math.min(Math.ceil(found / PAGE_LIMIT), MAX_PAGES);

  const rows: LatestRow[] = [...(first.results ?? [])];
  for (let start = 2; start <= pages; start += 8) {
    const batch = await Promise.all(
      Array.from(
        { length: Math.min(8, pages - start + 1) },
        (_, i) => fetchPage(start + i)
      )
    );
    rows.push(...batch.flat());
  }

  // One reading per location: keep the freshest, drop bad/stale values
  const cutoff = Date.now() - 48 * 3600_000;
  const byLocation = new Map<number, LatestRow>();
  for (const r of rows) {
    if (!r.coordinates || !Number.isFinite(r.value)) continue;
    if (r.value < 0 || r.value > 1500) continue;
    if (new Date(r.datetime.utc).getTime() < cutoff) continue;
    const prev = byLocation.get(r.locationsId);
    if (!prev || r.datetime.utc > prev.datetime.utc) byLocation.set(r.locationsId, r);
  }

  const points = [...byLocation.values()].map((r) => [
    Number(r.coordinates!.longitude.toFixed(3)),
    Number(r.coordinates!.latitude.toFixed(3)),
    Number(r.value.toFixed(1)),
  ]);

  return Response.json(
    { points, updated: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
      },
    }
  );
}

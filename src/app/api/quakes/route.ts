/**
 * Earthquakes in the last 24 hours from the USGS live feed, slimmed to
 * [lon, lat, magnitude]. The feed updates every minute; we cache 60s at the
 * edge so the map is genuinely up to the minute without hammering USGS.
 */

export const revalidate = 60;

type UsgsFeature = {
  geometry: { coordinates: [number, number, number] };
  properties: { mag: number | null };
};

export async function GET() {
  const res = await fetch(
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
    { next: { revalidate: 60 } }
  );
  if (!res.ok) return Response.json({ error: "upstream error" }, { status: 502 });
  const json = (await res.json()) as { features: UsgsFeature[] };

  const points = json.features
    .filter((f) => f.properties.mag !== null && f.properties.mag >= 1)
    .map((f) => [
      Number(f.geometry.coordinates[0].toFixed(3)),
      Number(f.geometry.coordinates[1].toFixed(3)),
      Number(f.properties.mag!.toFixed(1)),
    ]);

  return Response.json(
    { points, updated: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}

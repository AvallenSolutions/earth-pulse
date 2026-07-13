/**
 * Earthquakes in the last 24 hours from the USGS live feed, with enough
 * detail to power the click popup (place, depth, time, event page URL).
 * The feed updates every minute; we cache 60s at the edge.
 */

export const revalidate = 60;

type UsgsFeature = {
  geometry: { coordinates: [number, number, number] };
  properties: {
    mag: number | null;
    place: string | null;
    time: number;
    url: string;
  };
};

export async function GET() {
  const res = await fetch(
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
    { next: { revalidate: 60 } }
  );
  if (!res.ok) return Response.json({ error: "upstream error" }, { status: 502 });
  const json = (await res.json()) as { features: UsgsFeature[] };

  const quakes = json.features
    .filter((f) => f.properties.mag !== null && f.properties.mag >= 1)
    .map((f) => ({
      lon: Number(f.geometry.coordinates[0].toFixed(3)),
      lat: Number(f.geometry.coordinates[1].toFixed(3)),
      depth: Number((f.geometry.coordinates[2] ?? 0).toFixed(1)),
      mag: Number(f.properties.mag!.toFixed(1)),
      place: f.properties.place ?? "",
      time: f.properties.time,
      url: f.properties.url,
    }));

  return Response.json(
    { quakes, updated: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}

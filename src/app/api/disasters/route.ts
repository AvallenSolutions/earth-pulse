/**
 * Live disaster alerts from Copernicus/UN GDACS: tropical cyclones, floods,
 * droughts, earthquakes and volcanoes, each with a Green/Orange/Red alert
 * level. Slimmed to [lon, lat, type, level, name]; cached 10 minutes.
 */

export const revalidate = 600;

type GdacsFeature = {
  geometry: { type: string; coordinates: [number, number] };
  properties: {
    eventtype: string;
    alertlevel: string;
    name?: string;
    eventname?: string;
  };
};

export async function GET() {
  const res = await fetch(
    "https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP",
    { next: { revalidate: 600 } }
  );
  if (!res.ok) return Response.json({ error: "upstream error" }, { status: 502 });
  const json = (await res.json()) as { features: GdacsFeature[] };

  const events = json.features
    .filter((f) => f.geometry?.type === "Point")
    .map((f) => [
      Number(f.geometry.coordinates[0].toFixed(2)),
      Number(f.geometry.coordinates[1].toFixed(2)),
      f.properties.eventtype,
      f.properties.alertlevel,
      (f.properties.name || f.properties.eventname || "").slice(0, 60),
    ]);

  return Response.json(
    { events, updated: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
      },
    }
  );
}

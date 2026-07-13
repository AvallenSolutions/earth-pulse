/**
 * Live disaster alerts from Copernicus/UN GDACS with the detail the click
 * popup needs: affected countries, severity text, dates and the event id
 * that links to the full GDACS report. Cached 10 minutes.
 */

export const revalidate = 600;

type GdacsFeature = {
  geometry: { type: string; coordinates: [number, number] };
  properties: {
    eventtype: string;
    eventid: number;
    alertlevel: string;
    name?: string;
    eventname?: string;
    country?: string;
    fromdate?: string;
    todate?: string;
    severitydata?: { severitytext?: string };
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
    .map((f) => ({
      lon: Number(f.geometry.coordinates[0].toFixed(2)),
      lat: Number(f.geometry.coordinates[1].toFixed(2)),
      type: f.properties.eventtype,
      level: f.properties.alertlevel,
      name: (f.properties.name || f.properties.eventname || "").slice(0, 80),
      country: (f.properties.country || "").slice(0, 120),
      severity: (f.properties.severitydata?.severitytext || "").slice(0, 120),
      from: (f.properties.fromdate || "").slice(0, 10),
      to: (f.properties.todate || "").slice(0, 10),
      eventid: f.properties.eventid,
    }));

  return Response.json(
    { events, updated: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
      },
    }
  );
}

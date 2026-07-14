/**
 * Aurora forecast: NOAA SWPC's OVATION model gives the short-term probability
 * of visible aurora on a 1-degree global grid. We thin it to the points that
 * actually matter (a meaningful chance of aurora) and hand back a compact
 * list the map draws as a glowing oval over each pole. Cached 30 minutes.
 */

export const revalidate = 1800;

const THRESHOLD = 5; // percent chance; below this the oval is not worth drawing

export async function GET() {
  const res = await fetch(
    "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json",
    {
      headers: { "User-Agent": "earth-pulse/1.0 (public climate dashboard)" },
      next: { revalidate: 1800 },
    }
  );
  if (!res.ok) return Response.json({ error: "upstream error" }, { status: 502 });
  const json = (await res.json()) as {
    "Observation Time": string;
    "Forecast Time": string;
    coordinates: [number, number, number][];
  };

  // [lon 0-359, lat, prob] -> [lon -180..180, lat, prob], keep only meaningful
  const points = json.coordinates
    .filter(([, , prob]) => prob >= THRESHOLD)
    .map(([lon, lat, prob]) => [lon > 180 ? lon - 360 : lon, lat, prob]);

  return Response.json(
    {
      points,
      observed: json["Observation Time"],
      forecast: json["Forecast Time"],
      updated: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
      },
    }
  );
}

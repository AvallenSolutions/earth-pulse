/**
 * Active tropical cyclones from the National Hurricane Center's live status
 * feed. NHC only publishes the forecast track and cone of uncertainty as
 * downloadable shapefiles, not inline coordinates, so this layer shows each
 * storm's current position, strength and heading with a link to the official
 * advisory. Returns an empty list out of season. Cached 15 minutes.
 */

export const revalidate = 900;

type NhcStorm = {
  id: string;
  name: string;
  classification: string;
  intensity: number | string;
  pressure: number | string;
  latitude_numeric: number;
  longitude_numeric: number;
  movementDir: number | null;
  movementSpeed: number | null;
  lastUpdate: string;
  publicAdvisory?: { url?: string };
};

export async function GET() {
  const res = await fetch("https://www.nhc.noaa.gov/CurrentStorms.json", {
    headers: { "User-Agent": "earth-pulse/1.0 (public climate dashboard)" },
    next: { revalidate: 900 },
  });
  if (!res.ok) return Response.json({ error: "upstream error" }, { status: 502 });
  const json = (await res.json()) as { activeStorms: NhcStorm[] };

  const storms = (json.activeStorms ?? [])
    .filter(
      (s) =>
        Number.isFinite(s.latitude_numeric) &&
        Number.isFinite(s.longitude_numeric)
    )
    .map((s) => ({
      lon: Number(Number(s.longitude_numeric).toFixed(2)),
      lat: Number(Number(s.latitude_numeric).toFixed(2)),
      name: s.name,
      classification: s.classification,
      intensity: Number(s.intensity) || 0,
      pressure: Number(s.pressure) || 0,
      movementDir: s.movementDir ?? null,
      movementSpeed: s.movementSpeed ?? null,
      lastUpdate: s.lastUpdate,
      url: s.publicAdvisory?.url ?? "https://www.nhc.noaa.gov",
    }));

  return Response.json(
    { storms, updated: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
      },
    }
  );
}

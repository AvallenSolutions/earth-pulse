/**
 * Recent and ongoing volcanic activity from the Smithsonian Global Volcanism
 * Program's eruptions database (via their GeoServer WFS). We keep eruptions
 * that began in roughly the last two years plus any still continuing, so the
 * layer reads as "what's erupting now". Cached 6 hours.
 */

export const revalidate = 21600;

type GvpFeature = {
  geometry: { coordinates: [number, number] } | null;
  properties: {
    VolcanoNumber: number;
    VolcanoName: string;
    ExplosivityIndexMax: number | null;
    StartDate: string;
    StartDateYear: number;
    EndDate: string | null;
    ContinuingEruption: string; // "True" | "False"
  };
};

export async function GET() {
  const url =
    "https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows" +
    "?service=WFS&version=2.0.0&request=GetFeature" +
    "&typeName=GVP-VOTW:E3WebApp_Eruptions1960" +
    "&outputFormat=application/json&count=120&sortBy=StartDate+D";
  const res = await fetch(url, {
    headers: { "User-Agent": "earth-pulse/1.0 (public climate dashboard)" },
    next: { revalidate: 21600 },
  });
  if (!res.ok) return Response.json({ error: "upstream error" }, { status: 502 });
  const json = (await res.json()) as { features: GvpFeature[] };

  const withGeom = json.features.filter((f) => f.geometry);
  // The archive lags real time by a few months, so anchor "recent" to the
  // newest eruption in the data rather than today.
  const latestYear = Math.max(
    ...withGeom.map((f) => f.properties.StartDateYear || 0),
    new Date().getFullYear() - 1
  );
  const volcanoes = withGeom
    .filter((f) => {
      const p = f.properties;
      return (
        p.ContinuingEruption === "True" || p.StartDateYear >= latestYear - 1
      );
    })
    .map((f) => {
      const p = f.properties;
      return {
        lon: Number(f.geometry!.coordinates[0].toFixed(3)),
        lat: Number(f.geometry!.coordinates[1].toFixed(3)),
        name: p.VolcanoName,
        vei: p.ExplosivityIndexMax ?? null,
        start: fmtDate(p.StartDate),
        end: p.ContinuingEruption === "True" ? null : fmtDate(p.EndDate),
        ongoing: p.ContinuingEruption === "True",
        number: p.VolcanoNumber,
      };
    });

  return Response.json(
    { volcanoes, updated: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=43200",
      },
    }
  );
}

/** GVP dates are "YYYYMMDD" strings (day may be 00 when unknown). */
function fmtDate(raw: string | null): string {
  if (!raw || raw.length < 6) return "";
  const y = raw.slice(0, 4);
  const m = raw.slice(4, 6);
  const d = raw.slice(6, 8);
  return d && d !== "00" ? `${y}-${m}-${d}` : `${y}-${m}`;
}

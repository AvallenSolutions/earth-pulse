import { NextRequest } from "next/server";

/**
 * Proxies NASA FIRMS WMS fire-detection tiles so the map key stays
 * server-side. MapLibre requests these with a {bbox-epsg-3857} template.
 * Cached at the edge for 30 minutes (FIRMS updates roughly 3-hourly).
 */
export async function GET(req: NextRequest) {
  const bbox = req.nextUrl.searchParams.get("bbox");
  if (!bbox || !/^-?[\d.]+(,-?[\d.]+){3}$/.test(bbox)) {
    return new Response("bad bbox", { status: 400 });
  }
  const key = process.env.NASA_FIRMS_KEY;
  if (!key) return new Response("fires layer not configured", { status: 503 });

  // Suomi NPP retired in 2026; NOAA-20 + NOAA-21 are the active VIIRS sensors
  const upstream =
    `https://firms.modaps.eosdis.nasa.gov/mapserver/wms/fires/${key}` +
    `?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1` +
    `&LAYERS=fires_viirs_noaa20_24,fires_viirs_noaa21_24` +
    `&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857` +
    `&BBOX=${bbox}&WIDTH=256&HEIGHT=256`;

  const res = await fetch(upstream, { next: { revalidate: 1800 } });
  if (!res.ok) return new Response("upstream error", { status: 502 });

  return new Response(await res.arrayBuffer(), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
    },
  });
}

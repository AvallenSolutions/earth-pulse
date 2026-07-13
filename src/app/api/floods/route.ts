import { NextRequest } from "next/server";

/**
 * Proxies Copernicus GloFAS "flood summary" WMS tiles (days 1-15 river flood
 * alerts). Keyless upstream, but proxied so responses are edge-cached and the
 * app degrades gracefully if the service is down. Refreshes with the daily
 * GloFAS forecast run (3h cache).
 */
export async function GET(req: NextRequest) {
  const bbox = req.nextUrl.searchParams.get("bbox");
  if (!bbox || !/^-?[\d.]+(,-?[\d.]+){3}$/.test(bbox)) {
    return new Response("bad bbox", { status: 400 });
  }

  const upstream =
    "https://ows.globalfloods.eu/glofas-ows/ows.py" +
    "?service=WMS&request=GetMap&version=1.1.1&layers=FloodSummary1_30" +
    "&styles=&format=image/png&transparent=true&srs=EPSG:3857" +
    `&bbox=${bbox}&width=256&height=256`;

  const res = await fetch(upstream, { next: { revalidate: 10800 } });
  if (!res.ok) return new Response("upstream error", { status: 502 });

  return new Response(await res.arrayBuffer(), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, s-maxage=10800, stale-while-revalidate=21600",
    },
  });
}

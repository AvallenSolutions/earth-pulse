/**
 * News headlines fallback proxy. The primary path fetches GDELT directly
 * from the visitor's browser (see src/lib/news.ts for why); this route is
 * the second chance, useful mainly for its CDN cache: one success for a
 * popular query serves everyone for 15 minutes even when GDELT is refusing
 * this deployment's shared egress IP.
 *
 * GET /api/news?q=<terms>[&days=7|30|all]
 * -> { articles: [{ title, url, domain, image, published }], updated }
 *
 * Successful responses carry s-maxage=900; failures are no-store so a
 * throttled upstream reply never gets cached.
 */

import { gdeltUrl, parseGdeltArticles, sanitiseNewsQuery } from "@/lib/news";

// GDELT allows one request every 5 seconds per IP. Space upstream calls out
// (per server instance) and back off entirely for a spell if it still
// reports busy, so this deployment never earns its IP a longer penalty.
let nextSlot = 0;
let coolOffUntil = 0;

async function takeUpstreamSlot(): Promise<boolean> {
  const now = Date.now();
  if (now < coolOffUntil) return false;
  const delay = Math.max(0, nextSlot - now);
  if (delay > 4000) return false; // queue is already full enough; fail fast
  nextSlot = Math.max(now, nextSlot) + 5500;
  if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  return true;
}

const busy = () =>
  Response.json(
    { error: "news feed is busy, try again shortly" },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = sanitiseNewsQuery(params.get("q") ?? "");
  if (q.length < 2)
    return Response.json({ error: "missing query" }, { status: 400 });
  const daysParam = params.get("days");
  const days = daysParam === "30" || daysParam === "all" ? daysParam : "7";

  try {
    if (!(await takeUpstreamSlot())) return busy();
    const res = await fetch(gdeltUrl(q, days), {
      headers: { "User-Agent": "earth-pulse/1.0 (public climate dashboard)" },
      cache: "no-store",
    });
    const articles = parseGdeltArticles(await res.text());
    if (articles === null) {
      coolOffUntil = Date.now() + 30_000;
      return busy();
    }
    return Response.json(
      { articles, updated: new Date().toISOString() },
      {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
        },
      }
    );
  } catch {
    return Response.json(
      { error: "news feed unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}

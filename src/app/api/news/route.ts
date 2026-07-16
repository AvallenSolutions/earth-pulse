/**
 * News headlines for a place or event, served in-app so readers never have
 * to leave the map to see what is happening.
 *
 * Source: the GDELT Project's DOC 2.0 API (https://www.gdeltproject.org),
 * an open, keyless index of worldwide news updated every 15 minutes. GDELT
 * asks for at most one request every 5 seconds, so responses are cached
 * hard (15 minutes per query) and failures degrade gracefully client-side.
 *
 * GET /api/news?q=<terms>[&days=7|30|all]
 * -> { articles: [{ title, url, domain, image, published }], updated }
 *
 * Successful responses carry s-maxage=900 so the CDN absorbs repeat clicks;
 * failures are no-store so a throttled upstream reply never gets cached.
 */

const MAX_ARTICLES = 8;

type Article = {
  title: string;
  url: string;
  domain: string;
  image: string | null;
  published: string;
};

// In-memory success cache per query (15 min), so repeat clicks on the same
// place never re-hit the upstream at all.
const CACHE_TTL = 900_000;
const cache = new Map<string, { at: number; articles: Article[] }>();

// GDELT allows one request every 5 seconds per client. Space upstream calls
// out (per server instance) and back off entirely for a spell if it still
// reports busy, so the app never earns this IP a long penalty.
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

/** "20260716T130000Z" -> ISO 8601 */
function gdeltDate(s: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (!m) return s;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
}

type GdeltArticle = {
  url: string;
  title: string;
  seendate: string;
  socialimage: string;
  domain: string;
  language: string;
};

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  // Keep queries sane: letters, digits and spaces only, a handful of words
  const q = (params.get("q") ?? "")
    .replace(/[^\p{L}\p{N} .-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (q.length < 2)
    return Response.json({ error: "missing query" }, { status: 400 });
  const days = params.get("days") ?? "7";
  const timespan = days === "all" ? "" : `&timespan=${days === "30" ? "30" : "7"}d`;

  const cacheKey = `${q}|${days}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL)
    return Response.json(
      { articles: hit.articles, updated: new Date(hit.at).toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } }
    );

  const upstream =
    "https://api.gdeltproject.org/api/v2/doc/doc" +
    `?query=${encodeURIComponent(`${q} sourcelang:english`)}` +
    `&mode=ArtList&format=json&maxrecords=24&sort=DateDesc${timespan}`;

  try {
    if (!(await takeUpstreamSlot()))
      return Response.json(
        { error: "news feed is busy, try again shortly" },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    const res = await fetch(upstream, {
      headers: { "User-Agent": "earth-pulse/1.0 (public climate dashboard)" },
      cache: "no-store",
    });
    const text = await res.text();
    // GDELT signals throttling with a plain-text message, not an error code
    let json: { articles?: GdeltArticle[] };
    try {
      json = JSON.parse(text);
    } catch {
      coolOffUntil = Date.now() + 30_000;
      return Response.json(
        { error: "news feed is busy, try again shortly" },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Dedupe syndicated copies (same headline everywhere) and near-empty rows
    const seen = new Set<string>();
    const articles: Article[] = [];
    for (const a of json.articles ?? []) {
      if (a.language !== "English" || !a.title || !a.url) continue;
      const key = a.title.toLowerCase().replace(/\s+/g, " ").slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      articles.push({
        title: a.title,
        url: a.url,
        domain: a.domain,
        image: a.socialimage || null,
        published: gdeltDate(a.seendate),
      });
      if (articles.length >= MAX_ARTICLES) break;
    }

    cache.set(cacheKey, { at: Date.now(), articles });
    if (cache.size > 500)
      cache.delete(cache.keys().next().value!); // drop the oldest entry

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

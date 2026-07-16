/**
 * News headlines from the GDELT Project's DOC 2.0 API, an open, keyless
 * index of worldwide news updated every 15 minutes.
 *
 * GDELT rate limits per IP (one request every 5 seconds) and hands out long
 * penalties to busy IPs, which makes shared cloud egress (Vercel) unreliable
 * for it. GDELT sends open CORS headers, so the primary path is a direct
 * fetch from the visitor's browser: each visitor spends their own allowance,
 * which one popup click never exhausts. /api/news wraps the same logic as a
 * CDN-cached fallback. Shared by both paths.
 */

export type NewsArticle = {
  title: string;
  url: string;
  domain: string;
  image: string | null;
  published: string;
};

export const MAX_ARTICLES = 8;

/** Keep queries sane: letters, digits and spaces only, a handful of words */
export function sanitiseNewsQuery(q: string): string {
  return q
    .replace(/[^\p{L}\p{N} .-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function gdeltUrl(q: string, days: "7" | "30" | "all" = "7"): string {
  const timespan = days === "all" ? "" : `&timespan=${days === "30" ? "30" : "7"}d`;
  return (
    "https://api.gdeltproject.org/api/v2/doc/doc" +
    `?query=${encodeURIComponent(`${q} sourcelang:english`)}` +
    `&mode=ArtList&format=json&maxrecords=24&sort=DateDesc${timespan}`
  );
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

/**
 * Parse a GDELT response body into clean articles. Returns null when the
 * body is not JSON: GDELT signals throttling with a plain-text message,
 * not an error status.
 */
export function parseGdeltArticles(text: string): NewsArticle[] | null {
  let json: { articles?: GdeltArticle[] };
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  // Dedupe syndicated copies (same headline everywhere) and near-empty rows
  const seen = new Set<string>();
  const articles: NewsArticle[] = [];
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
  return articles;
}

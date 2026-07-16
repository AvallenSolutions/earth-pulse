"use client";

import { useEffect, useState } from "react";
import {
  gdeltUrl,
  parseGdeltArticles,
  sanitiseNewsQuery,
  type NewsArticle,
} from "@/lib/news";

/**
 * In-app news headlines: a dark modal listing the latest coverage for a
 * place or event, so readers stay on the map. Clicking a headline opens the
 * full article in a new tab.
 *
 * Fetch order: the open GDELT index directly from this browser (per-visitor
 * rate allowance, no shared server IP), then our CDN-cached /api/news proxy,
 * then one quiet retry of both; finally a Google News search link.
 */

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(mins) || mins < 0) return "";
  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function NewsModal({
  query,
  title,
  days,
  onClose,
}: {
  /** Search terms, e.g. "Tokyo Japan" or "Hurricane Erin" */
  query: string;
  /** Heading shown to the reader, e.g. "News from Tokyo" */
  title: string;
  /** How far back to look: "7" (default), "30" or "all" */
  days?: "7" | "30" | "all";
  onClose: () => void;
}) {
  const [articles, setArticles] = useState<NewsArticle[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    // Primary: GDELT straight from this browser (open CORS)
    const fromGdelt = async (): Promise<NewsArticle[]> => {
      const q = sanitiseNewsQuery(query);
      if (q.length < 2) throw new Error("query");
      const res = await fetch(gdeltUrl(q, days ?? "7"));
      const parsed = parseGdeltArticles(await res.text());
      if (parsed === null) throw new Error("busy");
      return parsed;
    };
    // Fallback: our proxy, whose CDN cache may hold a recent success
    const fromApi = async (): Promise<NewsArticle[]> => {
      const res = await fetch(
        `/api/news?q=${encodeURIComponent(query)}&days=${days ?? "7"}`
      );
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()).articles ?? [];
    };

    const load = (attempt: number) => {
      fromGdelt()
        .catch(fromApi)
        .then((a) => alive && setArticles(a))
        .catch(() => {
          if (!alive) return;
          // Rate windows are seconds long; one quiet retry often lands
          if (attempt === 0) timer = setTimeout(() => load(1), 6000);
          else setFailed(true);
        });
    };
    load(0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, days]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fallbackUrl = `https://news.google.com/search?q=${encodeURIComponent(query)}`;

  return (
    <div
      className="absolute inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="flex max-h-[min(34rem,85dvh)] w-full max-w-lg flex-col rounded-2xl border border-white/15 bg-[#141413] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-white">
              {title}
            </h2>
            <p className="mt-0.5 text-xs text-[#898781]">
              Latest coverage · headlines open the full article in a new tab
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close news"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[#898781] hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
          {articles === null && !failed && (
            <div className="space-y-2 px-2 py-1" aria-label="Loading headlines">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse rounded-lg bg-white/5 p-3">
                  <div className="h-3 w-4/5 rounded bg-white/10" />
                  <div className="mt-2 h-2.5 w-2/5 rounded bg-white/5" />
                </div>
              ))}
            </div>
          )}

          {failed && (
            <p className="px-2 py-3 text-sm leading-snug text-[#c3c2b7]">
              The news feed is busy right now.{" "}
              <a
                href={fallbackUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[#6da7ec] hover:underline"
              >
                Search Google News instead →
              </a>
            </p>
          )}

          {articles !== null && articles.length === 0 && (
            <p className="px-2 py-3 text-sm leading-snug text-[#c3c2b7]">
              No recent coverage found for this.{" "}
              <a
                href={fallbackUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[#6da7ec] hover:underline"
              >
                Search Google News instead →
              </a>
            </p>
          )}

          {articles !== null &&
            articles.map((a) => (
              <a
                key={a.url}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-start gap-3 rounded-lg p-2.5 transition-colors hover:bg-white/5"
              >
                {a.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.image}
                    alt=""
                    loading="lazy"
                    className="mt-0.5 h-12 w-16 shrink-0 rounded-md border border-white/10 object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
                <span className="min-w-0">
                  <span className="block text-sm leading-snug text-white">
                    {a.title}
                  </span>
                  <span className="mt-1 block truncate text-[11px] text-[#898781]">
                    {a.domain}
                    {timeAgo(a.published) ? ` · ${timeAgo(a.published)}` : ""}
                  </span>
                </span>
              </a>
            ))}
        </div>

        <p className="border-t border-white/10 px-5 py-2.5 text-[10px] text-[#898781]">
          Headlines:{" "}
          <a
            href="https://www.gdeltproject.org"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-[#c3c2b7]"
          >
            the GDELT Project
          </a>
          , an open index of worldwide news. Articles are from their original
          publishers.
        </p>
      </div>
    </div>
  );
}

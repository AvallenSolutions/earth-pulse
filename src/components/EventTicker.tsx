"use client";

import type { MapEvent } from "./EventPopup";

export type TickerItem = {
  sev: number;
  lon: number;
  lat: number;
  label: string;
  event: MapEvent;
};

function dotColour(sev: number): string {
  if (sev >= 3) return "#e34948"; // red alert
  if (sev >= 1.5) return "#ec7014"; // orange alert / strong quake
  return "#fed976"; // moderate quake
}

/**
 * A genuine news-crawl ticker pinned to the bottom of the map: a fixed "LIVE"
 * chyron on the left, then all current events scrolling continuously right to
 * left. Hovering pauses the crawl so an item can be read and clicked; each
 * click flies the map to that event. The list is duplicated so the loop is
 * seamless.
 */
export function EventTicker({
  items,
  onSelect,
}: {
  items: TickerItem[];
  onSelect: (item: TickerItem) => void;
}) {
  if (items.length === 0) return null;
  // Keep the crawl speed roughly constant regardless of how many events
  const duration = Math.max(28, items.length * 5);

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex items-stretch border-t border-white/10 bg-[#0d0d0d]/95 backdrop-blur">
      <div className="flex shrink-0 items-center gap-1.5 bg-[#e34948] px-3">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-white">
          Live
        </span>
      </div>
      <div className="ep-ticker-mask relative flex-1 overflow-hidden">
        <div
          className="ep-ticker-track flex w-max items-center py-1.5"
          style={{ animationDuration: `${duration}s` }}
        >
          {[0, 1].map((copy) =>
            items.map((item, i) => (
              <button
                key={`${copy}-${i}`}
                onClick={() => onSelect(item)}
                aria-hidden={copy === 1}
                tabIndex={copy === 1 ? -1 : 0}
                className="flex shrink-0 items-center gap-1.5 px-4 text-xs text-[#c3c2b7] transition-colors hover:text-white"
              >
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: dotColour(item.sev) }}
                />
                <span className="whitespace-nowrap">{item.label}</span>
                <span className="text-[#52514e]">|</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

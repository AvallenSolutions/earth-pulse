"use client";

/**
 * Click popup for live map events (earthquakes and GDACS disaster alerts).
 * Shows the event's own detail and links out to the official report page
 * plus a news search, so every dot on the map leads somewhere deeper.
 */

import { bandFor, formatStarCount, nelm, starsAboveHorizon } from "@/lib/sky";

export type MapEvent =
  | {
      kind: "quake";
      mag: number;
      depth: number;
      place: string;
      time: number;
      url: string;
    }
  | {
      kind: "storm";
      name: string;
      cat: number;
      maxWind: number;
      year: number;
    }
  | {
      kind: "disaster";
      type: string;
      level: string;
      name: string;
      country: string;
      severity: string;
      from: string;
      to: string;
      eventid: number;
    }
  | {
      kind: "hurricane";
      name: string;
      classification: string;
      intensity: number;
      pressure: number;
      movementDir: number | null;
      movementSpeed: number | null;
      lastUpdate: string;
      url: string;
    }
  | {
      kind: "volcano";
      name: string;
      vei: number | null;
      start: string;
      end: string | null;
      ongoing: boolean;
      number: number;
    }
  | {
      kind: "city";
      name: string;
      iso3: string;
      country: string;
      pop: number;
      capital: boolean;
      /** Zenith sky brightness (mag/arcsec^2, 2024 atlas); null if unknown */
      mpsas?: number | null;
    }
  | {
      kind: "sky";
      lat: number;
      lon: number;
      /** null when the location is outside the atlas coverage (lat -65..+75) */
      mpsas: number | null;
    };

const CAT_LABELS = [
  "Tropical depression",
  "Tropical storm",
  "Category 1 hurricane",
  "Category 2 hurricane",
  "Category 3 hurricane",
  "Category 4 hurricane",
  "Category 5 hurricane",
];

const TYPE_LABELS: Record<string, string> = {
  TC: "Tropical cyclone",
  FL: "Flood",
  DR: "Drought",
  EQ: "Earthquake",
  VO: "Volcano",
  WF: "Wildfire",
};

const NHC_CLASS: Record<string, string> = {
  TD: "Tropical depression",
  STD: "Subtropical depression",
  TS: "Tropical storm",
  STS: "Subtropical storm",
  HU: "Hurricane",
  TY: "Typhoon",
  PTC: "Post-tropical cyclone",
  PC: "Potential tropical cyclone",
};

const COMPASS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

function heading(deg: number | null): string {
  if (deg === null) return "";
  return COMPASS[Math.round(deg / 22.5) % 16];
}

const LEVEL_COLOURS: Record<string, string> = {
  Red: "#e34948",
  Orange: "#ec7014",
  Green: "#0ca30c",
};

function timeAgo(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 60) return `${mins} min ago`;
  if (mins < 72 * 60) {
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m ago`;
  }
  return new Date(ms).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** What to search the news for, per event kind. Terms are ANDed, so keep
 *  them tight: a name plus one or two qualifying words. */
export type NewsRequest = { query: string; title: string; days?: "7" | "30" | "all" };

/** "37.9 million" / "870,000" style population figures */
function formatPop(pop: number): string {
  if (pop >= 1_000_000)
    return `${(pop / 1_000_000).toFixed(pop >= 10_000_000 ? 0 : 1)} million`;
  return pop.toLocaleString("en-GB");
}

export function EventPopup({
  event,
  left,
  top,
  onClose,
  onOpenSky,
  onOpenNews,
}: {
  event: MapEvent;
  left: number;
  top: number;
  onClose: () => void;
  /** Opens the night sky simulator preset to a sky brightness value */
  onOpenSky?: (mpsas: number, cityName?: string, cityKey?: string) => void;
  /** Opens the in-app news headlines modal */
  onOpenNews?: (req: NewsRequest) => void;
}) {
  return (
    <div
      className="absolute z-40 w-72 rounded-xl border border-white/15 bg-[#141413] p-3.5 shadow-2xl"
      style={{ left, top }}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full text-[#898781] hover:bg-white/10 hover:text-white"
      >
        ✕
      </button>

      {event.kind === "sky" ? (
        <>
          <div className="pr-6 text-sm font-semibold text-white">
            The night sky here
          </div>
          {event.mpsas === null ? (
            <p className="mt-1 text-xs leading-snug text-[#c3c2b7]">
              This far towards the pole is outside the light pollution atlas
              (it covers latitudes 65°S to 75°N). The good news: skies up here
              are usually very dark.
            </p>
          ) : (
            <>
              <div className="mt-0.5 text-xs text-[#c3c2b7]">
                {bandFor(event.mpsas).label} · {bandFor(event.mpsas).blurb}
              </div>
              <dl className="mt-2 space-y-1 text-xs text-[#898781]">
                <div className="flex justify-between">
                  <dt>Stars visible</dt>
                  <dd className="tabular-nums text-[#c3c2b7]">
                    about {formatStarCount(starsAboveHorizon(nelm(event.mpsas)))}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Sky brightness</dt>
                  <dd className="tabular-nums text-[#c3c2b7]">
                    {event.mpsas.toFixed(1)} mag/arcsec²
                  </dd>
                </div>
              </dl>
            </>
          )}
          <div className="mt-3 flex flex-col gap-1.5 border-t border-white/10 pt-2.5 text-xs">
            {onOpenSky && event.mpsas !== null && (
              <button
                onClick={() => onOpenSky(event.mpsas!)}
                className="text-left text-[#6da7ec] hover:underline"
              >
                See this sky →
              </button>
            )}
            <a
              href="https://djlorenz.github.io/astronomy/lp2024/"
              target="_blank"
              rel="noreferrer"
              className="text-[#6da7ec] hover:underline"
            >
              Light Pollution Atlas 2024 (David J. Lorenz) →
            </a>
          </div>
        </>
      ) : event.kind === "city" ? (
        <>
          <div className="flex items-center gap-2 pr-6">
            {event.capital && (
              <span className="rounded-full bg-[#ffd18f]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#ffd18f]">
                Capital city
              </span>
            )}
          </div>
          <div className={`${event.capital ? "mt-1.5" : ""} pr-6 text-sm font-semibold text-white`}>
            {event.name}
          </div>
          <div className="mt-0.5 text-xs text-[#c3c2b7]">{event.country}</div>
          <dl className="mt-2 space-y-1 text-xs text-[#898781]">
            {event.pop > 0 && (
              <div className="flex justify-between">
                <dt>Population (urban area)</dt>
                <dd className="tabular-nums text-[#c3c2b7]">{formatPop(event.pop)}</dd>
              </div>
            )}
            {event.mpsas !== null && event.mpsas !== undefined && (
              <div className="flex justify-between">
                <dt>Night sky</dt>
                <dd className="text-[#c3c2b7]">
                  {bandFor(event.mpsas).label} · about{" "}
                  {formatStarCount(starsAboveHorizon(nelm(event.mpsas)))} stars
                </dd>
              </div>
            )}
          </dl>
          <div className="mt-3 flex flex-col gap-1.5 border-t border-white/10 pt-2.5 text-xs">
            {onOpenSky && event.mpsas !== null && event.mpsas !== undefined && (
              <button
                onClick={() =>
                  onOpenSky(event.mpsas!, event.name, `${event.iso3}/${event.name}`)
                }
                className="text-left text-[#6da7ec] hover:underline"
              >
                See what light pollution does to this sky →
              </button>
            )}
            <a
              href={`/country/${event.iso3}`}
              className="text-[#6da7ec] hover:underline"
            >
              {event.country}: the full country picture →
            </a>
            <a
              href={`https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(`${event.name}, ${event.country}`)}`}
              target="_blank"
              rel="noreferrer"
              className="text-[#6da7ec] hover:underline"
            >
              Wikipedia →
            </a>
            <button
              onClick={() =>
                onOpenNews?.({
                  query: `${event.name} ${event.country}`,
                  title: `News from ${event.name}`,
                })
              }
              className="text-left text-[#6da7ec] hover:underline"
            >
              News from {event.name} →
            </button>
          </div>
        </>
      ) : event.kind === "storm" ? (
        <>
          <div className="pr-6 text-sm font-semibold text-white">
            {event.name} · {event.year}
          </div>
          <div className="mt-0.5 text-xs text-[#c3c2b7]">
            {CAT_LABELS[event.cat] ?? "Storm"}
          </div>
          <dl className="mt-2 space-y-1 text-xs text-[#898781]">
            <div className="flex justify-between">
              <dt>Peak winds</dt>
              <dd className="tabular-nums text-[#c3c2b7]">
                {event.maxWind > 0
                  ? `${event.maxWind} kt (${Math.round(event.maxWind * 1.852)} km/h)`
                  : "not recorded"}
              </dd>
            </div>
          </dl>
          <div className="mt-3 flex flex-col gap-1.5 border-t border-white/10 pt-2.5 text-xs">
            <a
              href={`https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(`${event.name} ${event.year} cyclone hurricane typhoon`)}`}
              target="_blank"
              rel="noreferrer"
              className="text-[#6da7ec] hover:underline"
            >
              Wikipedia →
            </a>
            <button
              onClick={() =>
                onOpenNews?.({
                  query: `${event.name} hurricane`,
                  title: `News: ${event.name} (${event.year})`,
                  days: "all",
                })
              }
              className="text-left text-[#6da7ec] hover:underline"
            >
              News coverage →
            </button>
          </div>
        </>
      ) : event.kind === "quake" ? (
        <>
          <div className="pr-6 text-sm font-semibold text-white">
            M{event.mag.toFixed(1)} earthquake
          </div>
          <div className="mt-0.5 text-xs text-[#c3c2b7]">{event.place}</div>
          <dl className="mt-2 space-y-1 text-xs text-[#898781]">
            <div className="flex justify-between">
              <dt>When</dt>
              <dd className="tabular-nums text-[#c3c2b7]">
                {timeAgo(event.time)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Depth</dt>
              <dd className="tabular-nums text-[#c3c2b7]">{event.depth} km</dd>
            </div>
          </dl>
          <div className="mt-3 flex flex-col gap-1.5 border-t border-white/10 pt-2.5 text-xs">
            <a
              href={event.url}
              target="_blank"
              rel="noreferrer"
              className="text-[#6da7ec] hover:underline"
            >
              USGS event page →
            </a>
            <button
              onClick={() =>
                onOpenNews?.({
                  // "14 km WSW of Mabiton, Philippines" -> "earthquake Mabiton Philippines"
                  query: `earthquake ${(event.place.split(" of ").pop() ?? event.place).replace(",", " ")}`,
                  title: `News: M${event.mag.toFixed(1)} earthquake`,
                })
              }
              className="text-left text-[#6da7ec] hover:underline"
            >
              News coverage →
            </button>
          </div>
        </>
      ) : event.kind === "hurricane" ? (
        <>
          <div className="pr-6 text-sm font-semibold text-white">
            {NHC_CLASS[event.classification] ?? "Storm"} {event.name}
          </div>
          <dl className="mt-2 space-y-1 text-xs text-[#898781]">
            <div className="flex justify-between">
              <dt>Max winds</dt>
              <dd className="tabular-nums text-[#c3c2b7]">
                {event.intensity} kt ({Math.round(event.intensity * 1.852)} km/h)
              </dd>
            </div>
            {event.pressure > 0 && (
              <div className="flex justify-between">
                <dt>Pressure</dt>
                <dd className="tabular-nums text-[#c3c2b7]">
                  {event.pressure} mb
                </dd>
              </div>
            )}
            {event.movementSpeed !== null && (
              <div className="flex justify-between">
                <dt>Moving</dt>
                <dd className="tabular-nums text-[#c3c2b7]">
                  {heading(event.movementDir)} at {event.movementSpeed} mph
                </dd>
              </div>
            )}
          </dl>
          <div className="mt-3 flex flex-col gap-1.5 border-t border-white/10 pt-2.5 text-xs">
            <a
              href={event.url}
              target="_blank"
              rel="noreferrer"
              className="text-[#6da7ec] hover:underline"
            >
              NHC public advisory →
            </a>
            <button
              onClick={() =>
                onOpenNews?.({
                  query: `hurricane ${event.name}`,
                  title: `News: ${NHC_CLASS[event.classification] ?? "Storm"} ${event.name}`,
                })
              }
              className="text-left text-[#6da7ec] hover:underline"
            >
              News coverage →
            </button>
          </div>
        </>
      ) : event.kind === "volcano" ? (
        <>
          <div className="flex items-center gap-2 pr-6">
            <span className="rounded-full bg-[#e34948] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              {event.ongoing ? "Erupting" : "Recent eruption"}
            </span>
          </div>
          <div className="mt-1.5 text-sm font-semibold text-white">
            {event.name}
          </div>
          <dl className="mt-2 space-y-1 text-xs text-[#898781]">
            <div className="flex justify-between">
              <dt>{event.ongoing ? "Started" : "Erupted"}</dt>
              <dd className="tabular-nums text-[#c3c2b7]">
                {event.start}
                {!event.ongoing && event.end && event.end !== event.start
                  ? ` → ${event.end}`
                  : ""}
              </dd>
            </div>
            {event.vei !== null && (
              <div className="flex justify-between">
                <dt>Explosivity (VEI)</dt>
                <dd className="tabular-nums text-[#c3c2b7]">{event.vei}</dd>
              </div>
            )}
          </dl>
          <div className="mt-3 flex flex-col gap-1.5 border-t border-white/10 pt-2.5 text-xs">
            <a
              href={`https://volcano.si.edu/volcano.cfm?vn=${event.number}`}
              target="_blank"
              rel="noreferrer"
              className="text-[#6da7ec] hover:underline"
            >
              Smithsonian GVP profile →
            </a>
            <button
              onClick={() =>
                onOpenNews?.({
                  query: `${event.name} volcano`,
                  title: `News: ${event.name}`,
                  days: "30",
                })
              }
              className="text-left text-[#6da7ec] hover:underline"
            >
              News coverage →
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 pr-6">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
              style={{ background: LEVEL_COLOURS[event.level] ?? "#52514e" }}
            >
              {event.level} alert
            </span>
            <span className="text-[10px] uppercase tracking-wide text-[#898781]">
              {TYPE_LABELS[event.type] ?? event.type}
            </span>
          </div>
          <div className="mt-1.5 text-sm font-semibold text-white">
            {event.name || TYPE_LABELS[event.type] || "Event"}
          </div>
          {event.severity && (
            <div className="mt-1 text-xs leading-snug text-[#c3c2b7]">
              {event.severity}
            </div>
          )}
          <dl className="mt-2 space-y-1 text-xs text-[#898781]">
            {event.country && (
              <div>
                <dt className="inline">Affected: </dt>
                <dd className="inline text-[#c3c2b7]">{event.country}</dd>
              </div>
            )}
            {event.from && (
              <div className="flex justify-between">
                <dt>Period</dt>
                <dd className="tabular-nums text-[#c3c2b7]">
                  {event.from}
                  {event.to && event.to !== event.from ? ` → ${event.to}` : ""}
                </dd>
              </div>
            )}
          </dl>
          <div className="mt-3 flex flex-col gap-1.5 border-t border-white/10 pt-2.5 text-xs">
            <a
              href={`https://www.gdacs.org/report.aspx?eventid=${event.eventid}&eventtype=${event.type}`}
              target="_blank"
              rel="noreferrer"
              className="text-[#6da7ec] hover:underline"
            >
              Full GDACS report →
            </a>
            <button
              onClick={() =>
                onOpenNews?.({
                  query:
                    event.name ||
                    `${TYPE_LABELS[event.type]} ${event.country.split(",")[0] ?? ""}`,
                  title: `News: ${event.name || TYPE_LABELS[event.type] || "this event"}`,
                })
              }
              className="text-left text-[#6da7ec] hover:underline"
            >
              News coverage →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

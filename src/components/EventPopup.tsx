"use client";

/**
 * Click popup for live map events (earthquakes and GDACS disaster alerts).
 * Shows the event's own detail and links out to the official report page
 * plus a news search, so every dot on the map leads somewhere deeper.
 */

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

const LEVEL_COLOURS: Record<string, string> = {
  Red: "#e34948",
  Orange: "#ec7014",
  Green: "#0ca30c",
};

function timeAgo(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m ago`;
}

function newsUrl(query: string): string {
  return `https://news.google.com/search?q=${encodeURIComponent(query)}`;
}

export function EventPopup({
  event,
  left,
  top,
  onClose,
}: {
  event: MapEvent;
  left: number;
  top: number;
  onClose: () => void;
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

      {event.kind === "storm" ? (
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
            <a
              href={newsUrl(`${event.name} hurricane cyclone ${event.year}`)}
              target="_blank"
              rel="noreferrer"
              className="text-[#6da7ec] hover:underline"
            >
              News coverage →
            </a>
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
            <a
              href={newsUrl(`M${event.mag.toFixed(1)} earthquake ${event.place}`)}
              target="_blank"
              rel="noreferrer"
              className="text-[#6da7ec] hover:underline"
            >
              News coverage →
            </a>
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
            <a
              href={newsUrl(event.name || `${TYPE_LABELS[event.type]} ${event.country.split(",")[0] ?? ""}`)}
              target="_blank"
              rel="noreferrer"
              className="text-[#6da7ec] hover:underline"
            >
              News coverage →
            </a>
          </div>
        </>
      )}
    </div>
  );
}

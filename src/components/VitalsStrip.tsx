"use client";

import type { Vitals } from "@/lib/vitals";

/**
 * The planet's heartbeat numbers, top centre of the map. Values arrive
 * server-rendered (ISR, 6h); any feed that failed is simply not shown.
 */
export function VitalsStrip({
  vitals,
  variant = "floating",
  onSelect,
}: {
  vitals: Vitals;
  /** floating = centred pill on wide screens; inline = compact row in flow */
  variant?: "floating" | "inline";
  /** called with the card's history id when a card is clicked */
  onSelect?: (id: string) => void;
}) {
  const items: {
    id: string;
    label: string;
    value: string;
    detail: string;
    /** true when the trend is moving the wrong way for the planet */
    worsening: boolean;
    arrow: "up" | "down";
  }[] = [];

  if (vitals.co2) {
    items.push({
      id: "co2",
      label: "Atmospheric CO2",
      value: `${vitals.co2.ppm.toFixed(1)} ppm`,
      detail: `${vitals.co2.delta1yr >= 0 ? "+" : ""}${vitals.co2.delta1yr} vs last year · ${vitals.co2.date}`,
      worsening: vitals.co2.delta1yr > 0,
      arrow: vitals.co2.delta1yr >= 0 ? "up" : "down",
    });
  }
  if (vitals.temp) {
    items.push({
      id: "temperature",
      label: "Global temperature",
      value: `${vitals.temp.anomaly >= 0 ? "+" : ""}${vitals.temp.anomaly.toFixed(2)} °C`,
      detail: `vs 1951-1980 · ${vitals.temp.monthLabel}`,
      worsening: vitals.temp.anomaly > 0,
      arrow: vitals.temp.anomaly >= 0 ? "up" : "down",
    });
  }
  if (vitals.seaIce) {
    items.push({
      id: "seaice",
      label: "Arctic sea ice",
      value: `${vitals.seaIce.extent.toFixed(2)}M km²`,
      detail: `${vitals.seaIce.anomalyPct}% vs 1981-2010 · ${vitals.seaIce.date}`,
      worsening: vitals.seaIce.anomalyPct < 0,
      arrow: vitals.seaIce.anomalyPct < 0 ? "down" : "up",
    });
  }
  if (items.length === 0) return null;

  const compact = variant === "inline";
  return (
    <div
      className={
        compact
          ? "pointer-events-none"
          : "pointer-events-none absolute left-1/2 top-4 z-10 hidden -translate-x-1/2 xl:block"
      }
    >
      <div
        className={`flex divide-x divide-white/10 rounded-xl border border-white/10 bg-[#1a1a19]/90 backdrop-blur ${
          compact ? "w-fit max-w-[calc(100vw-2rem)] overflow-x-auto" : ""
        }`}
      >
        {items.map((it) => (
          <button
            key={it.label}
            onClick={() => onSelect?.(it.id)}
            title={`See how ${it.label.toLowerCase()} has changed over time`}
            className={`pointer-events-auto text-left transition-colors hover:bg-white/5 ${
              compact ? "shrink-0 px-3 py-1.5" : "px-4 py-2"
            }`}
          >
            <div className="text-[10px] font-medium uppercase tracking-wide text-[#898781]">
              {it.label}
            </div>
            <div
              className={`flex items-baseline gap-1.5 font-semibold tabular-nums text-white ${
                compact ? "text-sm" : "text-base"
              }`}
            >
              {it.value}
              <span
                className="text-xs"
                style={{ color: it.worsening ? "#e66767" : "#199e70" }}
                aria-label={it.worsening ? "worsening" : "improving"}
              >
                {it.arrow === "up" ? "▲" : "▼"}
              </span>
            </div>
            <div className="text-[10px] tabular-nums text-[#898781]">
              {it.detail}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

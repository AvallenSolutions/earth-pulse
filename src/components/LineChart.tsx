"use client";

import { useId, useRef, useState } from "react";
import { formatValue } from "@/lib/types";

/**
 * Detailed single-series line chart on the dark surface.
 * - gradient area fill (all-positive series only)
 * - 10-year smoothed trend for long noisy series
 * - record high/low annotations with years (selective direct labels)
 * - optional comparison series (e.g. World), dashed and direct-labelled
 * - crosshair + tooltip showing both series
 */
export function LineChart({
  points,
  unit,
  colour = "#3987e5",
  compare,
  overlays,
  height = 200,
}: {
  points: [number, number][];
  unit: string;
  colour?: string;
  compare?: { label: string; points: [number, number][] };
  /** Extra series (e.g. scenario projections), dashed and direct-labelled. */
  overlays?: { label: string; points: [number, number][]; colour: string }[];
  height?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const gradId = useId().replace(/[:]/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;

  const pad = { l: 48, r: 14, t: 16, b: 22 };
  const overlayPts = overlays?.flatMap((o) => o.points) ?? [];
  const xs = [...points.map((p) => p[0]), ...overlayPts.map((p) => p[0])];
  const allYs = [
    ...points.map((p) => p[1]),
    ...(compare?.points.map((p) => p[1]) ?? []),
    ...overlayPts.map((p) => p[1]),
  ];
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  let y0 = Math.min(...allYs, 0);
  let y1 = Math.max(...allYs);
  if (y0 === y1) {
    y0 -= 1;
    y1 += 1;
  }
  // headroom so annotation labels fit
  const span = y1 - y0;
  y1 += span * 0.08;

  const px = (x: number) =>
    pad.l + ((x - x0) / (x1 - x0 || 1)) * (width - pad.l - pad.r);
  const py = (y: number) =>
    height - pad.b - ((y - y0) / (y1 - y0 || 1)) * (height - pad.t - pad.b);

  const pathOf = (pts: [number, number][]) =>
    pts
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${px(x).toFixed(1)},${py(y).toFixed(1)}`)
      .join("");

  const d = pathOf(points);
  const allPositive = points.every(([, y]) => y >= 0);
  const area = allPositive
    ? `${d}L${px(points[points.length - 1][0]).toFixed(1)},${py(0).toFixed(1)}L${px(points[0][0]).toFixed(1)},${py(0).toFixed(1)}Z`
    : null;

  // Smoothed trend (centred rolling mean) for long noisy series
  const showTrend = points.length >= 40;
  let trendPath: string | null = null;
  if (showTrend) {
    const w = 10;
    const trend: [number, number][] = points.map(([x], i) => {
      const lo = Math.max(0, i - Math.floor(w / 2));
      const hi = Math.min(points.length - 1, i + Math.floor(w / 2));
      const slice = points.slice(lo, hi + 1);
      return [x, slice.reduce((s, [, v]) => s + v, 0) / slice.length];
    });
    trendPath = pathOf(trend);
  }

  // Record high / low (skip when they sit at the very ends of the series)
  const maxI = points.reduce((b, p, i) => (p[1] > points[b][1] ? i : b), 0);
  const minI = points.reduce((b, p, i) => (p[1] < points[b][1] ? i : b), 0);
  // labelY is clamped so record labels never spill past the plot edges
  const annotations = [
    {
      i: maxI,
      label: `high ${points[maxI][0]}`,
      labelY: Math.max(py(points[maxI][1]) - 7, pad.t + 8),
    },
    {
      i: minI,
      label: `low ${points[minI][0]}`,
      labelY: Math.min(py(points[minI][1]) + 14, height - pad.b - 4),
    },
  ].filter(({ i }) => i !== 0 && i !== points.length - 1 && points.length > 12);

  // gridlines
  const step = niceStep((y1 - y0) / 4);
  const gridYs: number[] = [];
  for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) gridYs.push(v);
  const xStep = niceStep((x1 - x0) / 6);
  const gridXs: number[] = [];
  for (let v = Math.ceil(x0 / xStep) * xStep; v <= x1; v += xStep) gridXs.push(v);

  const onMove = (e: React.PointerEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const fx = ((e.clientX - rect.left) / rect.width) * width;
    const year = x0 + ((fx - pad.l) / (width - pad.l - pad.r)) * (x1 - x0);
    let best = 0;
    for (let i = 1; i < points.length; i++)
      if (Math.abs(points[i][0] - year) < Math.abs(points[best][0] - year)) best = i;
    setHover(best);
  };

  const h = hover !== null ? points[hover] : null;
  const hCompare =
    h && compare ? compare.points.find(([x]) => x === h[0]) : undefined;
  const compareEnd = compare?.points[compare.points.length - 1];

  return (
    <div ref={wrapRef} className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colour} stopOpacity="0.28" />
            <stop offset="100%" stopColor={colour} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {gridYs.map((v) => (
          <g key={v}>
            <line
              x1={pad.l}
              x2={width - pad.r}
              y1={py(v)}
              y2={py(v)}
              stroke="#2c2c2a"
              strokeWidth="1"
            />
            <text
              x={pad.l - 6}
              y={py(v) + 3}
              textAnchor="end"
              fontSize="10"
              fill="#898781"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatTick(v)}
            </text>
          </g>
        ))}
        {gridXs.map((v) => (
          <text
            key={v}
            x={px(v)}
            y={height - 6}
            textAnchor="middle"
            fontSize="10"
            fill="#898781"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {v}
          </text>
        ))}
        {points.some(([, y]) => y < 0) && (
          <line
            x1={pad.l}
            x2={width - pad.r}
            y1={py(0)}
            y2={py(0)}
            stroke="#52514e"
            strokeWidth="1"
          />
        )}
        {area && <path d={area} fill={`url(#${gradId})`} />}
        {compare && (
          <path
            d={pathOf(compare.points)}
            fill="none"
            stroke="#898781"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            opacity="0.9"
          />
        )}
        {overlays?.map((o) => (
          <g key={o.label}>
            <path
              d={pathOf(o.points)}
              fill="none"
              stroke={o.colour}
              strokeWidth="1.8"
              strokeDasharray="5 3"
              opacity="0.9"
            />
            <text
              x={Math.min(px(o.points[o.points.length - 1][0]), width - 2)}
              y={py(o.points[o.points.length - 1][1]) - 4}
              textAnchor="end"
              fontSize="9"
              fill={o.colour}
            >
              {o.label}
            </text>
          </g>
        ))}
        <path
          d={d}
          fill="none"
          stroke={colour}
          strokeWidth={showTrend ? 1.4 : 2}
          strokeOpacity={showTrend ? 0.5 : 1}
        />
        {trendPath && (
          <path d={trendPath} fill="none" stroke={colour} strokeWidth="2.5" />
        )}
        {compare && compareEnd && (
          <text
            x={Math.min(px(compareEnd[0]), width - pad.r)}
            y={py(compareEnd[1]) - 5}
            textAnchor="end"
            fontSize="10"
            fill="#898781"
          >
            {compare.label}
          </text>
        )}
        {annotations.map(({ i, label, labelY }) => (
          <g key={label}>
            <circle
              cx={px(points[i][0])}
              cy={py(points[i][1])}
              r="3"
              fill={colour}
              stroke="#1a1a19"
              strokeWidth="1.5"
            />
            <text
              x={px(points[i][0])}
              y={labelY}
              textAnchor="middle"
              fontSize="9"
              fill="#c3c2b7"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {label}
            </text>
          </g>
        ))}
        {h && (
          <>
            <line
              x1={px(h[0])}
              x2={px(h[0])}
              y1={pad.t}
              y2={height - pad.b}
              stroke="#52514e"
              strokeWidth="1"
            />
            <circle
              cx={px(h[0])}
              cy={py(h[1])}
              r="4"
              fill={colour}
              stroke="#1a1a19"
              strokeWidth="2"
            />
            {hCompare && (
              <circle
                cx={px(hCompare[0])}
                cy={py(hCompare[1])}
                r="3"
                fill="#898781"
                stroke="#1a1a19"
                strokeWidth="1.5"
              />
            )}
          </>
        )}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute -top-1 rounded-md border border-white/10 bg-[#0d0d0d] px-2 py-1 text-xs text-white shadow-lg"
          style={{
            left: `calc(${(px(h[0]) / width) * 100}% ${px(h[0]) / width > 0.7 ? "- 130px" : "+ 10px"})`,
          }}
        >
          <span className="tabular-nums text-[#898781]">{h[0]}</span>{" "}
          {formatValue(h[1], unit)}
          {hCompare && (
            <span className="text-[#898781]">
              {" · "}
              {compare!.label} {formatValue(hCompare[1], unit)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function niceStep(raw: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)));
  const n = raw / mag;
  return (n >= 5 ? 10 : n >= 2 ? 5 : n >= 1 ? 2 : 1) * mag;
}

function formatTick(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(v * 100) / 100}`;
}

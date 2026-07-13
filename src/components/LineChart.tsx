"use client";

import { useRef, useState } from "react";
import { formatValue } from "@/lib/types";

/**
 * Single-series line chart on the dark surface, with a crosshair + tooltip
 * hover layer. One series per chart, so the title carries identity and no
 * legend box is needed.
 */
export function LineChart({
  points,
  unit,
  height = 180,
}: {
  points: [number, number][];
  unit: string;
  height?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null); // index into points
  const width = 640; // viewBox width; scales responsively via CSS

  const pad = { l: 46, r: 10, t: 10, b: 22 };
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  let y0 = Math.min(...ys, 0 < Math.min(...ys) ? Math.min(...ys) : 0);
  let y1 = Math.max(...ys);
  if (y0 === y1) {
    y0 -= 1;
    y1 += 1;
  }
  const px = (x: number) =>
    pad.l + ((x - x0) / (x1 - x0 || 1)) * (width - pad.l - pad.r);
  const py = (y: number) =>
    height - pad.b - ((y - y0) / (y1 - y0 || 1)) * (height - pad.t - pad.b);

  const d = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${px(x).toFixed(1)},${py(y).toFixed(1)}`)
    .join("");

  // ~4 horizontal gridlines at round values
  const step = niceStep((y1 - y0) / 4);
  const gridYs: number[] = [];
  for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) gridYs.push(v);
  // ~6 x ticks at round years
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

  return (
    <div ref={wrapRef} className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
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
              {Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : round2(v)}
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
            stroke="#383835"
            strokeWidth="1"
          />
        )}
        <path d={d} fill="none" stroke="#3987e5" strokeWidth="2" />
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
              fill="#3987e5"
              stroke="#1a1a19"
              strokeWidth="2"
            />
          </>
        )}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute -top-1 rounded-md border border-white/10 bg-[#0d0d0d] px-2 py-1 text-xs text-white shadow-lg"
          style={{
            left: `calc(${(px(h[0]) / width) * 100}% ${px(h[0]) / width > 0.75 ? "- 110px" : "+ 10px"})`,
          }}
        >
          <span className="tabular-nums text-[#898781]">{h[0]}</span>{" "}
          {formatValue(h[1], unit)}
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

function round2(v: number): string {
  return `${Math.round(v * 100) / 100}`;
}

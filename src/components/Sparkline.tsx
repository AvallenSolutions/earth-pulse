"use client";

/** Tiny inline history line with a marker at the selected year. */
export function Sparkline({
  points,
  year,
  width,
  height,
}: {
  points: [number, number][];
  year: number;
  width: number;
  height: number;
}) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const px = (x: number) => ((x - x0) / (x1 - x0 || 1)) * (width - 4) + 2;
  const py = (y: number) =>
    height - 3 - ((y - y0) / (y1 - y0 || 1)) * (height - 6);
  const d = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${px(x).toFixed(1)},${py(y).toFixed(1)}`)
    .join("");
  const current = points.reduce((best, p) =>
    Math.abs(p[0] - year) < Math.abs(best[0] - year) ? p : best
  );
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={d} fill="none" stroke="#3987e5" strokeWidth="1.5" />
      <circle
        cx={px(current[0])}
        cy={py(current[1])}
        r="3"
        fill="#3987e5"
        stroke="#1a1a19"
        strokeWidth="1.5"
      />
    </svg>
  );
}

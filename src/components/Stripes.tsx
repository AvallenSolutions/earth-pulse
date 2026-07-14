import { DIVERGING_RAMPS } from "@/lib/colors";

/**
 * Climate stripes: one coloured band per year of temperature anomaly.
 * Pure SVG, renders on the server; no interaction beyond an accessible label.
 * Colour scheme matches the map's temperature ramp, so blue = cooler than the
 * 1991-2020 average, red = hotter, with the extremes brightest.
 */

function hexLerp(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return (
    "#" +
    pa
      .map((v, i) =>
        Math.round(v + (pb[i] - v) * t)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

/** Map an anomaly in [-limit, +limit] onto the 7-colour temp ramp. */
function stripeColour(value: number, limit: number): string {
  const d = DIVERGING_RAMPS.temp;
  const colours = [...d.low, d.mid, ...d.high];
  const t = Math.max(0, Math.min(1, (value + limit) / (2 * limit)));
  const pos = t * (colours.length - 1);
  const i = Math.min(Math.floor(pos), colours.length - 2);
  return hexLerp(colours[i], colours[i + 1], pos - i);
}

export function Stripes({
  points,
  height = 56,
  limit = 2.5,
  label,
}: {
  /** [year, anomaly] pairs, ascending years */
  points: [number, number][];
  height?: number;
  /** anomaly magnitude mapped to the ramp's extremes */
  limit?: number;
  /** accessible description, e.g. "Warming stripes for Brazil, 1940-2025" */
  label: string;
}) {
  if (points.length < 2) return null;
  const first = points[0][0];
  const last = points[points.length - 1][0];
  return (
    <div>
      <svg
        viewBox={`0 0 ${points.length} 10`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        className="block w-full rounded-sm"
        style={{ height }}
      >
        {points.map(([year, value], i) => (
          <rect
            key={year}
            x={i}
            y={0}
            width={1.02}
            height={10}
            fill={stripeColour(value, limit)}
          />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-[#898781]">
        <span>{first}</span>
        <span>{last}</span>
      </div>
    </div>
  );
}

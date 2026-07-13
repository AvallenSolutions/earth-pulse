/**
 * Colour scales for the dark map surface, from the validated dataviz palette.
 * Sequential: one blue ramp, receding (darkest) at near-zero on dark.
 * Diverging: blue (cool) <-> red (warm) with a neutral dark-gray midpoint;
 * intensity (brightness on dark) grows towards each extreme.
 */

export const NO_DATA = "#2c2c2a";

/** Blue ramp, low -> high, stepped for the dark surface. */
export const SEQUENTIAL = [
  "#0d366b",
  "#104281",
  "#1c5cab",
  "#256abf",
  "#3987e5",
  "#6da7ec",
  "#9ec5f4",
  "#cde2fb",
];

/** Diverging blue<->red around a neutral midpoint, dark surface steps. */
export const DIVERGING = {
  cool: ["#b7d3f6", "#5598e7", "#1c5cab"], // extreme -> near-mid
  mid: "#383835",
  warm: ["#8a3232", "#e66767", "#f5b8b8"], // near-mid -> extreme
};

/** MapLibre interpolate expression stops: [value, colour, value, colour...] */
export function scaleStops(
  scaleType: "sequential" | "diverging",
  [min, max]: [number, number],
  customStops?: number[],
  flipDiverging?: boolean
): (number | string)[] {
  const stops: (number | string)[] = [];
  if (scaleType === "sequential") {
    SEQUENTIAL.forEach((c, i) => {
      const v =
        customStops?.[i] ?? min + ((max - min) * i) / (SEQUENTIAL.length - 1);
      stops.push(v, c);
    });
  } else {
    // Default: low = cool (blue), high = warm (red). Flipped: low = warm,
    // for metrics where low is the "hot" pole (e.g. drought).
    const { cool, mid, warm } = DIVERGING;
    const lowArm = flipDiverging ? [warm[2], warm[1], warm[0]] : cool;
    const highArm = flipDiverging ? [cool[2], cool[1], cool[0]] : warm;
    stops.push(min, lowArm[0]);
    stops.push(min / 2, lowArm[1]);
    stops.push(min / 6, lowArm[2]);
    stops.push(0, mid);
    stops.push(max / 6, highArm[0]);
    stops.push(max / 2, highArm[1]);
    stops.push(max, highArm[2]);
  }
  return stops;
}

/** Same scale evaluated in JS, for the legend and tooltips. */
export function colourFor(
  value: number,
  scaleType: "sequential" | "diverging",
  scale: [number, number]
): string {
  const stops = scaleStops(scaleType, scale);
  const pairs: [number, string][] = [];
  for (let i = 0; i < stops.length; i += 2)
    pairs.push([stops[i] as number, stops[i + 1] as string]);
  if (value <= pairs[0][0]) return pairs[0][1];
  for (let i = 1; i < pairs.length; i++) {
    if (value <= pairs[i][0]) {
      const [v0, c0] = pairs[i - 1];
      const [v1, c1] = pairs[i];
      return mix(c0, c1, (value - v0) / (v1 - v0));
    }
  }
  return pairs[pairs.length - 1][1];
}

function mix(a: string, b: string, t: number): string {
  const pa = hex(a);
  const pb = hex(b);
  const c = pa.map((x, i) => Math.round(x + (pb[i] - x) * t));
  return `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function hex(h: string): number[] {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/**
 * Colour system for the map. Each metric names a ramp so every domain has
 * its own identity: ember for emissions, greens for renewables and forests,
 * amber for fossil fuels, teal for water, magenta for air pollution.
 *
 * All ramps run low -> high as dark -> bright: on the dark terrain surface,
 * brightness is intensity, and low values recede into the landscape.
 * Sequential steps are ColorBrewer scales (colourblind-checked) reversed for
 * the dark surface; diverging ramps put a dark neutral at the midpoint so
 * "no change" recedes and both extremes glow.
 */

export const NO_DATA = "rgba(10, 16, 26, 0.45)";

export const SEQUENTIAL_RAMPS: Record<string, string[]> = {
  ember: ["#3d0a10", "#6b1016", "#9c1c1c", "#cc3a24", "#ee6a30", "#fb9a3c", "#fecf62", "#ffeda0"],
  amber: ["#662506", "#993404", "#cc4c02", "#ec7014", "#fe9929", "#fec44f", "#fee391", "#fff7bc"],
  greens: ["#00441b", "#006d2c", "#238b45", "#41ab5d", "#74c476", "#a1d99b", "#c7e9c0", "#e5f5e0"],
  violet: ["#4d004b", "#810f7c", "#88419d", "#8c6bb1", "#8c96c6", "#9ebcda", "#bfd3e6", "#e0ecf4"],
  teal: ["#084081", "#0868ac", "#2b8cbe", "#4eb3d3", "#7bccc4", "#a8ddb5", "#ccebc5", "#e0f3db"],
  blues: ["#0d366b", "#104281", "#1c5cab", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb"],
  magenta: ["#49006a", "#7a0177", "#ae017e", "#dd3497", "#f768a1", "#fa9fb5", "#fcc5c0", "#fde0dd"],
  loss: ["#3f0d05", "#701a09", "#a52c12", "#d7301f", "#ef6548", "#fc8d59", "#fdbb84", "#fee8c8"],
  reds: ["#360409", "#67000d", "#a50f15", "#cb181d", "#ef3b2c", "#fb6a4a", "#fc9272", "#fee0d2"],
};

/** Arms run extreme -> near-midpoint; mid is the recessive neutral. */
export const DIVERGING_RAMPS: Record<
  string,
  { low: string[]; mid: string; high: string[] }
> = {
  // cold blue <-> hot red (temperature)
  temp: {
    low: ["#b7d3f6", "#5598e7", "#1c5cab"],
    mid: "#383835",
    high: ["#8a3232", "#e66767", "#f5b8b8"],
  },
  // dry brown <-> wet teal (rainfall)
  rain: {
    low: ["#f0cf8e", "#c99b4a", "#6e5424"],
    mid: "#383835",
    high: ["#1d5f58", "#35a79b", "#9fe3d8"],
  },
};

const DEFAULT_SEQUENTIAL = "blues";
const DEFAULT_DIVERGING = "temp";

export function rampColours(
  scaleType: "sequential" | "diverging",
  ramp?: string
): string[] {
  if (scaleType === "sequential") {
    return SEQUENTIAL_RAMPS[ramp ?? DEFAULT_SEQUENTIAL] ?? SEQUENTIAL_RAMPS[DEFAULT_SEQUENTIAL];
  }
  const d = DIVERGING_RAMPS[ramp ?? DEFAULT_DIVERGING] ?? DIVERGING_RAMPS[DEFAULT_DIVERGING];
  return [...d.low, d.mid, ...d.high];
}

/** MapLibre interpolate expression stops: [value, colour, value, colour...] */
export function scaleStops(
  scaleType: "sequential" | "diverging",
  [min, max]: [number, number],
  customStops?: number[],
  ramp?: string
): (number | string)[] {
  const stops: (number | string)[] = [];
  if (scaleType === "sequential") {
    const colours = rampColours("sequential", ramp);
    colours.forEach((c, i) => {
      const v =
        customStops?.[i] ?? min + ((max - min) * i) / (colours.length - 1);
      stops.push(v, c);
    });
  } else {
    const d = DIVERGING_RAMPS[ramp ?? DEFAULT_DIVERGING] ?? DIVERGING_RAMPS[DEFAULT_DIVERGING];
    stops.push(min, d.low[0]);
    stops.push(min / 2, d.low[1]);
    stops.push(min / 6, d.low[2]);
    stops.push(0, d.mid);
    stops.push(max / 6, d.high[0]);
    stops.push(max / 2, d.high[1]);
    stops.push(max, d.high[2]);
  }
  return stops;
}

/** A bright step from the metric's ramp, for chart lines and sparklines. */
export function accentFor(
  scaleType: "sequential" | "diverging",
  ramp?: string
): string {
  if (scaleType === "sequential") return rampColours("sequential", ramp)[5];
  const d = DIVERGING_RAMPS[ramp ?? DEFAULT_DIVERGING] ?? DIVERGING_RAMPS[DEFAULT_DIVERGING];
  return d.high[1];
}

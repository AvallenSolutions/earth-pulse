export type Metric = {
  id: string;
  name: string;
  unit: string;
  domain: string;
  source: string;
  sourceUrl: string;
  explainer: string;
  scale: [number, number];
  scaleType: "sequential" | "diverging";
  stops?: number[];
  flipDiverging?: boolean;
  global?: boolean;
  firstYear: number;
  lastYear: number;
};

export type Country = {
  iso3: string;
  name: string;
  continent: string;
  region: string;
  on_map: boolean;
};

/** iso3 -> [year, value][] */
export type SeriesFile = Record<string, [number, number][]>;

export const DOMAIN_LABELS: Record<string, string> = {
  climate: "Climate",
  energy: "Energy",
  water: "Water",
  pollution: "Pollution",
  ice_oceans: "Ice & Oceans",
  land_life: "Land & Life",
};

export function formatValue(value: number, unit: string): string {
  const abs = Math.abs(value);
  const rounded =
    abs >= 1000
      ? Math.round(value).toLocaleString("en-GB")
      : abs >= 10
        ? value.toFixed(1)
        : value.toFixed(2);
  return `${rounded} ${unit}`;
}

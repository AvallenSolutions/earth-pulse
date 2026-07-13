/**
 * Phase 1 metrics registry. Each entry maps one column of an OWID dataset to
 * an Earth Pulse metric. This is the single source of truth: the DB metrics
 * table, the static choropleth files and the UI metric picker are all
 * generated from it.
 */
export type MetricDef = {
  id: string;
  name: string;
  unit: string;
  domain: "climate" | "energy" | "water" | "pollution" | "ice_oceans" | "land_life";
  source: string;
  sourceUrl: string;
  licence: string;
  explainer: string;
  timeResolution: "annual";
  dataset: "co2" | "energy" | { grapherSlug: string };
  column: string;
  /** Sensible colour scale bounds for the choropleth [min, max]. */
  scale: [number, number];
  scaleType: "sequential" | "diverging";
  /** Optional explicit stop values for skewed metrics (one per ramp colour). */
  stops?: number[];
  /** Diverging only: flip so low values are warm (e.g. dry = red). */
  flipDiverging?: boolean;
  /** Derived metrics are computed from another metric during ingest. */
  derived?: { from: string; kind: "anomaly_pct"; baselineYears: [number, number] };
};

export const DATASET_URLS = {
  co2: "https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv",
  energy:
    "https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv",
} as const;

export function grapherUrl(slug: string): string {
  return `https://ourworldindata.org/grapher/${slug}.csv?csvType=full&useColumnShortNames=true`;
}

export const METRICS: MetricDef[] = [
  {
    id: "co2",
    name: "CO2 emissions",
    unit: "Mt CO2/year",
    domain: "climate",
    source: "Global Carbon Budget via Our World in Data",
    sourceUrl: "https://ourworldindata.org/co2-emissions",
    licence: "CC BY 4.0",
    explainer:
      "Carbon dioxide released each year from burning fossil fuels and industry. The main driver of global warming.",
    timeResolution: "annual",
    dataset: "co2",
    column: "co2",
    scale: [0, 12000],
    scaleType: "sequential",
    stops: [0, 50, 150, 400, 1000, 2500, 6000, 12000],
  },
  {
    id: "co2_per_capita",
    name: "CO2 emissions per person",
    unit: "t CO2/person/year",
    domain: "climate",
    source: "Global Carbon Budget via Our World in Data",
    sourceUrl: "https://ourworldindata.org/co2-emissions",
    licence: "CC BY 4.0",
    explainer:
      "Each person's share of their country's yearly CO2 emissions. A fairer way to compare countries of very different sizes.",
    timeResolution: "annual",
    dataset: "co2",
    column: "co2_per_capita",
    scale: [0, 20],
    scaleType: "sequential",
  },
  {
    id: "temperature_anomaly",
    name: "Temperature anomaly",
    unit: "°C vs 1991-2020",
    domain: "climate",
    source: "Copernicus Climate Change Service (ERA5) via Our World in Data",
    sourceUrl: "https://ourworldindata.org/grapher/annual-temperature-anomalies",
    licence: "CC BY 4.0",
    explainer:
      "How much warmer or cooler a country's year was compared with its 1991-2020 average. Watch the map turn red as you move the slider towards today.",
    timeResolution: "annual",
    dataset: { grapherSlug: "annual-temperature-anomalies" },
    column: "temperature_anomaly",
    scale: [-2.5, 2.5],
    scaleType: "diverging",
  },
  {
    id: "renewables_share_energy",
    name: "Renewable energy share",
    unit: "% of primary energy",
    domain: "energy",
    source: "Energy Institute Statistical Review via Our World in Data",
    sourceUrl: "https://ourworldindata.org/renewable-energy",
    licence: "CC BY 4.0",
    explainer:
      "The slice of a country's energy that comes from renewables such as wind, solar and hydro.",
    timeResolution: "annual",
    dataset: "energy",
    column: "renewables_share_energy",
    scale: [0, 60],
    scaleType: "sequential",
  },
  {
    id: "fossil_share_energy",
    name: "Fossil fuel share",
    unit: "% of primary energy",
    domain: "energy",
    source: "Energy Institute Statistical Review via Our World in Data",
    sourceUrl: "https://ourworldindata.org/fossil-fuels",
    licence: "CC BY 4.0",
    explainer:
      "The slice of a country's energy still coming from coal, oil and gas. The number the world is trying to shrink.",
    timeResolution: "annual",
    dataset: "energy",
    column: "fossil_share_energy",
    scale: [40, 100],
    scaleType: "sequential",
  },
  {
    id: "energy_per_capita",
    name: "Energy use per person",
    unit: "kWh/person/year",
    domain: "energy",
    source: "Energy Institute / Ember via Our World in Data",
    sourceUrl: "https://ourworldindata.org/energy-production-consumption",
    licence: "CC BY 4.0",
    explainer:
      "How much energy each person uses in a year, across electricity, transport, heating and industry.",
    timeResolution: "annual",
    dataset: "energy",
    column: "energy_per_capita",
    scale: [0, 100000],
    scaleType: "sequential",
    stops: [0, 3000, 8000, 15000, 25000, 40000, 60000, 100000],
  },
  {
    id: "water_stress",
    name: "Water stress",
    unit: "% of renewable resources withdrawn",
    domain: "water",
    source: "FAO AQUASTAT (SDG 6.4.2) via Our World in Data",
    sourceUrl: "https://ourworldindata.org/water-use-stress",
    licence: "CC BY 4.0",
    explainer:
      "How much of a country's renewable freshwater is withdrawn each year. Above 25% counts as stressed; above 100% means drawing down reserves.",
    timeResolution: "annual",
    dataset: { grapherSlug: "freshwater-withdrawals-as-a-share-of-internal-resources" },
    column: "_6_4_2__er_h2o_stress__no_breakdown",
    scale: [0, 1000],
    scaleType: "sequential",
    stops: [0, 10, 20, 40, 70, 100, 300, 1000],
  },
  {
    id: "water_per_capita",
    name: "Renewable water per person",
    unit: "m³/person/year",
    domain: "water",
    source: "FAO AQUASTAT via Our World in Data",
    sourceUrl: "https://ourworldindata.org/water-use-stress",
    licence: "CC BY 4.0",
    explainer:
      "Each person's share of the country's renewable freshwater. Below 1,700 m³ is water stress; below 1,000 m³ is scarcity.",
    timeResolution: "annual",
    dataset: { grapherSlug: "renewable-water-resources-per-capita" },
    column: "er_h2o_intr_pc",
    scale: [0, 100000],
    scaleType: "sequential",
    stops: [0, 500, 1000, 1700, 5000, 15000, 40000, 100000],
  },
  {
    id: "safe_drinking_water",
    name: "Safely managed drinking water",
    unit: "% of population",
    domain: "water",
    source: "WHO/UNICEF JMP via Our World in Data",
    sourceUrl: "https://ourworldindata.org/water-access",
    licence: "CC BY 4.0",
    explainer:
      "The share of people with safe drinking water at home, available when needed and free from contamination.",
    timeResolution: "annual",
    dataset: { grapherSlug: "proportion-using-safely-managed-drinking-water" },
    column: "wat_sm__residence_total",
    scale: [0, 100],
    scaleType: "sequential",
  },
  {
    id: "precipitation",
    name: "Annual precipitation",
    unit: "mm/year",
    domain: "water",
    source: "Copernicus Climate Change Service (ERA5) via Our World in Data",
    sourceUrl: "https://ourworldindata.org/grapher/average-precipitation-per-year",
    licence: "CC BY 4.0",
    explainer:
      "Total rain and snow that fell over a country in a year, averaged across its land area.",
    timeResolution: "annual",
    dataset: { grapherSlug: "average-precipitation-per-year" },
    column: "total_precipitation",
    scale: [0, 3000],
    scaleType: "sequential",
    stops: [0, 100, 250, 500, 800, 1200, 2000, 3000],
  },
  {
    id: "precip_anomaly",
    name: "Rainfall anomaly",
    unit: "% vs 1961-1990",
    domain: "water",
    source: "Derived from Copernicus ERA5 precipitation via Our World in Data",
    sourceUrl: "https://ourworldindata.org/grapher/average-precipitation-per-year",
    licence: "CC BY 4.0",
    explainer:
      "How much wetter (blue) or drier (red) a country's year was compared with its 1961-1990 average. A simple drought and deluge signal.",
    timeResolution: "annual",
    dataset: { grapherSlug: "average-precipitation-per-year" },
    column: "total_precipitation",
    scale: [-50, 50],
    scaleType: "diverging",
    flipDiverging: true,
    derived: { from: "precipitation", kind: "anomaly_pct", baselineYears: [1961, 1990] },
  },
  {
    id: "pm25",
    name: "Air pollution (PM2.5)",
    unit: "µg/m³ annual mean",
    domain: "pollution",
    source: "World Bank / van Donkelaar et al. via Our World in Data",
    sourceUrl: "https://ourworldindata.org/air-pollution",
    licence: "CC BY 4.0",
    explainer:
      "Average exposure to fine particles small enough to enter the bloodstream. The WHO guideline is 5 µg/m³.",
    timeResolution: "annual",
    dataset: { grapherSlug: "pm25-air-pollution" },
    column: "population_weighted_pm25",
    scale: [0, 80],
    scaleType: "sequential",
  },
];

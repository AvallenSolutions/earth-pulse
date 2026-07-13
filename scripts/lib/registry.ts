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
  /** Named colour ramp (see src/lib/colors.ts); domains get distinct hues. */
  ramp?: string;
  /** Optional explicit stop values for skewed metrics (one per ramp colour). */
  stops?: number[];
  /** Derived metrics are computed from another metric during ingest. */
  derived?: { from: string; kind: "anomaly_pct"; baselineYears: [number, number] };
  /** Ignore data before this year (e.g. sparse long-run historical rows). */
  clampFirstYear?: number;
  /** Global-scale metrics (World/ice sheets only): shown on the planet
   * trends page, hidden from the country map picker. */
  global?: boolean;
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
    ramp: "ember",
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
    ramp: "ember",
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
    ramp: "temp",
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
    ramp: "greens",
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
    ramp: "amber",
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
    ramp: "violet",
    scaleType: "sequential",
    stops: [0, 3000, 8000, 15000, 25000, 40000, 60000, 100000],
  },
  {
    id: "methane",
    name: "Methane emissions",
    unit: "Mt CO2e/year",
    domain: "climate",
    source: "Global Carbon Project / PRIMAP via Our World in Data",
    sourceUrl: "https://ourworldindata.org/greenhouse-gas-emissions",
    licence: "CC BY 4.0",
    explainer:
      "Methane traps around 80 times more heat than CO2 over 20 years. It comes mainly from livestock, rice, landfill and leaky fossil fuel infrastructure.",
    timeResolution: "annual",
    dataset: "co2",
    column: "methane",
    scale: [0, 1500],
    ramp: "ember",
    scaleType: "sequential",
    stops: [0, 5, 15, 40, 100, 250, 600, 1500],
  },
  {
    id: "tree_cover_loss",
    name: "Tree cover loss",
    unit: "ha/year",
    domain: "land_life",
    source: "Global Forest Watch (Hansen/UMD) via Our World in Data",
    sourceUrl: "https://ourworldindata.org/deforestation",
    licence: "CC BY 4.0",
    explainer:
      "Forest area lost each year to fire, logging, farming and storms. Not all loss is permanent deforestation, but the trend matters.",
    timeResolution: "annual",
    dataset: { grapherSlug: "tree-cover-loss" },
    column: "tree_cover_loss_ha__category_total",
    scale: [0, 4000000],
    ramp: "loss",
    scaleType: "sequential",
    stops: [0, 2000, 10000, 50000, 200000, 500000, 1500000, 4000000],
  },
  {
    id: "forest_share",
    name: "Forest area",
    unit: "% of land",
    domain: "land_life",
    source: "FAO via Our World in Data",
    sourceUrl: "https://ourworldindata.org/forest-area",
    licence: "CC BY 4.0",
    explainer:
      "How much of a country's land is covered by forest.",
    timeResolution: "annual",
    dataset: { grapherSlug: "forest-area-as-share-of-land-area" },
    column: "forest_share",
    clampFirstYear: 1990,
    scale: [0, 100],
    ramp: "greens",
    scaleType: "sequential",
  },
  {
    id: "disaster_deaths",
    name: "Deaths from natural disasters",
    unit: "deaths/year",
    domain: "land_life",
    source: "IHME Global Burden of Disease via Our World in Data",
    sourceUrl: "https://ourworldindata.org/natural-disasters",
    licence: "CC BY 4.0",
    explainer:
      "People killed by floods, storms, droughts, heatwaves, earthquakes and other disasters each year. Single events dominate single years.",
    timeResolution: "annual",
    dataset: { grapherSlug: "deaths-from-natural-disasters" },
    column: "death_count__age_group_allages__sex_both_sexes__cause_natural_disasters",
    scale: [0, 300000],
    ramp: "reds",
    scaleType: "sequential",
    stops: [0, 1, 10, 50, 250, 2000, 20000, 300000],
  },
  {
    id: "sea_level",
    name: "Global sea level",
    unit: "mm vs 1993-2008 average",
    domain: "ice_oceans",
    source: "Church & White / UHSLC via Our World in Data",
    sourceUrl: "https://ourworldindata.org/grapher/sea-level",
    licence: "CC BY 4.0",
    explainer:
      "The global average sea surface height. It rises as warming water expands and land ice melts into the ocean.",
    timeResolution: "annual",
    dataset: { grapherSlug: "sea-level" },
    column: "sea_level_average",
    scale: [0, 1],
    scaleType: "sequential",
    global: true,
  },
  {
    id: "ocean_heat",
    name: "Ocean heat content (top 2000m)",
    unit: "10²² joules",
    domain: "ice_oceans",
    source: "NOAA NCEI via Our World in Data",
    sourceUrl: "https://ourworldindata.org/grapher/ocean-heat-top-2000m",
    licence: "CC BY 4.0",
    explainer:
      "Over 90% of the extra heat trapped by greenhouse gases ends up in the ocean. This is the planet's clearest warming signal.",
    timeResolution: "annual",
    dataset: { grapherSlug: "ocean-heat-top-2000m" },
    column: "ocean_heat_content_noaa_2000m",
    scale: [0, 1],
    scaleType: "sequential",
    global: true,
  },
  {
    id: "ice_sheets",
    name: "Ice sheet mass change",
    unit: "Gt vs 2002",
    domain: "ice_oceans",
    source: "NASA GRACE via Our World in Data",
    sourceUrl: "https://ourworldindata.org/grapher/ice-sheet-mass-balance",
    licence: "CC BY 4.0",
    explainer:
      "How much ice Greenland and Antarctica have lost since 2002, measured from space by tracking tiny changes in Earth's gravity.",
    timeResolution: "annual",
    dataset: { grapherSlug: "ice-sheet-mass-balance" },
    column: "land_ice_mass_nasa",
    scale: [0, 1],
    scaleType: "sequential",
    global: true,
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
    ramp: "teal",
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
    ramp: "teal",
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
    ramp: "teal",
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
    ramp: "blues",
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
      "How much wetter (teal) or drier (brown) a country's year was compared with its 1961-1990 average. A simple drought and deluge signal.",
    timeResolution: "annual",
    dataset: { grapherSlug: "average-precipitation-per-year" },
    column: "total_precipitation",
    scale: [-50, 50],
    scaleType: "diverging",
    ramp: "rain",
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

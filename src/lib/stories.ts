export type ScenarioId = "ssp126" | "ssp245" | "ssp585";

export type StoryStep = {
  camera?: { center: [number, number]; zoom: number; duration?: number };
  metric?: string;
  year: number;
  scenario?: ScenarioId;
  layers?: { storms?: boolean; quakeHist?: boolean; earthAtNight?: boolean };
  caption: string;
  holdMs: number;
};

export type Story = {
  id: string;
  title: string;
  tagline: string;
  steps: StoryStep[];
};

export const STORIES: Story[] = [
  {
    id: "co2",
    title: "CO2 since 1750",
    tagline: "How we warmed the planet",
    steps: [
      {
        camera: { center: [-2, 53], zoom: 3.8 },
        metric: "co2_per_capita",
        year: 1750,
        caption:
          "In 1750, the Industrial Revolution is stirring in Britain. Atmospheric CO2 sits at 280 ppm, where it had been for 10,000 years.",
        holdMs: 5500,
      },
      {
        camera: { center: [-3, 51.5], zoom: 4.2 },
        year: 1850,
        caption:
          "By 1850, Britain's coal furnaces are burning day and night. The first country to industrialise also becomes the first to leave a carbon footprint on the planet.",
        holdMs: 5000,
      },
      {
        camera: { center: [-95, 39], zoom: 3 },
        year: 1900,
        caption:
          "By 1900, the United States has taken the lead. Vast steel mills and railroads criss-cross a continent, powered by coal.",
        holdMs: 5000,
      },
      {
        camera: { center: [10, 50], zoom: 2.5 },
        year: 1960,
        caption:
          "Post-war prosperity lifts emissions across the western world. Car ownership explodes. Oil replaces coal as the fuel of growth.",
        holdMs: 5000,
      },
      {
        camera: { center: [10, 20], zoom: 2 },
        year: 2000,
        caption:
          "By 2000 the world emits five times as much CO2 as in 1900. The scientific consensus on climate change is already two decades old.",
        holdMs: 5000,
      },
      {
        camera: { center: [104, 35], zoom: 3.2 },
        year: 2022,
        caption:
          "Today, manufacturing has shifted east. China is now the world's largest total emitter — though its per-person figure still trails the United States.",
        holdMs: 6000,
      },
    ],
  },
  {
    id: "storms",
    title: "A century of storms",
    tagline: "The world's most destructive cyclones",
    steps: [
      {
        camera: { center: [-80, 25], zoom: 3.2 },
        metric: "co2_per_capita",
        year: 1992,
        layers: { storms: true },
        caption:
          "1992: Hurricane Andrew makes landfall in Florida as a Category 5. For 25 years it holds the record as the costliest US hurricane in history.",
        holdMs: 5500,
      },
      {
        camera: { center: [-65, 22], zoom: 2.8 },
        year: 2005,
        caption:
          "2005: The most active Atlantic hurricane season on record. Twenty-eight named storms — including Katrina, which devastates New Orleans.",
        holdMs: 5000,
      },
      {
        camera: { center: [125, 11.5], zoom: 4 },
        year: 2013,
        caption:
          "2013: Super Typhoon Haiyan strikes the Philippines with 315 km/h winds — the strongest landfalling tropical cyclone ever recorded.",
        holdMs: 5000,
      },
      {
        camera: { center: [-72, 21], zoom: 3 },
        year: 2017,
        caption:
          "2017: Irma, Maria, Harvey. Three Category 4+ storms hit the Americas in six weeks, causing over $250 billion in damage.",
        holdMs: 5000,
      },
      {
        camera: { center: [10, 20], zoom: 2 },
        year: 2024,
        caption:
          "Warmer oceans fuel rapid intensification. Today's storms are growing stronger faster than at any time in the modern record.",
        holdMs: 6000,
      },
    ],
  },
  {
    id: "futures",
    title: "Three futures",
    tagline: "How temperature projections diverge to 2100",
    steps: [
      {
        camera: { center: [10, 20], zoom: 2 },
        metric: "temperature_anomaly",
        year: 2024,
        scenario: "ssp245",
        caption:
          "We are already 1.2°C warmer than pre-industrial levels. The path we take this decade determines what comes next.",
        holdMs: 5500,
      },
      {
        camera: { center: [10, 20], zoom: 2 },
        year: 2050,
        scenario: "ssp126",
        caption:
          "Low emissions path (SSP1-2.6): rapid decarbonisation limits warming to around 1.5–2°C. Possible, but it requires transformative global action starting now.",
        holdMs: 5000,
      },
      {
        camera: { center: [10, 20], zoom: 2 },
        year: 2050,
        scenario: "ssp245",
        caption:
          "Middle road (SSP2-4.5): current policies project around 2–2.5°C by mid-century. Some adaptation is required; some damage is already locked in.",
        holdMs: 5000,
      },
      {
        camera: { center: [10, 20], zoom: 2 },
        year: 2050,
        scenario: "ssp585",
        caption:
          "High emissions path (SSP5-8.5): if fossil fuel use accelerates, the world exceeds 2.5°C by 2050 and heads towards 4–5°C by 2100.",
        holdMs: 5000,
      },
      {
        camera: { center: [10, 65], zoom: 2.2 },
        year: 2100,
        scenario: "ssp585",
        caption:
          "In the high scenario, the Arctic becomes ice-free in summer. Permafrost thaw releases stored carbon, pushing warming further still.",
        holdMs: 5500,
      },
      {
        camera: { center: [10, 20], zoom: 2 },
        year: 2100,
        scenario: "ssp126",
        caption:
          "Every fraction of a degree matters. The choices made this decade will shape the climate for centuries. The story is still being written.",
        holdMs: 6500,
      },
    ],
  },
  {
    id: "night",
    title: "The vanishing night",
    tagline: "How artificial light is erasing the stars",
    steps: [
      {
        camera: { center: [-74, 40], zoom: 3.4 },
        year: 2024,
        layers: { earthAtNight: true },
        caption:
          "This is Earth after dark. The east coast of the United States burns so brightly that most people living here have never seen the Milky Way.",
        holdMs: 6000,
      },
      {
        camera: { center: [31, 30], zoom: 4.2 },
        year: 2024,
        caption:
          "The Nile delta, drawn in light. Nearly everyone on this river lives within sight of its glow; the desert either side stays dark.",
        holdMs: 5500,
      },
      {
        camera: { center: [127.5, 38.5], zoom: 4.5 },
        year: 2024,
        caption:
          "The Korean peninsula at night: the South blazes, the North is almost black. Light maps wealth and politics as clearly as any border.",
        holdMs: 5500,
      },
      {
        camera: { center: [17, -23], zoom: 3.6 },
        year: 2024,
        caption:
          "Namibia is one of the darkest places left on Earth. Skies like this, where the Milky Way casts a shadow, were everyone's a century ago.",
        holdMs: 5500,
      },
      {
        camera: { center: [10, 30], zoom: 2 },
        year: 2024,
        caption:
          "Skyglow is rising by around 10 percent a year, faster than satellites once suggested. Click any city and choose 'See this sky' to watch what that means for the stars above it.",
        holdMs: 7000,
      },
    ],
  },
];

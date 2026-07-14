"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { NO_DATA, scaleStops, rampColours, accentFor } from "@/lib/colors";
import { DOMAIN_LABELS, formatValue, type Country, type Metric, type SeriesFile } from "@/lib/types";
import type { Vitals } from "@/lib/vitals";
import { Sparkline } from "./Sparkline";
import { CountrySearch } from "./CountrySearch";
import { VitalsStrip } from "./VitalsStrip";
import { VitalsModal } from "./VitalsModal";
import { EventTicker, type TickerItem } from "./EventTicker";
import { Panel } from "./Panel";
import { MoversPanel } from "./MoversPanel";
import { EventPopup, type MapEvent } from "./EventPopup";
import { Starfield } from "./Starfield";
import { StoryPlayer } from "./StoryPlayer";
import { STORIES, type Story } from "@/lib/stories";

/** Latest full GIBS imagery day (UTC yesterday). */
function latestImageryDate(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

/** Storm track colours by category: 0 TD/unknown, 1 TS, 2-6 = Cat 1-5 */
const STORM_CATS = {
  colours: ["#7d8a97", "#4eb3d3", "#fed976", "#fb9a3c", "#f0502a", "#e01515", "#c9184a"],
  labels: ["TD", "TS", "Cat 1", "Cat 2", "Cat 3", "Cat 4", "Cat 5"],
};

const stormsCache = new Map<number, StormYear>();
const quakeHistCache = new Map<number, { quakes: QuakeRec[] }>();
const disHistCache = new Map<number, { events: DisasterRec[] }>();
type QuakeRec = { lon: number; lat: number; mag: number; depth: number; place: string; time: number; url: string };
type DisasterRec = { lon: number; lat: number; type: string; level: string; name: string; country: string; severity: string; from: string; to: string; eventid: number };
type StormYear = {
  storms: { id: string; name: string; cat: number; maxWind: number; points: [number, number, number][] }[];
};

const AIR_BREAKS = {
  colours: ["#0ca30c", "#fab219", "#ec835a", "#d03b3b"],
  values: [10, 25, 50],
  labels: ["under 10", "10-25", "25-50", "over 50"],
};

type Hover = {
  iso3: string;
  name: string;
  value: number | null;
  left: number;
  top: number;
};

/** Metrics with published scenario projections (CMIP6 via World Bank CCKP). */
const PROJECTIONS: Record<string, { firstYear: number; lastYear: number }> = {
  temperature_anomaly: { firstYear: 2026, lastYear: 2100 },
  precipitation: { firstYear: 2026, lastYear: 2100 },
};
const SCENARIOS = [
  { id: "ssp126", label: "Low", detail: "SSP1-2.6", colour: "#199e70" },
  { id: "ssp245", label: "Middle", detail: "SSP2-4.5", colour: "#e0a355" },
  { id: "ssp585", label: "High", detail: "SSP5-8.5", colour: "#e66767" },
] as const;
type ScenarioId = (typeof SCENARIOS)[number]["id"];

/** "14:05" in the viewer's local time */
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** "today", "yesterday" or "N days ago" */
function daysAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type MonthlyInfo = { firstYear: number; lastYear: number; unit: string };

const choroplethCache = new Map<string, Record<string, number>>();
const seriesCache = new Map<string, SeriesFile>();
const monthlyCache = new Map<string, Record<string, (number | null)[]>>();
const monthlyIndexCache = new Map<string, MonthlyInfo | null>();

async function fetchMonthly(metric: string, year: number) {
  const key = `${metric}/${year}`;
  if (!monthlyCache.has(key)) {
    const res = await fetch(`/data/monthly/${metric}/${year}.json`);
    monthlyCache.set(key, res.ok ? await res.json() : {});
  }
  return monthlyCache.get(key)!;
}

async function fetchMonthlyIndex(metric: string): Promise<MonthlyInfo | null> {
  if (!monthlyIndexCache.has(metric)) {
    const res = await fetch(`/data/monthly/${metric}/index.json`);
    monthlyIndexCache.set(metric, res.ok ? await res.json() : null);
  }
  return monthlyIndexCache.get(metric)!;
}

async function fetchChoropleth(
  metric: string,
  year: number,
  scenario?: ScenarioId
) {
  const key = scenario ? `${metric}/${scenario}/${year}` : `${metric}/${year}`;
  if (!choroplethCache.has(key)) {
    const url = scenario
      ? `/data/projections/${metric}/${scenario}/${year}.json`
      : `/data/choropleth/${metric}/${year}.json`;
    const res = await fetch(url);
    choroplethCache.set(key, res.ok ? await res.json() : {});
  }
  return choroplethCache.get(key)!;
}

async function fetchSeries(metric: string) {
  if (!seriesCache.has(metric)) {
    const res = await fetch(`/data/series/${metric}.json`);
    seriesCache.set(metric, res.ok ? await res.json() : {});
  }
  return seriesCache.get(metric)!;
}

export function MapExplorer({
  metrics,
  countries,
  vitals,
  initialMetric,
  initialYear,
  initialView,
  initialScenario,
  initialStory,
  dataUpdated,
}: {
  metrics: Metric[];
  countries: Country[];
  vitals: Vitals;
  initialMetric?: string;
  initialYear?: number;
  initialView?: string;
  initialScenario?: string;
  initialStory?: string;
  /** ISO date of the last historical-data refresh (freshness.json) */
  dataUpdated?: string;
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [metricId, setMetricId] = useState(
    metrics.some((m) => m.id === initialMetric) ? initialMetric! : metrics[0].id
  );
  const metric = metrics.find((m) => m.id === metricId)!;
  const [year, setYear] = useState(() => {
    const projLast =
      PROJECTIONS[metric.id]?.lastYear ?? metric.lastYear;
    return initialYear
      ? Math.min(Math.max(initialYear, metric.firstYear), projLast)
      : metric.lastYear;
  });
  const [globeOn, setGlobeOn] = useState(initialView !== "flat");
  const [scenario, setScenario] = useState<ScenarioId>(
    SCENARIOS.some((sc) => sc.id === initialScenario)
      ? (initialScenario as ScenarioId)
      : "ssp245"
  );
  const [playing, setPlaying] = useState(false);
  const [monthlyInfo, setMonthlyInfo] = useState<MonthlyInfo | null>(null);
  const [monthMode, setMonthMode] = useState(false);
  const [month, setMonth] = useState(6);
  const yearRef = useRef(0);
  const [hover, setHover] = useState<Hover | null>(null);
  const [popup, setPopup] = useState<
    { event: MapEvent; left: number; top: number } | null
  >(null);
  const [series, setSeries] = useState<SeriesFile>({});
  const valuesRef = useRef<Record<string, number>>({});
  const paintedIso = useRef<Set<string>>(new Set());
  const [satOn, setSatOn] = useState(false);
  const [satDate, setSatDate] = useState(latestImageryDate);
  const [firesOn, setFiresOn] = useState(false);
  const [floodsOn, setFloodsOn] = useState(false);
  const [airOn, setAirOn] = useState(false);
  const [quakesOn, setQuakesOn] = useState(false);
  const [disastersOn, setDisastersOn] = useState(false);
  const [hurricanesOn, setHurricanesOn] = useState(false);
  const [volcanoesOn, setVolcanoesOn] = useState(false);
  const [auroraOn, setAuroraOn] = useState(false);
  const [hurricaneCount, setHurricaneCount] = useState<number | null>(null);
  const [stormsOn, setStormsOn] = useState(false);
  const [stormCats, setStormCats] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const stormCatsRef = useRef(stormCats);
  const [quakeHistOn, setQuakeHistOn] = useState(false);
  const [disHistOn, setDisHistOn] = useState(false);
  const [ticker, setTicker] = useState<TickerItem[]>([]);
  const [liveAsOf, setLiveAsOf] = useState<string | null>(null);
  const [vitalsModal, setVitalsModal] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [airStatus, setAirStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  // Story mode
  const [activeStory, setActiveStory] = useState<Story | null>(
    () => STORIES.find((s) => s.id === initialStory) ?? null
  );
  const [storyStep, setStoryStep] = useState(0);
  const [storyPlaying, setStoryPlaying] = useState(false);

  // Animation refs (rAF handles for cleanup)
  const stormFadeRef = useRef(0);
  const pulseRef = useRef(0);

  // Init map once
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        projection: { type: "globe" },
        // Space fades into a thin blue atmosphere around the globe
        sky: {
          "sky-color": "#04060c",
          "horizon-color": "#274a80",
          "fog-color": "#0a1420",
          "sky-horizon-blend": 0.6,
          "horizon-fog-blend": 0.6,
          "fog-ground-blend": 0.85,
          "atmosphere-blend": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0, 1,
            5, 1,
            7, 0,
          ],
        },
        sources: {},
        layers: [
          // Deep ocean navy; the page behind stays near-black
          { id: "bg", type: "background", paint: { "background-color": "#0a1420" } },
        ],
      },
      center: [10, 18],
      zoom: 1.9,
      minZoom: 1,
      maxZoom: 7,
      attributionControl: false,
      dragRotate: false,
    });
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution:
          'Boundaries: <a href="https://www.naturalearthdata.com">Natural Earth</a>',
      })
    );
    map.touchZoomRotate.disableRotation();

    map.on("error", (e) => console.error("[map error]", e.error?.message ?? e));
    map.on("load", async () => {
      // NASA Blue Marble shaded relief + bathymetry: the terrain the data
      // sits on. Keyless, static, cached hard by GIBS.
      map.addSource("bluemarble", {
        type: "raster",
        tiles: [
          "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg",
        ],
        tileSize: 256,
        maxzoom: 8,
        attribution:
          'Terrain: <a href="https://earthdata.nasa.gov/gibs">NASA Blue Marble</a>',
      });
      map.addLayer({
        id: "bluemarble",
        type: "raster",
        source: "bluemarble",
        paint: { "raster-opacity": 1, "raster-saturation": -0.25, "raster-brightness-max": 0.85 },
      });
      const world = await (await fetch("/data/world.geo.json")).json();
      map.addSource("countries", {
        type: "geojson",
        data: world,
        promoteId: "iso3",
      });
      map.addLayer({
        id: "country-fills",
        type: "fill",
        source: "countries",
        paint: { "fill-color": NO_DATA, "fill-opacity": 0.75 },
      });
      map.addLayer({
        id: "country-borders",
        type: "line",
        source: "countries",
        paint: { "line-color": "rgba(5, 10, 18, 0.65)", "line-width": 0.75 },
      });
      // Soft glow beneath the crisp hover outline
      map.addLayer({
        id: "country-hover-glow",
        type: "line",
        source: "countries",
        paint: {
          "line-color": "#ffffff",
          "line-blur": 6,
          "line-width": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            6,
            0,
          ],
          "line-opacity": 0.45,
        },
      });
      map.addLayer({
        id: "country-hover",
        type: "line",
        source: "countries",
        paint: {
          "line-color": "#ffffff",
          "line-width": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            1.5,
            0,
          ],
        },
      });
      setMapReady(true);
    });

    let hoveredIso: string | null = null;
    map.on("mousemove", "country-fills", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const iso3 = f.properties.iso3 as string;
      if (hoveredIso && hoveredIso !== iso3)
        map.setFeatureState({ source: "countries", id: hoveredIso }, { hover: false });
      map.setFeatureState({ source: "countries", id: iso3 }, { hover: true });
      hoveredIso = iso3;
      map.getCanvas().style.cursor = "pointer";
      const value = valuesRef.current[iso3];
      setHover({
        iso3,
        name: f.properties.name as string,
        value: value ?? null,
        left: Math.min(e.point.x + 14, map.getCanvas().clientWidth - 240),
        top: Math.max(e.point.y - 10, 8),
      });
    });
    map.on("mouseleave", "country-fills", () => {
      if (hoveredIso)
        map.setFeatureState({ source: "countries", id: hoveredIso }, { hover: false });
      hoveredIso = null;
      map.getCanvas().style.cursor = "";
      setHover(null);
    });
    const popupAt = (e: maplibregl.MapMouseEvent, event: MapEvent) => {
      const w = map.getCanvas().clientWidth;
      const h = map.getCanvas().clientHeight;
      setPopup({
        event,
        left: Math.min(e.point.x + 12, w - 300),
        top: Math.min(Math.max(e.point.y - 10, 8), h - 240),
      });
    };
    for (const layerId of ["quakes", "quakehist"]) map.on("click", layerId, (e) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      popupAt(e, {
        kind: "quake",
        mag: Number(p.mag),
        depth: Number(p.depth),
        place: String(p.place ?? ""),
        time: Number(p.time),
        url: String(p.url ?? ""),
      });
    });
    for (const layerId of ["disasters", "dishist"]) map.on("click", layerId, (e) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      popupAt(e, {
        kind: "disaster",
        type: String(p.type),
        level: String(p.level),
        name: String(p.name ?? ""),
        country: String(p.country ?? ""),
        severity: String(p.severity ?? ""),
        from: String(p.from ?? ""),
        to: String(p.to ?? ""),
        eventid: Number(p.eventid),
      });
    });
    map.on("click", "storms", (e) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      popupAt(e, {
        kind: "storm",
        name: String(p.name),
        cat: Number(p.cat),
        maxWind: Number(p.maxWind),
        year: Number(p.year),
      });
    });
    map.on("click", "hurricanes", (e) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      popupAt(e, {
        kind: "hurricane",
        name: String(p.name),
        classification: String(p.classification),
        intensity: Number(p.intensity),
        pressure: Number(p.pressure),
        movementDir: p.movementDir === null || p.movementDir === undefined ? null : Number(p.movementDir),
        movementSpeed: p.movementSpeed === null || p.movementSpeed === undefined ? null : Number(p.movementSpeed),
        lastUpdate: String(p.lastUpdate ?? ""),
        url: String(p.url ?? ""),
      });
    });
    map.on("click", "volcanoes", (e) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      popupAt(e, {
        kind: "volcano",
        name: String(p.name),
        vei: p.vei === null || p.vei === undefined ? null : Number(p.vei),
        start: String(p.start ?? ""),
        end: p.end === null || p.end === undefined ? null : String(p.end),
        ongoing: Boolean(p.ongoing),
        number: Number(p.number),
      });
    });
    for (const layer of ["quakes", "disasters", "storms", "quakehist", "dishist", "hurricanes", "volcanoes"]) {
      map.on("mouseenter", layer, () => {
        map.getCanvas().style.cursor = "pointer";
      });
    }
    map.on("click", "country-fills", (e) => {
      // event dots sit above countries; don't navigate through them
      const hits = map
        .queryRenderedFeatures(e.point, {
          layers: ["quakes", "disasters", "storms", "quakehist", "dishist", "hurricanes", "volcanoes"].filter((l) => map.getLayer(l)),
        })
        .length;
      if (hits > 0) return;
      const iso3 = e.features?.[0]?.properties.iso3;
      if (iso3) window.location.href = `/country/${iso3}`;
    });

    mapRef.current = map;
    if (process.env.NODE_ENV === "development")
      (window as unknown as { __map?: maplibregl.Map }).__map = map;

    // On iOS/iPadOS, switching away and back can leave the WebGL canvas black.
    // Triggering a repaint on visibility restore recovers it without a full reload.
    const onVisible = () => { if (!document.hidden) map.triggerRepaint(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Load the metric's series for sparklines
  useEffect(() => {
    let alive = true;
    fetchSeries(metric.id).then((s) => alive && setSeries(s));
    return () => {
      alive = false;
    };
  }, [metric]);

  useEffect(() => {
    yearRef.current = year;
  }, [year]);

  // Does this metric have a monthly-resolution dataset? (self-discovering:
  // the ingest writes an index.json; a 404 simply means annual only)
  useEffect(() => {
    let alive = true;
    fetchMonthlyIndex(metric.id).then((info) => {
      if (!alive) return;
      setMonthlyInfo(info);
      if (!info) setMonthMode(false);
    });
    return () => {
      alive = false;
    };
  }, [metric]);

  // Paint the choropleth whenever metric/year changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    let alive = true;
    const isProjected = !!PROJECTIONS[metric.id] && year > metric.lastYear;
    const inMonthMode =
      monthMode &&
      !!monthlyInfo &&
      year >= monthlyInfo.firstYear &&
      year <= monthlyInfo.lastYear;
    (async () => {
      let values: Record<string, number>;
      if (inMonthMode) {
        const monthly = await fetchMonthly(metric.id, year);
        values = {};
        for (const [iso3, arr] of Object.entries(monthly)) {
          const v = arr[month];
          if (v !== null && v !== undefined) values[iso3] = v;
        }
      } else {
        values = await fetchChoropleth(
          metric.id,
          year,
          isProjected ? scenario : undefined
        );
      }
      if (!alive) return;
      valuesRef.current = values;
      const painted = paintedIso.current;
      for (const iso3 of painted)
        if (!(iso3 in values))
          map.setFeatureState({ source: "countries", id: iso3 }, { value: null });
      painted.clear();
      for (const [iso3, value] of Object.entries(values)) {
        map.setFeatureState({ source: "countries", id: iso3 }, { value });
        painted.add(iso3);
      }
      map.setPaintProperty("country-fills", "fill-color", [
        "case",
        ["==", ["feature-state", "value"], null],
        NO_DATA,
        [
          "interpolate",
          ["linear"],
          ["feature-state", "value"],
          ...scaleStops(metric.scaleType, metric.scale, metric.stops, metric.ramp),
        ],
      ]);
      // keep the tooltip's value in sync if a country is hovered
      setHover((h) => (h ? { ...h, value: values[h.iso3] ?? null } : h));
    })();
    return () => {
      alive = false;
    };
  }, [metric, year, scenario, mapReady, monthMode, month, monthlyInfo]);

  // Satellite imagery layer (NASA GIBS, keyless). Sits beneath the country
  // fills; the choropleth hides while imagery is on but hover/click stay live.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.getLayer("gibs")) map.removeLayer("gibs");
    if (map.getSource("gibs")) map.removeSource("gibs");
    if (satOn) {
      map.addSource("gibs", {
        type: "raster",
        tiles: [
          `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${satDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
        ],
        tileSize: 256,
        maxzoom: 9,
        attribution:
          'Imagery: <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a>',
      });
      map.addLayer(
        { id: "gibs", type: "raster", source: "gibs", paint: { "raster-opacity": 1 } },
        "country-fills"
      );
    }
    map.setPaintProperty("country-fills", "fill-opacity", satOn ? 0 : 0.75);
    map.setPaintProperty(
      "country-borders",
      "line-color",
      satOn ? "rgba(255,255,255,0.25)" : "rgba(5, 10, 18, 0.65)"
    );
  }, [satOn, satDate, mapReady]);

  // Globe <-> flat projection
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setProjection({ type: globeOn ? "globe" : "mercator" });
  }, [globeOn, mapReady]);

  // Keep the URL shareable: /?metric=...&year=...&view=...&story=...
  useEffect(() => {
    const params = new URLSearchParams({
      metric: metricId,
      year: String(year),
      view: globeOn ? "globe" : "flat",
    });
    if (PROJECTIONS[metricId] && year > (metrics.find((m) => m.id === metricId)?.lastYear ?? Infinity))
      params.set("scenario", scenario);
    if (activeStory) params.set("story", activeStory.id);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [metricId, year, globeOn, scenario, metrics, activeStory]);

  // Drive map state from the current story step (metric, year, scenario, camera, layers)
  useEffect(() => {
    if (!activeStory || !mapReady) return;
    const s = activeStory.steps[storyStep];
    const map = mapRef.current;
    if (s.metric) setMetricId(s.metric);
    setYear(s.year);
    if (s.scenario) setScenario(s.scenario);
    if (s.layers?.storms !== undefined) setStormsOn(s.layers.storms);
    if (s.layers?.quakeHist !== undefined) setQuakeHistOn(s.layers.quakeHist);
    if (s.camera && map) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        map.jumpTo({ center: s.camera.center, zoom: s.camera.zoom });
      } else {
        map.flyTo({
          center: s.camera.center,
          zoom: s.camera.zoom,
          duration: s.camera.duration ?? 2200,
          essential: true,
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStory, storyStep, mapReady]);

  // Auto-advance story steps when playing
  useEffect(() => {
    if (!storyPlaying || !activeStory) return;
    const s = activeStory.steps[storyStep];
    const t = setTimeout(() => {
      if (storyStep >= activeStory.steps.length - 1) {
        setStoryPlaying(false);
      } else {
        setStoryStep((i) => i + 1);
      }
    }, s.holdMs);
    return () => clearTimeout(t);
  }, [storyPlaying, activeStory, storyStep]);

  // Active fires layer (NASA FIRMS via our proxy so the key stays server-side)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.getLayer("fires")) map.removeLayer("fires");
    if (map.getSource("fires")) map.removeSource("fires");
    if (firesOn) {
      map.addSource("fires", {
        type: "raster",
        tiles: ["/api/fires?bbox={bbox-epsg-3857}"],
        tileSize: 256,
        attribution:
          'Fires: <a href="https://firms.modaps.eosdis.nasa.gov">NASA FIRMS</a>',
      });
      map.addLayer({ id: "fires", type: "raster", source: "fires" });
    }
  }, [firesOn, mapReady]);

  // Fires raster glow-breathing: subtle opacity pulse while the fires layer is active
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !firesOn) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const breathe = (t: number) => {
      if (!document.hidden && map.getLayer("fires")) {
        map.setPaintProperty("fires", "raster-opacity", 0.82 + 0.18 * Math.sin(t * 0.0007));
      }
      raf = requestAnimationFrame(breathe);
    };
    raf = requestAnimationFrame(breathe);
    return () => {
      cancelAnimationFrame(raf);
      if (map.getLayer("fires")) map.setPaintProperty("fires", "raster-opacity", 1);
    };
  }, [firesOn, mapReady]);

  // River flood alerts (Copernicus GloFAS days 1-15 summary, via our proxy)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.getLayer("floods")) map.removeLayer("floods");
    if (map.getSource("floods")) map.removeSource("floods");
    if (floodsOn) {
      map.addSource("floods", {
        type: "raster",
        tiles: ["/api/floods?bbox={bbox-epsg-3857}"],
        tileSize: 256,
        attribution:
          'Floods: <a href="https://global-flood.emergency.copernicus.eu">Copernicus GloFAS</a>',
      });
      map.addLayer({ id: "floods", type: "raster", source: "floods" });
    }
  }, [floodsOn, mapReady]);

  // Earthquakes in the last 24h (USGS). Polls every 2 minutes while the
  // layer is on, so an open tab keeps up with the planet.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    let alive = true;
    if (!quakesOn) {
      if (map.getLayer("quakes")) map.removeLayer("quakes");
      if (map.getSource("quakes")) map.removeSource("quakes");
      return;
    }
    const load = async () => {
      try {
        const res = await fetch("/api/quakes");
        if (!res.ok) throw new Error(String(res.status));
        const { quakes } = (await res.json()) as {
          quakes: {
            lon: number; lat: number; mag: number; depth: number;
            place: string; time: number; url: string;
          }[];
        };
        if (!alive || !mapRef.current) return;
        const geojson = {
          type: "FeatureCollection" as const,
          features: quakes.map((q) => ({
            type: "Feature" as const,
            properties: q,
            geometry: { type: "Point" as const, coordinates: [q.lon, q.lat] },
          })),
        };
        const src = map.getSource("quakes") as maplibregl.GeoJSONSource | undefined;
        if (src) {
          src.setData(geojson);
          return;
        }
        map.addSource("quakes", {
          type: "geojson",
          data: geojson,
          attribution: 'Quakes: <a href="https://earthquake.usgs.gov">USGS</a>',
        });
        map.addLayer({
          id: "quakes",
          type: "circle",
          source: "quakes",
          paint: {
            "circle-radius": [
              "interpolate", ["linear"], ["get", "mag"],
              1, 1.5, 3, 3, 5, 8, 7, 16,
            ],
            "circle-color": [
              "step", ["get", "mag"],
              "#fed976", 3, "#fb9a3c", 4.5, "#f0502a", 6, "#e01515",
            ],
            "circle-opacity": 0.85,
            "circle-stroke-color": "#0d0d0d",
            "circle-stroke-width": 0.5,
          },
        });
      } catch (e) {
        console.error("[quakes layer]", e);
      }
    };
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 120_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [quakesOn, mapReady]);

  // Live disaster alerts (GDACS: cyclones, floods, droughts, volcanoes)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    let alive = true;
    if (!disastersOn) {
      if (map.getLayer("disasters")) map.removeLayer("disasters");
      if (map.getSource("disasters")) map.removeSource("disasters");
      return;
    }
    const load = async () => {
      try {
        const res = await fetch("/api/disasters");
        if (!res.ok) throw new Error(String(res.status));
        const { events } = (await res.json()) as {
          events: {
            lon: number; lat: number; type: string; level: string;
            name: string; country: string; severity: string;
            from: string; to: string; eventid: number;
          }[];
        };
        if (!alive || !mapRef.current) return;
        const geojson = {
          type: "FeatureCollection" as const,
          features: events.map((ev) => ({
            type: "Feature" as const,
            properties: ev,
            geometry: { type: "Point" as const, coordinates: [ev.lon, ev.lat] },
          })),
        };
        const src = map.getSource("disasters") as maplibregl.GeoJSONSource | undefined;
        if (src) {
          src.setData(geojson);
          return;
        }
        map.addSource("disasters", {
          type: "geojson",
          data: geojson,
          attribution: 'Alerts: <a href="https://www.gdacs.org">GDACS</a>',
        });
        map.addLayer({
          id: "disasters",
          type: "circle",
          source: "disasters",
          paint: {
            "circle-radius": [
              "match", ["get", "level"],
              "Red", 8, "Orange", 5.5, 3.5,
            ],
            "circle-color": [
              "match", ["get", "type"],
              "TC", "#9085e9",
              "FL", "#3987e5",
              "DR", "#e0a355",
              "VO", "#e34948",
              "WF", "#ee6a30",
              "#a6a6a6",
            ],
            "circle-opacity": 0.9,
            "circle-stroke-color": [
              "match", ["get", "level"],
              "Red", "#ffffff", "#0d0d0d",
            ],
            "circle-stroke-width": [
              "match", ["get", "level"],
              "Red", 1.5, 0.5,
            ],
          },
        });
      } catch {
        /* feed unavailable */
      }
    };
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 600_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [disastersOn, mapReady]);

  // Historical storm tracks (IBTrACS): follows the year slider, so playing
  // the timeline replays each season's cyclones. The 4D layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    let alive = true;
    if (!stormsOn) {
      if (map.getLayer("storms")) map.removeLayer("storms");
      if (map.getSource("storms")) map.removeSource("storms");
      return;
    }
    (async () => {
      try {
        if (!stormsCache.has(year)) {
          const res = await fetch(`/data/storms/${year}.json`);
          if (res.ok) stormsCache.set(year, await res.json());
          else if (res.status === 404) stormsCache.set(year, { storms: [] });
          else return; // transient failure: retry next toggle/scrub
        }
        const { storms } = stormsCache.get(year)!;
        if (!alive || !mapRef.current) return;
        const geojson = {
          type: "FeatureCollection" as const,
          features: storms.map((st) => ({
            type: "Feature" as const,
            properties: {
              name: st.name,
              cat: st.cat,
              maxWind: st.maxWind,
              year,
            },
            geometry: {
              type: "LineString" as const,
              coordinates: st.points.map(([lon, lat]) => [lon, lat]),
            },
          })),
        };
        const src = map.getSource("storms") as maplibregl.GeoJSONSource | undefined;
        if (src) {
          src.setData(geojson);
        } else {
          map.addSource("storms", {
            type: "geojson",
            data: geojson,
            attribution: 'Storms: <a href="https://www.ncei.noaa.gov/products/international-best-track-archive">NOAA IBTrACS</a>',
          });
          map.addLayer({
            id: "storms",
            type: "line",
            source: "storms",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": [
                "match", ["get", "cat"],
                0, STORM_CATS.colours[0],
                1, STORM_CATS.colours[1],
                2, STORM_CATS.colours[2],
                3, STORM_CATS.colours[3],
                4, STORM_CATS.colours[4],
                5, STORM_CATS.colours[5],
                6, STORM_CATS.colours[6],
                STORM_CATS.colours[0],
              ],
              "line-width": [
                "interpolate", ["linear"], ["get", "cat"],
                0, 1, 6, 2.5,
              ],
              "line-opacity": 0.8,
            },
          });
        }
        map.setFilter("storms", [
          "in", ["get", "cat"], ["literal", stormCatsRef.current],
        ]);
      } catch {
        /* season file missing; nothing to draw */
      }
    })();
    return () => {
      alive = false;
    };
  }, [stormsOn, year, mapReady]);

  // Storm category filter (ref keeps the async layer-create path in sync)
  useEffect(() => {
    stormCatsRef.current = stormCats;
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer("storms")) return;
    map.setFilter("storms", ["in", ["get", "cat"], ["literal", stormCats]]);
  }, [stormCats, stormsOn, year, mapReady]);

  // Fade storm tracks in when the year changes during play (draw-on feel)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !stormsOn || !playing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    cancelAnimationFrame(stormFadeRef.current);
    if (map.getLayer("storms")) map.setPaintProperty("storms", "line-opacity", 0);
    const start = performance.now();
    const animate = (now: number) => {
      const t = Math.min((now - start) / 550, 1);
      if (map.getLayer("storms")) map.setPaintProperty("storms", "line-opacity", t * 0.8);
      if (t < 1) stormFadeRef.current = requestAnimationFrame(animate);
    };
    stormFadeRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(stormFadeRef.current);
  }, [year, stormsOn, playing, mapReady]);

  // Historical M6+ earthquakes (USGS archive, 1900+), follows the year slider
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    let alive = true;
    if (!quakeHistOn) {
      if (map.getLayer("quakehist")) map.removeLayer("quakehist");
      if (map.getSource("quakehist")) map.removeSource("quakehist");
      return;
    }
    (async () => {
      try {
        if (!quakeHistCache.has(year)) {
          const res = await fetch(`/data/quakes-history/${year}.json`);
          if (res.ok) quakeHistCache.set(year, await res.json());
          else if (res.status === 404) quakeHistCache.set(year, { quakes: [] });
          else return;
        }
        const { quakes } = quakeHistCache.get(year)!;
        if (!alive || !mapRef.current) return;
        const geojson = {
          type: "FeatureCollection" as const,
          features: quakes.map((q) => ({
            type: "Feature" as const,
            properties: q,
            geometry: { type: "Point" as const, coordinates: [q.lon, q.lat] },
          })),
        };
        const src = map.getSource("quakehist") as maplibregl.GeoJSONSource | undefined;
        if (src) {
          src.setData(geojson);
        } else {
          map.addSource("quakehist", {
            type: "geojson",
            data: geojson,
            attribution: 'Quake archive: <a href="https://earthquake.usgs.gov">USGS</a>',
          });
          map.addLayer({
            id: "quakehist",
            type: "circle",
            source: "quakehist",
            paint: {
              "circle-radius": [
                "interpolate", ["linear"], ["get", "mag"],
                6, 3, 7, 6, 8, 11, 9, 18,
              ],
              "circle-color": [
                "step", ["get", "mag"],
                "#fb9a3c", 7, "#f0502a", 8, "#e01515",
              ],
              "circle-opacity": 0.75,
              "circle-stroke-color": "#0d0d0d",
              "circle-stroke-width": 0.5,
            },
          });
        }
      } catch {
        /* year file missing */
      }
    })();
    return () => {
      alive = false;
    };
  }, [quakeHistOn, year, mapReady]);

  // Pulse ring on M7+ quakes when the year changes (visible entry animation)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !quakeHistOn) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const data = quakeHistCache.get(year);
    if (!data) return;
    const bigQuakes = data.quakes.filter((q) => q.mag >= 7);
    if (!bigQuakes.length) return;

    const geojson = {
      type: "FeatureCollection" as const,
      features: bigQuakes.map((q) => ({
        type: "Feature" as const,
        properties: { mag: q.mag },
        geometry: { type: "Point" as const, coordinates: [q.lon, q.lat] },
      })),
    };
    const src = map.getSource("quake-pulse") as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(geojson);
    } else {
      map.addSource("quake-pulse", { type: "geojson", data: geojson });
      map.addLayer({
        id: "quake-pulse",
        type: "circle",
        source: "quake-pulse",
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["get", "mag"], 7, 14, 9, 32,
          ],
          "circle-color": "transparent",
          "circle-stroke-color": "#f0502a",
          "circle-stroke-width": 1.5,
          "circle-stroke-opacity": 0,
        },
      });
    }
    // Ensure pulse layer sits above quakehist
    if (map.getLayer("quake-pulse") && map.getLayer("quakehist"))
      map.moveLayer("quake-pulse");

    cancelAnimationFrame(pulseRef.current);
    const start = performance.now();
    const animate = (now: number) => {
      const t = Math.min((now - start) / 1100, 1);
      const opacity = Math.sin(Math.PI * t) * 0.7;
      if (map.getLayer("quake-pulse"))
        map.setPaintProperty("quake-pulse", "circle-stroke-opacity", opacity);
      if (t < 1) {
        pulseRef.current = requestAnimationFrame(animate);
      }
    };
    pulseRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(pulseRef.current);
  }, [year, quakeHistOn, mapReady]);

  // Historical disaster events (GDACS archive, 2000+), follows the year slider
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    let alive = true;
    if (!disHistOn) {
      if (map.getLayer("dishist")) map.removeLayer("dishist");
      if (map.getSource("dishist")) map.removeSource("dishist");
      return;
    }
    (async () => {
      try {
        if (!disHistCache.has(year)) {
          const res = await fetch(`/data/disasters-history/${year}.json`);
          if (res.ok) disHistCache.set(year, await res.json());
          else if (res.status === 404) disHistCache.set(year, { events: [] });
          else return;
        }
        const { events } = disHistCache.get(year)!;
        if (!alive || !mapRef.current) return;
        const geojson = {
          type: "FeatureCollection" as const,
          features: events.map((ev) => ({
            type: "Feature" as const,
            properties: ev,
            geometry: { type: "Point" as const, coordinates: [ev.lon, ev.lat] },
          })),
        };
        const src = map.getSource("dishist") as maplibregl.GeoJSONSource | undefined;
        if (src) {
          src.setData(geojson);
        } else {
          map.addSource("dishist", {
            type: "geojson",
            data: geojson,
            attribution: 'Alert archive: <a href="https://www.gdacs.org">GDACS</a>',
          });
          map.addLayer({
            id: "dishist",
            type: "circle",
            source: "dishist",
            paint: {
              "circle-radius": [
                "match", ["get", "level"],
                "Red", 8, "Orange", 5.5, 3.5,
              ],
              "circle-color": [
                "match", ["get", "type"],
                "TC", "#9085e9",
                "FL", "#3987e5",
                "DR", "#e0a355",
                "VO", "#e34948",
                "WF", "#ee6a30",
                "#a6a6a6",
              ],
              "circle-opacity": 0.8,
              "circle-stroke-color": [
                "match", ["get", "level"],
                "Red", "#ffffff", "#0d0d0d",
              ],
              "circle-stroke-width": [
                "match", ["get", "level"],
                "Red", 1.5, 0.5,
              ],
            },
          });
        }
      } catch {
        /* year file missing */
      }
    })();
    return () => {
      alive = false;
    };
  }, [disHistOn, year, mapReady]);

  // Air quality layer (OpenAQ latest PM2.5 via our aggregating proxy)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    let alive = true;
    if (!airOn) {
      if (map.getLayer("air")) map.removeLayer("air");
      if (map.getSource("air")) map.removeSource("air");
      return;
    }
    const load = async (first: boolean) => {
      if (first) setAirStatus("loading");
      try {
        const res = await fetch("/api/air");
        if (!res.ok) throw new Error(String(res.status));
        const { points } = (await res.json()) as { points: [number, number, number][] };
        if (!alive || !mapRef.current) return;
        const geojson = {
          type: "FeatureCollection" as const,
          features: points.map(([lon, lat, pm25]) => ({
            type: "Feature" as const,
            properties: { pm25 },
            geometry: { type: "Point" as const, coordinates: [lon, lat] },
          })),
        };
        const src = map.getSource("air") as maplibregl.GeoJSONSource | undefined;
        if (src) {
          src.setData(geojson);
        } else {
          map.addSource("air", { type: "geojson", data: geojson });
          map.addLayer({
            id: "air",
            type: "circle",
            source: "air",
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 1.6, 4, 3, 8, 7],
              "circle-color": [
                "step",
                ["get", "pm25"],
                AIR_BREAKS.colours[0],
                AIR_BREAKS.values[0], AIR_BREAKS.colours[1],
                AIR_BREAKS.values[1], AIR_BREAKS.colours[2],
                AIR_BREAKS.values[2], AIR_BREAKS.colours[3],
              ],
              "circle-opacity": 0.85,
              "circle-stroke-color": "#0d0d0d",
              "circle-stroke-width": 0.4,
            },
          });
        }
        setAirStatus("ready");
      } catch {
        if (alive && first) setAirStatus("error");
      }
    };
    load(true);
    const timer = setInterval(() => {
      if (!document.hidden) load(false);
    }, 1_800_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [airOn, mapReady]);

  // Active tropical cyclones (NHC). Current position + strength; polls every
  // 15 min. The feed is empty out of season, so the layer simply shows nothing.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    let alive = true;
    if (!hurricanesOn) {
      if (map.getLayer("hurricanes")) map.removeLayer("hurricanes");
      if (map.getLayer("hurricanes-ring")) map.removeLayer("hurricanes-ring");
      if (map.getSource("hurricanes")) map.removeSource("hurricanes");
      return;
    }
    const load = async () => {
      try {
        const res = await fetch("/api/hurricanes");
        if (!res.ok) throw new Error(String(res.status));
        const { storms } = (await res.json()) as {
          storms: {
            lon: number; lat: number; name: string; classification: string;
            intensity: number; pressure: number; movementDir: number | null;
            movementSpeed: number | null; lastUpdate: string; url: string;
          }[];
        };
        if (!alive || !mapRef.current) return;
        if (alive) setHurricaneCount(storms.length);
        const geojson = {
          type: "FeatureCollection" as const,
          features: storms.map((s) => ({
            type: "Feature" as const,
            properties: s,
            geometry: { type: "Point" as const, coordinates: [s.lon, s.lat] },
          })),
        };
        const src = map.getSource("hurricanes") as maplibregl.GeoJSONSource | undefined;
        if (src) {
          src.setData(geojson);
          return;
        }
        map.addSource("hurricanes", {
          type: "geojson",
          data: geojson,
          attribution: 'Storms: <a href="https://www.nhc.noaa.gov">NOAA NHC</a>',
        });
        // Soft ring underneath reads as the storm's reach
        map.addLayer({
          id: "hurricanes-ring",
          type: "circle",
          source: "hurricanes",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["get", "intensity"], 30, 10, 130, 26],
            "circle-color": "#6da7ec",
            "circle-opacity": 0.18,
            "circle-blur": 0.6,
          },
        });
        map.addLayer({
          id: "hurricanes",
          type: "circle",
          source: "hurricanes",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["get", "intensity"], 30, 4, 130, 9],
            "circle-color": [
              "step", ["get", "intensity"],
              "#6da7ec", 64, "#e0a355", 96, "#f0502a", 113, "#e01515",
            ],
            "circle-opacity": 0.95,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1,
          },
        });
      } catch {
        /* feed unavailable */
      }
    };
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 900_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [hurricanesOn, mapReady]);

  // Recent and ongoing volcanic activity (Smithsonian GVP). Polls every 6h.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    let alive = true;
    if (!volcanoesOn) {
      if (map.getLayer("volcanoes")) map.removeLayer("volcanoes");
      if (map.getSource("volcanoes")) map.removeSource("volcanoes");
      return;
    }
    const load = async () => {
      try {
        const res = await fetch("/api/volcanoes");
        if (!res.ok) throw new Error(String(res.status));
        const { volcanoes } = (await res.json()) as {
          volcanoes: {
            lon: number; lat: number; name: string; vei: number | null;
            start: string; end: string | null; ongoing: boolean; number: number;
          }[];
        };
        if (!alive || !mapRef.current) return;
        const geojson = {
          type: "FeatureCollection" as const,
          features: volcanoes.map((v) => ({
            type: "Feature" as const,
            properties: { ...v, ongoing: v.ongoing ? 1 : 0 },
            geometry: { type: "Point" as const, coordinates: [v.lon, v.lat] },
          })),
        };
        const src = map.getSource("volcanoes") as maplibregl.GeoJSONSource | undefined;
        if (src) {
          src.setData(geojson);
          return;
        }
        map.addSource("volcanoes", {
          type: "geojson",
          data: geojson,
          attribution: 'Volcanoes: <a href="https://volcano.si.edu">Smithsonian GVP</a>',
        });
        map.addLayer({
          id: "volcanoes",
          type: "circle",
          source: "volcanoes",
          paint: {
            // ongoing eruptions burn brighter and larger than recent ones
            "circle-radius": ["case", ["==", ["get", "ongoing"], 1], 6, 4],
            "circle-color": ["case", ["==", ["get", "ongoing"], 1], "#ff5a36", "#c2612e"],
            "circle-opacity": 0.9,
            "circle-stroke-color": "#1a0d08",
            "circle-stroke-width": 0.75,
          },
        });
      } catch {
        /* feed unavailable */
      }
    };
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 21_600_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [volcanoesOn, mapReady]);

  // Aurora forecast oval (NOAA SWPC OVATION). A heatmap glow near the poles;
  // polls every 30 min.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    let alive = true;
    if (!auroraOn) {
      if (map.getLayer("aurora")) map.removeLayer("aurora");
      if (map.getSource("aurora")) map.removeSource("aurora");
      return;
    }
    const load = async () => {
      try {
        const res = await fetch("/api/aurora");
        if (!res.ok) throw new Error(String(res.status));
        const { points } = (await res.json()) as { points: [number, number, number][] };
        if (!alive || !mapRef.current) return;
        const geojson = {
          type: "FeatureCollection" as const,
          features: points.map(([lon, lat, prob]) => ({
            type: "Feature" as const,
            properties: { prob },
            geometry: { type: "Point" as const, coordinates: [lon, lat] },
          })),
        };
        const src = map.getSource("aurora") as maplibregl.GeoJSONSource | undefined;
        if (src) {
          src.setData(geojson);
          return;
        }
        map.addSource("aurora", {
          type: "geojson",
          data: geojson,
          attribution: 'Aurora: <a href="https://www.swpc.noaa.gov">NOAA SWPC</a>',
        });
        map.addLayer({
          id: "aurora",
          type: "heatmap",
          source: "aurora",
          paint: {
            "heatmap-weight": ["interpolate", ["linear"], ["get", "prob"], 5, 0.15, 90, 1],
            "heatmap-intensity": 0.9,
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 1, 8, 5, 34],
            "heatmap-opacity": 0.65,
            "heatmap-color": [
              "interpolate", ["linear"], ["heatmap-density"],
              0, "rgba(0,0,0,0)",
              0.2, "rgba(30,120,90,0.35)",
              0.5, "rgba(45,190,120,0.6)",
              0.8, "rgba(120,240,170,0.8)",
              1, "rgba(200,255,220,0.95)",
            ],
          },
        });
      } catch {
        /* feed unavailable */
      }
    };
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 1_800_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [auroraOn, mapReady]);

  // Live event ticker: the biggest things happening on Earth right now.
  // Refetches every 2 minutes so an open tab stays a genuine live feed.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [qres, dres] = await Promise.all([
          fetch("/api/quakes"),
          fetch("/api/disasters"),
        ]);
        if (!qres.ok || !dres.ok) return;
        const { quakes, updated } = (await qres.json()) as {
          updated?: string;
          quakes: { lon: number; lat: number; mag: number; depth: number; place: string; time: number; url: string }[];
        };
        const { events } = (await dres.json()) as {
          events: { lon: number; lat: number; type: string; level: string; name: string; country: string; severity: string; from: string; to: string; eventid: number }[];
        };
        if (!alive) return;
        const items: TickerItem[] = [];
        for (const q of quakes.filter((x) => x.mag >= 4.8)) {
          items.push({
            sev: q.mag >= 6 ? 2.5 : 1,
            lon: q.lon,
            lat: q.lat,
            label: `M${q.mag.toFixed(1)} earthquake · ${q.place}`,
            event: { kind: "quake", mag: q.mag, depth: q.depth, place: q.place, time: q.time, url: q.url },
          });
        }
        const typeNames: Record<string, string> = {
          TC: "cyclone", FL: "flood", DR: "drought", VO: "volcano", WF: "wildfire", EQ: "earthquake",
        };
        const seen = new Set<number>();
        for (const ev of events.filter((x) => x.level === "Red" || x.level === "Orange")) {
          if (seen.has(ev.eventid)) continue;
          seen.add(ev.eventid);
          items.push({
            sev: ev.level === "Red" ? 3 : 1.5,
            lon: ev.lon,
            lat: ev.lat,
            label: `${ev.level.toUpperCase()} ${typeNames[ev.type] ?? "alert"} · ${ev.name}`,
            event: {
              kind: "disaster", type: ev.type, level: ev.level, name: ev.name,
              country: ev.country, severity: ev.severity, from: ev.from, to: ev.to, eventid: ev.eventid,
            },
          });
        }
        items.sort((a, b) => b.sev - a.sev);
        setTicker(items.slice(0, 14));
        if (updated) setLiveAsOf(updated);
      } catch {
        /* ticker simply stays hidden */
      }
    };
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 120_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const showTickerEvent = useCallback((item: { lon: number; lat: number; event: MapEvent }) => {
    const map = mapRef.current;
    if (!map) return;
    if (item.event.kind === "quake") setQuakesOn(true);
    if (item.event.kind === "disaster") setDisastersOn(true);
    map.flyTo({ center: [item.lon, item.lat], zoom: 4.2, duration: 1800 });
    map.once("moveend", () => {
      const pt = map.project([item.lon, item.lat]);
      const w = map.getCanvas().clientWidth;
      const h = map.getCanvas().clientHeight;
      setPopup({
        event: item.event,
        left: Math.min(pt.x + 12, w - 300),
        top: Math.min(Math.max(pt.y - 10, 8), h - 260),
      });
    });
  }, []);

  // Cinematic idle spin: after 12s without input, the globe drifts slowly
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !globeOn || playing || popup) return;
    let idleSince = Date.now();
    const bump = () => {
      idleSince = Date.now();
    };
    const canvas = map.getCanvas();
    for (const ev of ["mousedown", "wheel", "touchstart", "mousemove", "keydown"])
      canvas.addEventListener(ev, bump, { passive: true });
    let raf = 0;
    const tick = () => {
      if (Date.now() - idleSince > 12000 && document.visibilityState === "visible") {
        const c = map.getCenter();
        map.setCenter([c.lng + 0.012, c.lat]);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      for (const ev of ["mousedown", "wheel", "touchstart", "mousemove", "keydown"])
        canvas.removeEventListener(ev, bump);
    };
  }, [mapReady, globeOn, playing, popup]);

  // Play/animate the timeline (plays through into the projected years).
  // In month mode it steps month by month instead.
  useEffect(() => {
    if (!playing) return;
    if (monthMode && monthlyInfo) {
      const t = setInterval(() => {
        setMonth((m) => {
          if (m < 11) return m + 1;
          if (yearRef.current >= monthlyInfo.lastYear) {
            setPlaying(false);
            return m; // hold at December of the final year
          }
          setYear((y) => y + 1);
          return 0;
        });
      }, 140);
      return () => clearInterval(t);
    }
    const playLast = PROJECTIONS[metric.id]?.lastYear ?? metric.lastYear;
    const t = setInterval(() => {
      setYear((y) => {
        if (y >= playLast) {
          setPlaying(false);
          return y;
        }
        return y + 1;
      });
    }, 180);
    return () => clearInterval(t);
  }, [playing, metric, monthMode, monthlyInfo]);

  // Prefetch nearby years so scrubbing is smooth
  useEffect(() => {
    if (monthMode && monthlyInfo) {
      // months live 12-to-a-file; the next year's file is all we need ahead
      if (year + 1 <= monthlyInfo.lastYear) fetchMonthly(metric.id, year + 1);
      return;
    }
    const projLast = PROJECTIONS[metric.id]?.lastYear ?? metric.lastYear;
    for (let y = year + 1; y <= Math.min(year + 5, projLast); y++) {
      fetchChoropleth(
        metric.id,
        y,
        y > metric.lastYear ? scenario : undefined
      );
      if (stormsOn && !stormsCache.has(y))
        fetch(`/data/storms/${y}.json`)
          .then((r) => (r.ok ? r.json().then((j) => stormsCache.set(y, j)) : undefined))
          .catch(() => {});
      if (quakeHistOn && !quakeHistCache.has(y))
        fetch(`/data/quakes-history/${y}.json`)
          .then((r) => (r.ok ? r.json().then((j) => quakeHistCache.set(y, j)) : undefined))
          .catch(() => {});
      if (disHistOn && !disHistCache.has(y))
        fetch(`/data/disasters-history/${y}.json`)
          .then((r) => (r.ok ? r.json().then((j) => disHistCache.set(y, j)) : undefined))
          .catch(() => {});
    }
  }, [metric, year, scenario, stormsOn, quakeHistOn, disHistOn, monthMode, monthlyInfo]);

  const domains = [...new Set(metrics.map((m) => m.domain))];
  const sliderMin = metric.firstYear;
  const projection = PROJECTIONS[metric.id];
  const sliderMax = projection ? projection.lastYear : metric.lastYear;
  const isProjectedYear = !!projection && year > metric.lastYear;
  const scenarioMeta = SCENARIOS.find((sc) => sc.id === scenario)!;

  const legendColours = rampColours(metric.scaleType, metric.ramp);
  const accent = accentFor(metric.scaleType, metric.ramp);
  const liveCount = [satOn, firesOn, floodsOn, airOn, quakesOn, disastersOn, hurricanesOn, volcanoesOn, auroraOn, stormsOn, quakeHistOn, disHistOn].filter(Boolean).length;
  const legendEl = (
    <div>
      <div className="mb-1 truncate text-sm font-medium text-white">
        {metric.name}
      </div>
      <div
        className="h-2 rounded-full"
        style={{
          background: `linear-gradient(to right, ${legendColours.join(", ")})`,
        }}
      />
      <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-[#898781]">
        <span>{metric.scale[0]}</span>
        <span>{metric.unit}</span>
        <span>{metric.scale[1]}+</span>
      </div>
    </div>
  );

  const onSelectCountry = useCallback((c: Country) => {
    window.location.href = `/country/${c.iso3}`;
  }, []);

  // Shared control bodies, reused in the desktop floating panels and the
  // mobile burger drawer so there is a single source of truth.
  const liveLayersBody = (
    <div className="space-y-0.5">
      <div className="pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#898781]">
        Live now
      </div>
      <LayerRow label="Satellite imagery" checked={satOn} onChange={setSatOn} />
      {satOn && (
        <input
          type="date"
          value={satDate}
          min="2012-01-20"
          max={latestImageryDate()}
          onChange={(e) => e.target.value && setSatDate(e.target.value)}
          aria-label="Imagery date"
          className="mb-1 w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white [color-scheme:dark]"
        />
      )}
      <LayerRow label="Active fires (24h)" dot="#f0502a" checked={firesOn} onChange={setFiresOn} />
      <LayerRow label="River flood alerts" dot="#3987e5" checked={floodsOn} onChange={setFloodsOn} />
      <LayerRow label="Air quality now" dot="#0ca30c" checked={airOn} onChange={setAirOn} />
      {airOn && airStatus === "loading" && (
        <p className="pl-4 text-[10px] text-[#898781]">Loading stations…</p>
      )}
      {airOn && airStatus === "error" && (
        <p className="pl-4 text-[10px] text-[#898781]">Feed unavailable right now.</p>
      )}
      {airOn && airStatus === "ready" && (
        <LegendRow
          items={AIR_BREAKS.labels.map((l, i) => ({
            label: `${l} µg/m³`,
            colour: AIR_BREAKS.colours[i],
          }))}
        />
      )}
      <LayerRow label="Earthquakes (24h)" dot="#fb9a3c" checked={quakesOn} onChange={setQuakesOn} />
      {quakesOn && (
        <LegendRow
          items={[
            { label: "M1-3", colour: "#fed976" },
            { label: "M3-4.5", colour: "#fb9a3c" },
            { label: "M4.5-6", colour: "#f0502a" },
            { label: "M6+", colour: "#e01515" },
          ]}
        />
      )}
      <LayerRow label="Disaster alerts" dot="#9085e9" checked={disastersOn} onChange={setDisastersOn} />
      {disastersOn && (
        <LegendRow
          items={[
            { label: "cyclone", colour: "#9085e9" },
            { label: "flood", colour: "#3987e5" },
            { label: "drought", colour: "#e0a355" },
            { label: "volcano", colour: "#e34948" },
          ]}
        />
      )}
      <LayerRow
        label={
          hurricanesOn && hurricaneCount !== null
            ? `Hurricanes${hurricaneCount ? ` · ${hurricaneCount} active` : " · none active"}`
            : "Hurricanes (live)"
        }
        dot="#6da7ec"
        checked={hurricanesOn}
        onChange={setHurricanesOn}
      />
      {hurricanesOn && (
        <p className="pb-1 pl-4 text-[10px] leading-snug text-[#898781]">
          Active tropical cyclones from NOAA NHC. Empty outside storm season.
        </p>
      )}
      <LayerRow label="Volcanic activity" dot="#ff5a36" checked={volcanoesOn} onChange={setVolcanoesOn} />
      {volcanoesOn && (
        <>
          <LegendRow
            items={[
              { label: "erupting now", colour: "#ff5a36" },
              { label: "recent", colour: "#c2612e" },
            ]}
          />
          <p className="pb-1 pl-4 text-[10px] leading-snug text-[#898781]">
            Smithsonian GVP: eruptions in the last ~2 years and ongoing.
          </p>
        </>
      )}
      <LayerRow label="Aurora forecast" dot="#2dbe78" checked={auroraOn} onChange={setAuroraOn} />
      {auroraOn && (
        <p className="pb-1 pl-4 text-[10px] leading-snug text-[#898781]">
          NOAA SWPC OVATION: the chance of visible aurora over the next hour.
        </p>
      )}
      <div className="mt-2 border-t border-white/10 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[#898781]">
        History · follows the year slider
      </div>
      <LayerRow label={`Storm tracks · ${year}`} dot="#f0502a" checked={stormsOn} onChange={setStormsOn} />
      {stormsOn && (
        <>
          <div className="flex flex-wrap gap-1 pb-1 pl-4">
            {STORM_CATS.labels.map((l, i) => {
              const active = stormCats.includes(i);
              return (
                <button
                  key={l}
                  onClick={() =>
                    setStormCats((cats) =>
                      cats.includes(i) ? cats.filter((c) => c !== i) : [...cats, i]
                    )
                  }
                  aria-pressed={active}
                  className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] transition-colors ${
                    active
                      ? "border-white/20 bg-white/10 text-[#c3c2b7]"
                      : "border-white/5 text-[#52514e]"
                  }`}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{
                      background: STORM_CATS.colours[i],
                      opacity: active ? 1 : 0.3,
                    }}
                  />
                  {l}
                </button>
              );
            })}
          </div>
          <p className="pb-1 pl-4 text-[10px] leading-snug text-[#898781]">
            Every tropical cyclone since 1842. Tap a category to hide it; press
            play to replay the seasons.
          </p>
        </>
      )}
      <LayerRow label={`Earthquakes M6+ · ${year}`} dot="#f0502a" checked={quakeHistOn} onChange={setQuakeHistOn} />
      {quakeHistOn && (
        <>
          <LegendRow
            items={[
              { label: "M6-7", colour: "#fb9a3c" },
              { label: "M7-8", colour: "#f0502a" },
              { label: "M8+", colour: "#e01515" },
            ]}
          />
          <p className="pb-1 pl-4 text-[10px] leading-snug text-[#898781]">
            USGS archive, 1900 onwards.
          </p>
        </>
      )}
      <LayerRow label={`Disasters · ${year}`} dot="#3987e5" checked={disHistOn} onChange={setDisHistOn} />
      {disHistOn && (
        <>
          <LegendRow
            items={[
              { label: "cyclone", colour: "#9085e9" },
              { label: "flood", colour: "#3987e5" },
              { label: "drought", colour: "#e0a355" },
              { label: "wildfire", colour: "#ee6a30" },
              { label: "volcano", colour: "#e34948" },
            ]}
          />
          <p className="pb-1 pl-4 text-[10px] leading-snug text-[#898781]">
            GDACS archive, 2000 onwards (wildfires from 2022).
          </p>
        </>
      )}
    </div>
  );

  const metricPickerBody = (
    <>
      <div className="pr-1 lg:max-h-[calc(100dvh-360px)] lg:overflow-y-auto">
        {domains.map((d) => (
          <div key={d} className="mb-2 last:mb-0">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#898781]">
              {DOMAIN_LABELS[d] ?? d}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {metrics
                .filter((m) => m.domain === d)
                .map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setMetricId(m.id);
                      setYear((y) => Math.min(Math.max(y, m.firstYear), m.lastYear));
                      setMobileMenuOpen(false);
                    }}
                    className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                      m.id === metricId
                        ? "bg-white text-black"
                        : "bg-white/10 text-[#c3c2b7] hover:bg-white/20"
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 border-t border-white/10 pt-2 text-xs leading-snug text-[#c3c2b7]">
        {metric.explainer}{" "}
        <a
          href={metric.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[#6da7ec] hover:underline"
        >
          Source: {metric.source}
        </a>
      </p>
      <div className="mt-2">{legendEl}</div>
    </>
  );

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#0d0d0d]">
      {/* maplibre-gl.css forces position:relative on this element, so size it
          explicitly rather than relying on absolute inset */}
      <div ref={mapContainer} className="absolute inset-0 h-full w-full" />

      {/* Starfield: sits above the WebGL canvas, screen-blend so stars appear
          only in the dark space behind the globe and vanish on bright surfaces */}
      <Starfield />

      {/* Header + mobile burger */}
      <div className="absolute left-3 top-3 z-30 flex items-center gap-2 lg:left-4 lg:top-4 lg:block">
        <button
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open controls"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-[#161615]/95 text-white backdrop-blur lg:hidden"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M2 4h12M2 8h12M2 12h12"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div>
          <h1 className="pointer-events-none text-lg font-semibold tracking-tight text-white lg:text-xl">
            Earth Pulse
          </h1>
          <p className="pointer-events-none hidden text-sm text-[#c3c2b7] lg:block">
            The state of the planet, {metric.firstYear} to today
          </p>
          <div className="mt-1 hidden flex-wrap gap-x-4 gap-y-0.5 text-sm lg:flex">
            <a href="/planet" className="text-[#6da7ec] hover:underline">
              Planet trends →
            </a>
            <a href="/compare" className="text-[#6da7ec] hover:underline">
              Compare countries →
            </a>
            <div className="flex flex-wrap gap-1.5">
              {STORIES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setActiveStory(s);
                    setStoryStep(0);
                    setStoryPlaying(false);
                  }}
                  className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                    activeStory?.id === s.id
                      ? "border-[#6da7ec]/40 bg-[#6da7ec]/10 text-[#6da7ec]"
                      : "border-white/10 text-[#898781] hover:border-white/20 hover:text-[#c3c2b7]"
                  }`}
                >
                  {s.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Planet vitals: floating pill (lg+) */}
      <VitalsStrip vitals={vitals} onSelect={setVitalsModal} />

      {/* Planet vitals: horizontal strip on mobile/tablet */}
      <div className="absolute inset-x-3 top-[3.75rem] z-10 lg:hidden">
        <VitalsStrip vitals={vitals} variant="inline" onSelect={setVitalsModal} />
      </div>

      {/* Search (desktop) */}
      <div className="absolute right-4 top-4 z-30 hidden w-64 lg:block">
        <CountrySearch countries={countries} onSelect={onSelectCountry} />
      </div>

      {/* Current-metric legend chip (mobile), top-left under the vitals strip */}
      <button
        onClick={() => setMobileMenuOpen(true)}
        className="absolute left-3 top-[7.25rem] z-10 w-[62%] max-w-[15rem] rounded-xl border border-white/10 bg-[#161615]/95 p-2 text-left backdrop-blur lg:hidden"
      >
        {legendEl}
      </button>

      {/* Live layers + movers (desktop floating, stacked so expansion pushes down) */}
      <div className="absolute right-4 top-16 z-10 hidden w-64 flex-col gap-2 lg:flex">
        <Panel
          title="Live layers"
          badge={
            [
              liveCount ? `${liveCount} on` : null,
              liveAsOf ? `as of ${fmtTime(liveAsOf)}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
          defaultOpen={false}
        >
          {liveLayersBody}
        </Panel>
        <Panel title="Biggest movers" defaultOpen={false}>
          <div className="max-h-[calc(100dvh-420px)] overflow-y-auto pr-1">
            <MoversPanel series={series} countries={countries} metric={metric} />
          </div>
        </Panel>
      </div>

      {/* Metric picker (desktop floating) */}
      <div className="absolute left-4 top-28 z-20 hidden w-[21rem] max-w-[85vw] lg:block">
        <Panel title="Map data" defaultOpen={false} summary={legendEl}>
          {metricPickerBody}
        </Panel>
      </div>

      {/* Mobile controls drawer */}
      {mobileMenuOpen && (
        <div className="absolute inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col gap-4 overflow-y-auto border-r border-white/10 bg-[#0d0d0d] p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold tracking-tight text-white">
                Earth Pulse
              </span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close controls"
                className="grid h-8 w-8 place-items-center rounded-full text-[#898781] hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>
            <CountrySearch countries={countries} onSelect={onSelectCountry} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <a href="/planet" className="text-[#6da7ec] hover:underline">
                Planet trends →
              </a>
              <a href="/compare" className="text-[#6da7ec] hover:underline">
                Compare countries →
              </a>
            </div>
            <div className="border-t border-white/10 pt-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#898781]">
                Stories
              </div>
              <div className="flex flex-col gap-1.5">
                {STORIES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setActiveStory(s);
                      setStoryStep(0);
                      setStoryPlaying(false);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex flex-col rounded-lg border px-3 py-2 text-left transition-colors ${
                      activeStory?.id === s.id
                        ? "border-[#6da7ec]/30 bg-[#6da7ec]/5"
                        : "border-white/5 hover:border-white/10 hover:bg-white/5"
                    }`}
                  >
                    <span className="text-sm text-[#c3c2b7]">{s.title}</span>
                    <span className="text-[11px] text-[#898781]">{s.tagline}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#898781]">
                Map data
              </div>
              {metricPickerBody}
            </div>
            <div className="border-t border-white/10 pt-3">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#898781]">
                Live layers{liveCount ? ` · ${liveCount} on` : ""}
                {liveAsOf ? ` · as of ${fmtTime(liveAsOf)}` : ""}
              </div>
              {liveLayersBody}
            </div>
            <div className="border-t border-white/10 pt-3">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#898781]">
                Biggest movers
              </div>
              <MoversPanel series={series} countries={countries} metric={metric} />
            </div>
            {dataUpdated && (
              <p className="pb-1 text-[11px] text-[#898781]">
                Historical data updated {daysAgo(dataUpdated)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Live event ticker (news crawl, pinned to the very bottom) */}
      <EventTicker items={ticker} onSelect={showTickerEvent} />

      {/* Globe / flat toggle */}
      <button
        onClick={() => setGlobeOn((g) => !g)}
        className="absolute bottom-[6.75rem] right-4 z-10 flex items-center gap-2 rounded-full border border-white/10 bg-[#1a1a19]/90 px-3 py-2 text-xs text-[#c3c2b7] backdrop-blur transition-colors hover:bg-[#1a1a19] hover:text-white"
        aria-pressed={globeOn}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          {globeOn ? (
            <path
              d="M2 2 h10 M2 7 h10 M2 12 h10 M4 2 v10 M10 2 v10"
              stroke="currentColor"
              strokeWidth="1.2"
              fill="none"
              strokeLinecap="round"
            />
          ) : (
            <g stroke="currentColor" strokeWidth="1.2" fill="none">
              <circle cx="7" cy="7" r="5.5" />
              <ellipse cx="7" cy="7" rx="2.5" ry="5.5" />
              <path d="M1.8 5 h10.4 M1.8 9 h10.4" />
            </g>
          )}
        </svg>
        {globeOn ? "Flat map" : "Globe"}
      </button>

      {/* Time slider */}
      <div className="absolute inset-x-0 bottom-9 z-10 mx-auto w-[min(680px,92%)] rounded-xl border border-white/10 bg-[#1a1a19]/90 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (!playing) {
                if (monthMode && monthlyInfo) {
                  if (year >= monthlyInfo.lastYear && month >= 11) {
                    setYear(monthlyInfo.firstYear);
                    setMonth(0);
                  }
                } else if (year >= metric.lastYear) {
                  setYear(sliderMin);
                }
              }
              setPlaying((p) => !p);
            }}
            aria-label={playing ? "Pause" : "Play"}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-black transition-transform hover:scale-105"
          >
            {playing ? (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <rect x="1" y="0" width="3.5" height="12" rx="1" fill="currentColor" />
                <rect x="7.5" y="0" width="3.5" height="12" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2 0.8 L11 6 L2 11.2 Z" fill="currentColor" />
              </svg>
            )}
          </button>
          <div className="relative w-full">
            {monthMode && monthlyInfo ? (
              <input
                type="range"
                min={monthlyInfo.firstYear * 12}
                max={monthlyInfo.lastYear * 12 + 11}
                value={year * 12 + month}
                onChange={(e) => {
                  setPlaying(false);
                  const v = Number(e.target.value);
                  setYear(Math.floor(v / 12));
                  setMonth(v % 12);
                }}
                className="ep-slider w-full"
                aria-label="Month"
              />
            ) : (
              <input
                type="range"
                min={sliderMin}
                max={sliderMax}
                value={year}
                onChange={(e) => {
                  setPlaying(false);
                  setYear(Number(e.target.value));
                }}
                className="ep-slider w-full"
                aria-label="Year"
              />
            )}
            {projection && !monthMode && (
              <div
                className="pointer-events-none absolute top-1/2 h-3.5 w-px -translate-y-1/2 bg-white/40"
                style={{
                  left: `${((metric.lastYear - sliderMin) / (sliderMax - sliderMin)) * 100}%`,
                }}
                aria-hidden="true"
              />
            )}
          </div>
          {monthlyInfo && (
            <button
              onClick={() => {
                setPlaying(false);
                if (!monthMode) {
                  // entering month mode: clamp the year into the monthly range
                  setYear((y) =>
                    Math.min(Math.max(y, monthlyInfo.firstYear), monthlyInfo.lastYear)
                  );
                }
                setMonthMode((m) => !m);
              }}
              aria-pressed={monthMode}
              title="Switch between yearly and monthly resolution"
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                monthMode
                  ? "border-white/30 bg-white/10 text-white"
                  : "border-white/10 text-[#898781] hover:text-[#c3c2b7]"
              }`}
            >
              Monthly
            </button>
          )}
          <div className={`${monthMode ? "w-20" : "w-16"} shrink-0 text-right`}>
            <div
              className={`${monthMode ? "text-sm leading-7" : "text-lg"} font-semibold tabular-nums`}
              style={{ color: isProjectedYear ? scenarioMeta.colour : "#ffffff" }}
            >
              {monthMode ? `${MONTH_LABELS[month]} ${year}` : year}
            </div>
            {isProjectedYear && (
              <div className="-mt-1 text-[9px] uppercase tracking-wide text-[#898781]">
                projected
              </div>
            )}
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] tabular-nums text-[#898781]">
          <span>{monthMode && monthlyInfo ? monthlyInfo.firstYear : sliderMin}</span>
          {monthMode && monthlyInfo ? (
            <span>{monthlyInfo.unit}</span>
          ) : projection ? (
            <span className="flex items-center gap-2">
              <span className="hidden sm:inline">‹ observed to {metric.lastYear}</span>
              <span className="flex gap-1">
                {SCENARIOS.map((sc) => (
                  <button
                    key={sc.id}
                    onClick={() => {
                      setScenario(sc.id);
                      if (year <= metric.lastYear) setYear(2050);
                    }}
                    aria-pressed={scenario === sc.id}
                    title={`${sc.detail} emissions scenario`}
                    className={`rounded-full border px-2 py-0.5 transition-colors ${
                      scenario === sc.id
                        ? "border-white/30 bg-white/10 text-white"
                        : "border-white/10 text-[#898781] hover:text-[#c3c2b7]"
                    }`}
                  >
                    <span
                      className="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                      style={{ background: sc.colour }}
                    />
                    {sc.label}
                  </button>
                ))}
              </span>
              <span className="hidden sm:inline">CMIP6 projections ›</span>
            </span>
          ) : (
            <span>{metric.unit}</span>
          )}
          <span>{monthMode && monthlyInfo ? monthlyInfo.lastYear : sliderMax}</span>
        </div>
      </div>

      {/* Story player overlay */}
      {activeStory && (
        <StoryPlayer
          story={activeStory}
          step={storyStep}
          playing={storyPlaying}
          onPrev={() => setStoryStep((i) => Math.max(0, i - 1))}
          onNext={() => setStoryStep((i) => Math.min(activeStory.steps.length - 1, i + 1))}
          onTogglePlay={() => setStoryPlaying((p) => !p)}
          onClose={() => {
            setActiveStory(null);
            setStoryPlaying(false);
          }}
        />
      )}

      {/* Vitals history modal */}
      {vitalsModal && (
        <VitalsModal id={vitalsModal} onClose={() => setVitalsModal(null)} />
      )}

      {/* Event popup */}
      {popup && (
        <EventPopup
          event={popup.event}
          left={popup.left}
          top={popup.top}
          onClose={() => setPopup(null)}
        />
      )}

      {/* Hover tooltip */}
      {hover && (
        <div
          className="pointer-events-none absolute z-30 w-56 rounded-lg border border-white/10 bg-[#1a1a19] p-3 shadow-xl"
          style={{ left: hover.left, top: hover.top }}
        >
          <div className="text-sm font-medium text-white">{hover.name}</div>
          <div className="text-xs text-[#c3c2b7]">
            {hover.value !== null
              ? `${formatValue(hover.value, metric.unit)} · ${year}`
              : `No data · ${year}`}
          </div>
          {series[hover.iso3] && series[hover.iso3].length > 1 && (
            <div className="mt-2">
              <Sparkline
                points={series[hover.iso3]}
                year={year}
                height={36}
                width={200}
                colour={accent}
              />
              <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-[#898781]">
                <span>{series[hover.iso3][0][0]}</span>
                <span>{series[hover.iso3][series[hover.iso3].length - 1][0]}</span>
              </div>
            </div>
          )}
          <div className="mt-1.5 text-[10px] text-[#898781]">
            Click for the full country picture
          </div>
        </div>
      )}
    </div>
  );
}

function LayerRow({
  label,
  dot,
  checked,
  onChange,
}: {
  label: string;
  dot?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="-mx-1.5 flex cursor-pointer items-center justify-between rounded-lg px-1.5 py-1.5 text-sm text-[#c3c2b7] transition-colors hover:bg-white/5">
      <span className="flex items-center gap-2">
        {dot && (
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: dot, opacity: checked ? 1 : 0.35 }}
          />
        )}
        {label}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-white"
      />
    </label>
  );
}

function LegendRow({ items }: { items: { label: string; colour: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 pb-1 pl-4 text-[10px] text-[#898781]">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: it.colour }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

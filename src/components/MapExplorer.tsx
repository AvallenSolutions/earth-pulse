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
import { Panel } from "./Panel";
import { EventPopup, type MapEvent } from "./EventPopup";

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

const choroplethCache = new Map<string, Record<string, number>>();
const seriesCache = new Map<string, SeriesFile>();

async function fetchChoropleth(metric: string, year: number) {
  const key = `${metric}/${year}`;
  if (!choroplethCache.has(key)) {
    const res = await fetch(`/data/choropleth/${key}.json`);
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
}: {
  metrics: Metric[];
  countries: Country[];
  vitals: Vitals;
  initialMetric?: string;
  initialYear?: number;
  initialView?: string;
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [metricId, setMetricId] = useState(
    metrics.some((m) => m.id === initialMetric) ? initialMetric! : metrics[0].id
  );
  const metric = metrics.find((m) => m.id === metricId)!;
  const [year, setYear] = useState(() =>
    initialYear
      ? Math.min(Math.max(initialYear, metric.firstYear), metric.lastYear)
      : metric.lastYear
  );
  const [globeOn, setGlobeOn] = useState(initialView !== "flat");
  const [playing, setPlaying] = useState(false);
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
  const [stormsOn, setStormsOn] = useState(false);
  const [stormCats, setStormCats] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const stormCatsRef = useRef(stormCats);
  const [quakeHistOn, setQuakeHistOn] = useState(false);
  const [disHistOn, setDisHistOn] = useState(false);
  const [ticker, setTicker] = useState<
    { lon: number; lat: number; label: string; event: MapEvent }[]
  >([]);
  const [tickerI, setTickerI] = useState(0);
  const [airStatus, setAirStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

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
    for (const layer of ["quakes", "disasters", "storms", "quakehist", "dishist"]) {
      map.on("mouseenter", layer, () => {
        map.getCanvas().style.cursor = "pointer";
      });
    }
    map.on("click", "country-fills", (e) => {
      // event dots sit above countries; don't navigate through them
      const hits = map
        .queryRenderedFeatures(e.point, {
          layers: ["quakes", "disasters", "storms", "quakehist", "dishist"].filter((l) => map.getLayer(l)),
        })
        .length;
      if (hits > 0) return;
      const iso3 = e.features?.[0]?.properties.iso3;
      if (iso3) window.location.href = `/country/${iso3}`;
    });

    mapRef.current = map;
    if (process.env.NODE_ENV === "development")
      (window as unknown as { __map?: maplibregl.Map }).__map = map;
    return () => {
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

  // Paint the choropleth whenever metric/year changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    let alive = true;
    (async () => {
      const values = await fetchChoropleth(metric.id, year);
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
  }, [metric, year, mapReady]);

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

  // Keep the URL shareable: /?metric=...&year=...&view=...
  useEffect(() => {
    const params = new URLSearchParams({
      metric: metricId,
      year: String(year),
      view: globeOn ? "globe" : "flat",
    });
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [metricId, year, globeOn]);

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

  // Earthquakes in the last 24h (USGS, refreshed every minute)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    let alive = true;
    if (!quakesOn) {
      if (map.getLayer("quakes")) map.removeLayer("quakes");
      if (map.getSource("quakes")) map.removeSource("quakes");
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/quakes");
        if (!res.ok) throw new Error(String(res.status));
        const { quakes } = (await res.json()) as {
          quakes: {
            lon: number; lat: number; mag: number; depth: number;
            place: string; time: number; url: string;
          }[];
        };
        if (!alive || !mapRef.current || map.getSource("quakes")) return;
        map.addSource("quakes", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: quakes.map((q) => ({
              type: "Feature" as const,
              properties: q,
              geometry: { type: "Point" as const, coordinates: [q.lon, q.lat] },
            })),
          },
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
    })();
    return () => {
      alive = false;
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
    (async () => {
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
        if (!alive || !mapRef.current || map.getSource("disasters")) return;
        map.addSource("disasters", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: events.map((ev) => ({
              type: "Feature" as const,
              properties: ev,
              geometry: { type: "Point" as const, coordinates: [ev.lon, ev.lat] },
            })),
          },
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
    })();
    return () => {
      alive = false;
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
    (async () => {
      setAirStatus("loading");
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
        if (!map.getSource("air")) {
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
        if (alive) setAirStatus("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [airOn, mapReady]);

  // Live event ticker: the biggest things happening on Earth right now
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [qres, dres] = await Promise.all([
          fetch("/api/quakes"),
          fetch("/api/disasters"),
        ]);
        if (!qres.ok || !dres.ok) return;
        const { quakes } = (await qres.json()) as {
          quakes: { lon: number; lat: number; mag: number; depth: number; place: string; time: number; url: string }[];
        };
        const { events } = (await dres.json()) as {
          events: { lon: number; lat: number; type: string; level: string; name: string; country: string; severity: string; from: string; to: string; eventid: number }[];
        };
        if (!alive) return;
        const items: { sev: number; lon: number; lat: number; label: string; event: MapEvent }[] = [];
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
      } catch {
        /* ticker simply stays hidden */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (ticker.length < 2) return;
    const t = setInterval(() => setTickerI((i) => (i + 1) % ticker.length), 6000);
    return () => clearInterval(t);
  }, [ticker]);

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

  // Play/animate the timeline
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setYear((y) => {
        if (y >= metric.lastYear) {
          setPlaying(false);
          return y;
        }
        return y + 1;
      });
    }, 180);
    return () => clearInterval(t);
  }, [playing, metric]);

  // Prefetch nearby years so scrubbing is smooth
  useEffect(() => {
    for (let y = year + 1; y <= Math.min(year + 5, metric.lastYear); y++) {
      fetchChoropleth(metric.id, y);
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
  }, [metric, year, stormsOn, quakeHistOn, disHistOn]);

  const domains = [...new Set(metrics.map((m) => m.domain))];
  const sliderMin = metric.firstYear;
  const sliderMax = metric.lastYear;

  const legendColours = rampColours(metric.scaleType, metric.ramp);
  const accent = accentFor(metric.scaleType, metric.ramp);
  const liveCount = [satOn, firesOn, floodsOn, airOn, quakesOn, disastersOn, stormsOn, quakeHistOn, disHistOn].filter(Boolean).length;
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

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#0d0d0d]">
      {/* maplibre-gl.css forces position:relative on this element, so size it
          explicitly rather than relying on absolute inset */}
      <div ref={mapContainer} className="absolute inset-0 h-full w-full" />

      {/* Header */}
      <div className="absolute left-4 top-4 z-10">
        <h1 className="pointer-events-none text-xl font-semibold tracking-tight text-white">
          Earth Pulse
        </h1>
        <p className="pointer-events-none text-sm text-[#c3c2b7]">
          The state of the planet, {metric.firstYear} to today
        </p>
        <div className="mt-1 flex gap-4">
          <a href="/planet" className="text-sm text-[#6da7ec] hover:underline">
            Planet trends →
          </a>
          <a href="/compare" className="text-sm text-[#6da7ec] hover:underline">
            Compare countries →
          </a>
        </div>
      </div>

      {/* Planet vitals */}
      <VitalsStrip vitals={vitals} />

      {/* Search */}
      <div className="absolute right-4 top-4 z-20 w-64">
        <CountrySearch countries={countries} onSelect={onSelectCountry} />
      </div>

      {/* Live layers */}
      <div className="absolute right-4 top-16 z-10 w-64">
        <Panel
          title="Live layers"
          badge={liveCount ? `${liveCount} on` : undefined}
          defaultOpen={false}
        >
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
                            cats.includes(i)
                              ? cats.filter((c) => c !== i)
                              : [...cats, i]
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
                  Every tropical cyclone since 1842. Tap a category to hide it;
                  press play to replay the seasons.
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
        </Panel>
      </div>

      {/* Metric picker */}
      <div className="absolute left-4 top-28 z-10 w-[21rem] max-w-[85vw]">
        <Panel title="Map data" defaultOpen={false} summary={legendEl}>
          <div className="max-h-[calc(100dvh-360px)] overflow-y-auto pr-1">
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
                          setYear((y) =>
                            Math.min(Math.max(y, m.firstYear), m.lastYear)
                          );
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
        </Panel>
      </div>

      {/* Live event ticker */}
      {ticker.length > 0 && (
        <button
          onClick={() => showTickerEvent(ticker[tickerI])}
          className="absolute bottom-[5.75rem] left-1/2 z-10 flex max-w-[min(600px,86vw)] -translate-x-1/2 items-center gap-2.5 rounded-full border border-white/10 bg-[#161615]/95 py-2 pl-3 pr-4 text-left backdrop-blur transition-colors hover:border-white/25"
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e34948] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#e34948]" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#e34948]">
            Live
          </span>
          <span className="truncate text-xs text-[#c3c2b7]">
            {ticker[tickerI].label}
          </span>
          <span className="shrink-0 text-[10px] tabular-nums text-[#898781]">
            {tickerI + 1}/{ticker.length}
          </span>
        </button>
      )}

      {/* Globe / flat toggle */}
      <button
        onClick={() => setGlobeOn((g) => !g)}
        className="absolute bottom-24 right-4 z-10 flex items-center gap-2 rounded-full border border-white/10 bg-[#1a1a19]/90 px-3 py-2 text-xs text-[#c3c2b7] backdrop-blur transition-colors hover:bg-[#1a1a19] hover:text-white"
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
      <div className="absolute inset-x-0 bottom-6 z-10 mx-auto w-[min(680px,92%)] rounded-xl border border-white/10 bg-[#1a1a19]/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (!playing && year >= metric.lastYear) setYear(sliderMin);
              setPlaying((p) => !p);
            }}
            aria-label={playing ? "Pause" : "Play"}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-black transition-transform hover:scale-105"
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
          <div className="w-14 shrink-0 text-right text-lg font-semibold tabular-nums text-white">
            {year}
          </div>
        </div>
        <div className="mt-1 flex justify-between text-[10px] tabular-nums text-[#898781]">
          <span>{sliderMin}</span>
          <span>{sliderMax}</span>
        </div>
      </div>

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

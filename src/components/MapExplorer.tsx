"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { NO_DATA, scaleStops, SEQUENTIAL, DIVERGING } from "@/lib/colors";
import { DOMAIN_LABELS, formatValue, type Country, type Metric, type SeriesFile } from "@/lib/types";
import type { Vitals } from "@/lib/vitals";
import { Sparkline } from "./Sparkline";
import { CountrySearch } from "./CountrySearch";
import { VitalsStrip } from "./VitalsStrip";

/** Latest full GIBS imagery day (UTC yesterday). */
function latestImageryDate(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

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
}: {
  metrics: Metric[];
  countries: Country[];
  vitals: Vitals;
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [metricId, setMetricId] = useState(metrics[0].id);
  const metric = metrics.find((m) => m.id === metricId)!;
  const [year, setYear] = useState(metric.lastYear);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const [series, setSeries] = useState<SeriesFile>({});
  const valuesRef = useRef<Record<string, number>>({});
  const paintedIso = useRef<Set<string>>(new Set());
  const [satOn, setSatOn] = useState(false);
  const [satDate, setSatDate] = useState(latestImageryDate);
  const [firesOn, setFiresOn] = useState(false);
  const [floodsOn, setFloodsOn] = useState(false);
  const [airOn, setAirOn] = useState(false);
  const [airStatus, setAirStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  // Init map once
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          { id: "bg", type: "background", paint: { "background-color": "#0d0d0d" } },
        ],
      },
      center: [10, 25],
      zoom: 1.6,
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
        paint: { "fill-color": NO_DATA, "fill-opacity": 1 },
      });
      map.addLayer({
        id: "country-borders",
        type: "line",
        source: "countries",
        paint: { "line-color": "#0d0d0d", "line-width": 0.75 },
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
    map.on("click", "country-fills", (e) => {
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
          ...scaleStops(
            metric.scaleType,
            metric.scale,
            metric.stops,
            metric.flipDiverging
          ),
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
    map.setPaintProperty("country-fills", "fill-opacity", satOn ? 0 : 1);
    map.setPaintProperty(
      "country-borders",
      "line-color",
      satOn ? "rgba(255,255,255,0.25)" : "#0d0d0d"
    );
  }, [satOn, satDate, mapReady]);

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
    for (let y = year + 1; y <= Math.min(year + 5, metric.lastYear); y++)
      fetchChoropleth(metric.id, y);
  }, [metric, year]);

  const domains = [...new Set(metrics.map((m) => m.domain))];
  const sliderMin = metric.firstYear;
  const sliderMax = metric.lastYear;

  const divergingRun = [...DIVERGING.cool, DIVERGING.mid, ...DIVERGING.warm];
  const legendColours =
    metric.scaleType === "sequential"
      ? SEQUENTIAL
      : metric.flipDiverging
        ? [...divergingRun].reverse()
        : divergingRun;

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
        <a
          href="/planet"
          className="mt-1 inline-block text-sm text-[#6da7ec] hover:underline"
        >
          Planet trends →
        </a>
      </div>

      {/* Planet vitals */}
      <VitalsStrip vitals={vitals} />

      {/* Search */}
      <div className="absolute right-4 top-4 z-20 w-64">
        <CountrySearch countries={countries} onSelect={onSelectCountry} />
      </div>

      {/* Live layers */}
      <div className="absolute right-4 top-16 z-10 w-64 rounded-xl border border-white/10 bg-[#1a1a19]/90 p-3 backdrop-blur">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#898781]">
          Live layers
        </div>
        <label className="flex cursor-pointer items-center justify-between py-1 text-sm text-[#c3c2b7]">
          <span>Satellite imagery</span>
          <input
            type="checkbox"
            checked={satOn}
            onChange={(e) => setSatOn(e.target.checked)}
            className="h-4 w-4 accent-white"
          />
        </label>
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
        <label className="flex cursor-pointer items-center justify-between py-1 text-sm text-[#c3c2b7]">
          <span>Active fires (24h)</span>
          <input
            type="checkbox"
            checked={firesOn}
            onChange={(e) => setFiresOn(e.target.checked)}
            className="h-4 w-4 accent-white"
          />
        </label>
        <label className="flex cursor-pointer items-center justify-between py-1 text-sm text-[#c3c2b7]">
          <span>River flood alerts (15 days)</span>
          <input
            type="checkbox"
            checked={floodsOn}
            onChange={(e) => setFloodsOn(e.target.checked)}
            className="h-4 w-4 accent-white"
          />
        </label>
        <label className="flex cursor-pointer items-center justify-between py-1 text-sm text-[#c3c2b7]">
          <span>Air quality now</span>
          <input
            type="checkbox"
            checked={airOn}
            onChange={(e) => setAirOn(e.target.checked)}
            className="h-4 w-4 accent-white"
          />
        </label>
        {airOn && airStatus === "loading" && (
          <p className="text-[10px] text-[#898781]">Loading stations…</p>
        )}
        {airOn && airStatus === "error" && (
          <p className="text-[10px] text-[#898781]">
            Air quality feed unavailable right now.
          </p>
        )}
        {airOn && airStatus === "ready" && (
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-[#898781]">
            {AIR_BREAKS.labels.map((l, i) => (
              <span key={l} className="flex items-center gap-1">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: AIR_BREAKS.colours[i] }}
                />
                {l} µg/m³
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Metric picker */}
      <div className="absolute left-4 top-20 z-10 max-w-xs rounded-xl border border-white/10 bg-[#1a1a19]/90 p-3 backdrop-blur">
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
        {/* Legend */}
        <div className="mt-2">
          <div className="flex h-2 overflow-hidden rounded-full">
            {legendColours.map((c) => (
              <div key={c} className="h-full flex-1" style={{ background: c }} />
            ))}
          </div>
          <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-[#898781]">
            <span>
              {metric.scale[0]}
            </span>
            <span>{metric.unit}</span>
            <span>{metric.scale[1]}+</span>
          </div>
        </div>
      </div>

      {/* Time slider */}
      <div className="absolute inset-x-0 bottom-6 z-10 mx-auto w-[min(680px,92%)] rounded-xl border border-white/10 bg-[#1a1a19]/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (!playing && year >= metric.lastYear) setYear(sliderMin);
              setPlaying((p) => !p);
            }}
            aria-label={playing ? "Pause" : "Play"}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-black"
          >
            {playing ? "❚❚" : "▶"}
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

# Lessons

Corrections and patterns to remember for this project. Reviewed at session start.

- **maplibre-gl.css overrides Tailwind positioning.** `.maplibregl-map` sets
  `position: relative`, which silently defeats `absolute inset-0` sizing and
  collapses the container to 0 height with no error anywhere. Always size the
  map container explicitly (`h-full w-full`). Symptom: map "renders" (query
  APIs return features) but nothing is visible.
- **The Browser pane screenshot cannot always capture WebGL canvases.** A
  blank-looking map is not proof of a broken map: verify via
  `map.queryRenderedFeatures()` or `canvas.toDataURL()` overlaid as a DOM
  image before debugging the wrong thing.
- **Ingest outputs must never be ingest inputs.** The merged countries.json
  once fed back into the next run and marked every country `on_map=true`.
  Keep derived files and source-of-truth files separate
  (map-countries.json vs countries.json).
- **OWID grapher CSV headers are lowercase** (entity,code,year) while the big
  curated datasets use country/iso_code/year. Match case-insensitively.
- **Check the actual dataset before writing attribution.** The
  annual-temperature-anomalies grapher is Copernicus ERA5 (1940+, 1991-2020
  baseline), not Berkeley Earth as assumed from the metric name.
- **Suomi NPP (SNPP) is retired (2026).** FIRMS VIIRS_SNPP feeds return empty
  data with 200s and no errors. Use NOAA-20 + NOAA-21 layers for fires. The
  GIBS SNPP imagery layer still serves true-colour tiles, but prefer the
  NOAA satellites where freshness matters.
- **Browser-pane WebGL screenshots show stale frames.** After any layer
  change, run map.triggerRepaint() immediately before the screenshot or the
  capture shows the previous frame (or black). Layers were "invisible" twice
  for this reason while rendering perfectly.
- **NASA GISS 403s Node's default user agent.** Send a real User-Agent on all
  agency fetches (vitals.ts does).
- **Never deploy without Tim's express permission** (13 Jul 2026). Do not
  chain `vercel deploy` / alias changes onto build or commit commands. Local
  builds and git commits are fine; anything public-facing needs a fresh,
  explicit yes each time.
- **Restart the dev server after bulk python edits to big components.** Fast
  Refresh served a stale MapExplorer twice (toggles set state but effects
  never ran). preview_stop + preview_start guarantees a fresh compile.
- **queryRenderedFeatures/querySourceFeatures return 0 in a backgrounded
  Browser pane** (tile loading is rAF-throttled). The screenshot after a
  repaint is the reliable verification, not the query APIs.
- **Track lines crossing the antimeridian must use unwrapped longitudes**
  (continue past ±180), or MapLibre draws a straight band around the planet.
- **In-app Browser downscales screenshots to ~800px** when the viewport is
  wider, and click coordinates then map to neither screenshot nor viewport
  pixels reliably. To click small map features (event dots), resize_window to
  width <=800 (e.g. 760) so canvas width == screenshot width, then click the
  map.project() canvas pixel directly. Cost me a long detour in Phase 7.5.
- **A long-lived reused Browser tab accumulates HMR patches** that corrupt
  React hook dependency arrays ("The final argument passed to useEffect
  changed size between renders"), which silently breaks the map init effect
  (click handlers never register). A production build never sees this. For a
  clean verify, open a FRESH tab (tabs_create) rather than reusing the seed tab.
- **MapLibre globe pixel radius = worldSize/2pi x sec(centre latitude).** The
  projection matches mercator scale at the centre lat, so the sphere grows
  toward the poles. Any screen-space overlay tracking the globe's limb must
  use sec(lat) and listen to move (not just zoom). See globePixelRadius().
- **Heatmap KDE runs in mercator space, not screen space.** A fixed
  heatmap-radius cannot blend a regular lat/lon grid near the poles (rows
  stretch apart) and renders as concentric rings. heatmap-radius accepts
  data-driven expressions: scale per-point by sec(lat) (capped) to smooth.
- **Canvas overlays must do their first paint unconditionally.** Gating all
  drawing on !document.hidden means the embedded Browser pane (hidden=true
  always) and freshly backgrounded tabs show a blank canvas. Paint once
  synchronously, then let rAF handle animation only.
- **The map "load" event can lag many seconds behind first render** when GIBS
  tiles are slow. Overlays that must track the globe from the first frame
  need the map object at creation time (setMapObj in init), not at load.
- **The embedded Browser pane can stop firing rAF entirely** (0 callbacks in
  seconds), not just throttle it. Anything that must render at least once
  needs a synchronous first paint plus a change-event fallback that snaps
  when the loop is stalled (see SkySimulator's sky-repaint listener).
- **Layer-scoped map click handlers are unreliable in the embedded pane**
  (they depend on queryRenderedFeatures, which returns empty while tiles are
  rAF-throttled). Retry after isStyleLoaded() is true, or verify via a
  fallback path. In real browsers they are fine.
- **The idle globe spin makes project-then-click flaky in verification**:
  bump activity (hover) first, then project and click back to back.

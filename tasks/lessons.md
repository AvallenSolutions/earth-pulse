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

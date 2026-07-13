# Earth Pulse — Task Tracker

Full plan: [PLAN.md](../PLAN.md).

## Phase 0 — Foundations ✅ (13 Jul 2026)
- [x] Scaffold Next.js + TypeScript + Tailwind + MapLibre + Supabase
- [x] Countries reference table (ISO3) + Natural Earth boundaries (177 on map, 250 total)
- [x] Metrics registry + observations schema; migration 0001 applied to the
      earth_pulse schema in the shared alkatera-lca-verifier Supabase project
- [x] Countries + metrics seeded in DB
- [x] Register Phase 2 API keys (NASA FIRMS, OpenAQ) — in .env.local
- [ ] Bulk-load observations into DB (app runs fully on static JSON; load when
      a feature actually needs DB queries)

## Phase 1 — Historical core ✅ (13 Jul 2026)
- [x] Ingest OWID CO2 (1750+), OWID Energy (1965+), ERA5 temperature (1940+),
      PM2.5 (1998+) — 7 metrics, ~4.6MB static JSON
- [x] Static choropleth JSON per metric-year + per-metric series files
- [x] Map explorer: dark flat-boundary map (no external tiles), metric picker
      grouped by domain, explainer + source + legend
- [x] Non-linear colour stops for skewed metrics (CO2, energy per person)
- [x] Annual time slider with play/animate, per-metric year bounds
- [x] Hover tooltip with value + full-history sparkline
- [x] Country search with keyboard navigation
- [x] Country deep-dive pages with SVG line charts, crosshair hover, source
      attribution (verified in browser: map, tooltip, Brazil page, search)
- [ ] Shareable URL state (?metric=&year=) on the map
- [ ] OG images for social sharing

## Phase 2 — Live pulse ✅ (13 Jul 2026)
- [x] Planet vitals strip: Mauna Loa CO2 (weekly, 429 ppm), GISTEMP (+1.18°C
      Jun 2026), NSIDC Arctic sea ice (-17.6% vs 1981-2010); ISR 6h, fail-soft
- [x] FIRMS active fires layer (NOAA-20 + NOAA-21 VIIRS; SNPP retired) via
      key-hiding proxy /api/fires, 30 min edge cache
- [x] OpenAQ air quality layer: ~10k stations deduped, /api/air proxy, 1h
      cache, WHO-breakpoint status colours + legend
- [x] NASA GIBS satellite imagery (keyless) with date picker back to 2012
- [x] All verified in browser (satellite + fires + air simultaneously)

## Phase 3 — Water ✅ (13 Jul 2026)
- [x] Five water metrics in the historical tier: water stress (SDG 6.4.2),
      renewable water per person, safely managed drinking water, annual
      precipitation (ERA5, 1940+), and a derived rainfall anomaly vs
      1961-1990 (the drought/deluge signal; ingest now supports derived
      metrics and flipped diverging scales)
- [x] Copernicus GloFAS river flood alerts (days 1-15) as a live layer via
      cached proxy /api/floods
- [x] Verified in browser: 2024 shows the Amazon + southern Africa droughts
- [ ] Copernicus GDO drought indicator layer: BLOCKED — the relocated
      service (drought.emergency.copernicus.eu) rejects unauthenticated WMS
      GetMap. Revisit; SPEI NetCDF country aggregation is the fallback.

## Phase 4 — Ice, oceans, land & life
- [ ] Sea level, ocean heat, glaciers, GFW forest loss, disasters, methane

## Phase 5 — Polish & launch
- [ ] Explainer copy pass, accessibility, mobile, SEO, monitoring, deploy

## Review
- Phase 0+1 built 13 Jul 2026. Decisions along the way:
  - No basemap tiles: flat Natural Earth boundaries on a dark surface. Zero
    external dependencies; GIBS arrives in Phase 2 for satellite imagery.
  - DB reuses alkatera-lca-verifier project (earth_pulse schema) to stay at £0
    after discovering a new Supabase project costs $10/mo.
  - Temperature data is ERA5 (1940+, 1991-2020 baseline), not Berkeley Earth;
    a Berkeley ingest (1750+) is a possible later upgrade.
  - maplibre-gl.css overrides `position: absolute` on the map container; size
    it explicitly (see lessons.md).

## Open questions
1. Domain name (working title: Earth Pulse)
2. alkatera-branded or independent? (affects Vercel Hobby vs Pro at deploy)
3. Include per-country "what can I do" actions?

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

## Phase 4 — Ice, oceans, land & life ✅ (13 Jul 2026)
- [x] Country metrics: methane (1850+), tree cover loss (GFW, 2001+), forest
      area share (1990+), disaster deaths (IHME, 2000+)
- [x] Global metrics with new `global` flag + /planet trends page: sea level
      (1880+), ocean heat top 2000m (1957+), Greenland + Antarctica ice sheet
      mass (NASA GRACE, 2002+); ingest gained daily->annual aggregation
- [x] Verified in browser: map picker (5 domains, 16 metrics), planet page,
      Brazil country page
- [ ] Glacier mass balance (WGMS): no OWID grapher found; needs direct WGMS
      ingest if wanted
- [ ] Living Planet Index: regional only, does not fit country model; skipped

## Phase 5 — Polish & launch ✅ LAUNCHED (13 Jul 2026)
- [x] Globe projection with atmosphere + space sky; globe/flat toggle
- [x] Visual pass: deep ocean navy, hover glow, gradient legend, SVG
      play/pause icons, vitals trend arrows (red worsening / green improving)
- [x] Shareable URL state (?metric=&year=&view=)
- [x] Country OG share images (next/og); sitemap.xml + robots.txt
- [x] "What can one person do" actions card on country pages
- [x] DEPLOYED public: https://earth-pulse-alkatera.vercel.app
      (avallen-solutions team, SSO protection off, FIRMS/OpenAQ/SITE_URL
      env vars set on production)
- [ ] Explainer copy pass (content-writer), formal accessibility audit
- [ ] Ingest freshness monitoring / weekly cron
- [ ] Custom domain if wanted (earth-pulse.vercel.app is another account's)

## Phase 6 — God's Eye (13 Jul 2026, built, NOT yet deployed)
- [x] IBTrACS storm tracks: 12,989 cyclones, 178 seasons (1842-2025), 6.2MB
      static per-year files; layer follows the year slider = 4D replay
- [x] Storm click popups (category, peak winds, Wikipedia/news links)
- [x] Live event ticker (Red/Orange alerts + M4.8+ quakes), click to fly
- [x] Idle globe rotation after 12s without input
- [x] UI tidy: collapsible Panel component; metric picker collapses to
      active metric + legend; live layers panel redesigned with dot rows,
      inline legends and an "N on" badge
- [x] Antimeridian fix: storm tracks unwrap longitudes (no more global bands)
- [x] Storm category filter chips (tap to hide TD/TS/Cat1-5)
- [x] Earthquake history layer: USGS archive, 14,494 M6+ quakes/year files
      (1900-2026, 2.7MB), click popups with dates
- [x] Disaster history layer: GDACS archive, 1,027 events (2000-2026, 272KB;
      floods throughout, wildfires only from ~2022), click popups
- [x] Layers panel split into "Live now" / "History · follows the year slider"
- [x] FUTURES: CMIP6 temperature projections per country (191 countries,
      2026-2100, 3 scenarios: SSP1-2.6/SSP2-4.5/SSP5-8.5) via World Bank
      CCKP, delta-method anchored to observed ERA5 2015-2024; map slider
      extends to 2100 with scenario chips + projected badge; country pages
      get "The future under three scenarios" fan chart; scenario in URL
- [ ] Futures for more fields (published sources only): WRI Aqueduct water
      stress (2030/50/80), CCKP precipitation, curated IPCC global tables
      (sea level, warming), OECD plastics; energy/EVs regional (IEA);
      no credible free per-country source for forest loss/Red List/PM2.5
- [ ] DEPLOY: awaiting Tim's express permission

## Review
- Phases 0-5 built and launched 13 Jul 2026. Decisions along the way:
  - No basemap tiles: flat Natural Earth boundaries on a dark surface. Zero
    external dependencies; GIBS arrives in Phase 2 for satellite imagery.
  - DB reuses alkatera-lca-verifier project (earth_pulse schema) to stay at £0
    after discovering a new Supabase project costs $10/mo.
  - Temperature data is ERA5 (1940+, 1991-2020 baseline), not Berkeley Earth;
    a Berkeley ingest (1750+) is a possible later upgrade.
  - maplibre-gl.css overrides `position: absolute` on the map container; size
    it explicitly (see lessons.md).

## Resolved questions (Tim, 13 Jul 2026)
1. Name/URL: Earth Pulse, live at earth-pulse-alkatera.vercel.app
2. Independent tool (not alkatera-branded on the site itself)
3. "What can one person do" actions: yes, added to country pages

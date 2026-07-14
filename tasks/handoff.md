# Handoff: Earth Pulse — global climate & environment dashboard
Updated: 2026-07-14 14:00 | Branch: main | Worktree: main (~/Documents/GitHub/earth-pulse) | Dev port: 3300

## Session 14 Jul: Phase 7 (plan: ~/.claude/plans/please-write-a-plan-replicated-lantern.md)
- iPad stability FIXED and committed: drawer backdrop-blur over WebGL removed,
  visibilitychange repaint added (887c1a3).
- 7.1 DONE (0ab6f1d): weekly refresh workflow, client polling (ticker+quakes
  2min, disasters 10min, air 30min, visibility-aware), freshness stamps in UI.
  BLOCKED on Tim: `gh repo create AvallenSolutions/earth-pulse --private
  --source . --push` (classifier refuses) + add VERCEL_TOKEN repo secret.
- 7.2 DONE (c5e0978): 8 new metrics (consumption CO2, aviation, oil/gas elec,
  sanitation, marine protected, ozone substances, urban share; waste + air
  pollution deaths rejected, non-redistributable), Stripes.tsx, MoversPanel.tsx.
- 7.3 DONE (fd46c3b): ingest-monthly.ts (CCKP ERA5 observed, NOT Open-Meteo),
  monthly temp/precip anomalies 1950-2024, Monthly toggle + month play on the
  map slider. Verified: GBR 2018 heatwave/BftE, PAK Jul 2022 +156%.
- NEXT: 7.4 futures (CCKP pr projections, Aqueduct water stress, IPCC sea
  level fan on /planet), 7.5 live layers (NHC cones, GVP volcanoes, SWPC
  aurora), 7.6 story mode + animated events. Not deployed; deploy needs Tim.

## Goal
A free, public awareness dashboard for global climate/environment data: an interactive world
map (globe or flat) with a time slider back to 1750 and forward to 2100, live real-time
layers, per-country deep-dive pages, country comparison, and published future projections.
Map-first, free-tier only, British English, no em dashes. LIVE at
https://earth-pulse-alkatera.vercel.app (deployed = commit 30a90c3, in sync with main).

## Done (verified in browser + deployed)
- Map explorer: MapLibre globe + flat toggle, NASA Blue Marble terrain, per-domain colour
  ramps (src/lib/colors.ts), time slider with play, hover tooltips, idle globe spin.
- 27 country metrics + 3 global metrics (static JSON in public/data, ingested via scripts/).
- 6 live layers: satellite (GIBS), fires (FIRMS NOAA-20/21), floods (GloFAS), air quality
  (OpenAQ), earthquakes (USGS), disaster alerts (GDACS). All proxied via /api/* routes.
- 3 history layers following the year slider: storm tracks (IBTrACS 1842-2025, category
  filter chips), M6+ quakes (USGS 1900+), disasters (GDACS 2000+). Clickable popups.
- Futures: CMIP6 temperature projections 2026-2100, 3 scenarios (SSP1-2.6/2-4.5/5-8.5) via
  World Bank CCKP, delta-method anchored to ERA5. Map slider extends to 2100 + scenario
  chips; country pages show a scenario fan chart.
- News-crawl event ticker (bottom), clickable vitals cards -> full-history modals (Keeling
  curve 1958+, GISTEMP 1880+, NSIDC sea-ice minimum 1979+), daily CO2.
- Country pages v2 (stat hero, ranks, deltas, world overlays, futures, neighbours),
  /planet trends, /compare two countries, OG images, sitemap/robots.
- Mobile: burger drawer holds all controls; map stays clear. Desktop unchanged (lg: split).
  Verified at 375px and 1300px.

## Done (unverified / caveats)
- The browser preview pane is only ~800px wide and DPR 2; true desktop (>=1024) was checked
  at 1300px via resize but not exhaustively. WebGL screenshots often show a black globe until
  map.triggerRepaint() — that is a capture artifact, the map paints fine.
- Copernicus GDO drought WMS is auth-blocked (not used). No pre-2000 located flood/wildfire
  source (EM-DAT forbids redistribution) — history disasters start 2000, wildfires ~2022.

## In flight
- Nothing mid-edit. Working tree clean at commit 30a90c3. Session ended after deploying the
  mobile burger-menu work and re-pointing the alias.

## Next (candidate directions, not yet started)
1. Content-writer pass over all metric explainers (British English, plain language).
2. More futures from published sources: CCKP precipitation, WRI Aqueduct water stress, IPCC
   global tables (sea level, warming) on /planet.
3. More metrics (each ~30 min via scripts/lib/registry.ts + ingest-owid.ts): oil/gas
   electricity, consumption-based CO2, aviation, marine protected areas, sanitation.
4. Monthly-resolution data (temperature, sea ice) to turn the year slider into a month slider.
5. Accessibility audit; weekly ingest-freshness cron.

## Gotchas and decisions
- NEVER deploy without Tim's express permission (per-deploy, not per-session). Do NOT chain
  `vercel deploy` onto build/commit. See memory no-deploy-without-permission.md.
- Deploy flow (Vercel team = avallen-solutions): `vercel deploy --prod --yes`, wait for
  Ready, then `vercel alias set <deployment-url> earth-pulse-alkatera.vercel.app`. The alias
  does NOT move automatically. earth-pulse.vercel.app is another account's — we use -alkatera.
- GitHub repo does NOT exist yet: `gh repo create AvallenSolutions/earth-pulse --private
  --source . --push` was blocked by the permission classifier. Tim to run it or approve.
- DB: earth_pulse schema inside the shared alkatera-lca-verifier Supabase project
  (goriowvxkvmizwtenpju), because a new project costs $10/mo. Migrations via Supabase MCP.
  App runs entirely on static JSON; DB holds countries+metrics only.
- After bulk edits to MapExplorer.tsx, RESTART the dev server (preview_stop + preview_start);
  Fast Refresh serves stale bundles (toggles set state but effects never run). See lessons.md.
- Storm tracks must use unwrapped longitudes (>±180) or MapLibre draws a band round the planet.
- NASA GISS 403s Node's default UA; vitals.ts sends a real User-Agent. SNPP satellite retired.
- Data pipeline: scripts/ downloads to data/raw/ (gitignored), writes static JSON to
  public/data/. Re-run: build-boundaries, ingest-owid, ingest-storms, ingest-quakes-history,
  ingest-disasters-history, ingest-projections. Registry: scripts/lib/registry.ts.

## Pending Tim actions
- Optional: create the GitHub remote (command above) — code is committed locally only.
- Answer when relevant: content-writer pass vs more data vs monthly resolution as next focus.
- API keys already set on Vercel production: NASA_FIRMS_KEY, OPENAQ_API_KEY,
  NEXT_PUBLIC_SITE_URL. In local .env.local too.

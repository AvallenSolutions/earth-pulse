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

## Phase 7 — Next level of data + 5 improvements (approved 14 Jul 2026)
Full plan: ~/.claude/plans/please-write-a-plan-replicated-lantern.md

### 7.1 Always-fresh data (foundation)
- [ ] Create GitHub repo (AvallenSolutions/earth-pulse, private) and push —
      BLOCKED on Tim: permission classifier stops the agent running
      `gh repo create AvallenSolutions/earth-pulse --private --source . --push`
- [ ] Tim: add VERCEL_TOKEN secret to the repo once it exists
- [x] Weekly refresh cron: .github/workflows/refresh-data.yml (ingest, commit,
      deploy via Vercel CLI + alias move; org/project IDs baked in)
- [x] Client polling in MapExplorer: ticker + quakes 2 min, disasters 10 min,
      air 30 min; visibility-aware (verified: poll fires when visible,
      suppressed when document.hidden)
- [x] Freshness stamps: freshness.json written by all 5 ingest scripts;
      "as of HH:MM" on Live layers (drawer + desktop badge); "Historical data
      updated X ago" in drawer + /planet footer (verified in browser at
      375/768/desktop)

### 7.2 Metrics batch + stripes + movers ✅ (14 Jul 2026)
- [x] 8 new registry metrics: consumption CO2, aviation per person, oil
      electricity, gas electricity, sanitation, marine protected areas,
      ozone-depleting substances, urban population. (Air pollution deaths and
      municipal waste REJECTED: OWID flags them non-redistributable, no CSV.)
- [x] Stripes.tsx: warming stripes on country pages + /planet (verified: Brazil,
      world)
- [x] MoversPanel.tsx: biggest rises/falls per metric, neutral wording, on
      /planet + desktop map column + drawer (verified with renewables + CO2 pp)

### 7.3 Monthly resolution + month slider ✅ (14 Jul 2026)
- [x] ingest-monthly.ts: observed ERA5 monthly per country via World Bank CCKP
      (NOT Open-Meteo: CCKP gives proper country means, same portal as our
      CMIP6 futures). temperature_anomaly (°C) + precip_anomaly (%) vs that
      month's own 1991-2020 mean; 244 countries, 1950-2024, 2.9MB.
      monthly/<metric>/<year>.json = {iso3: [12]}, plus index.json per metric.
- [x] Month slider: self-discovering "Monthly" chip (index.json 404 = annual
      only), month scrubbing, play steps months and holds at Dec of the final
      year, monthly unit line. Verified: GBR Jul 2018 +1.98 / Feb 2018 -1.86
      (Beast from the East), PAK Jul 2022 +156% (flood monsoon).
- [ ] Later: NSIDC monthly sea ice + NOAA monthly CO2 (global series, /planet)

### 7.4 More futures to 2100 (2 of 3 done, 14 Jul 2026)
- [x] CCKP precipitation projections: ingest-projections.ts is now
      variable-generic (tas + pr), delta method vs observed precipitation,
      190 countries x 3 scenarios to 2100, floor at 0mm; precipitation added
      to the PROJECTIONS map (verified on the map at 2080)
- [x] IPCC AR6 sea level fan chart on /planet: curated Table 9.9 medians
      (public/data/planet/sealevel-projections.json, verified against the
      chapter executive summary + EEA), observed record + 3 dashed scenarios
- [ ] WRI Aqueduct water stress 2030/50/80: needs source discovery for the
      country-level futures CSV (ingest-aqueduct.ts, slider snaps to horizons)

### 7.5 New live layers ✅ (14 Jul 2026)
- [x] /api/aurora: NOAA SWPC OVATION oval (30 min cache); heatmap glow near
      the poles. Verified: green aurora oval across the Arctic.
- [x] /api/volcanoes: Smithsonian GVP recent+ongoing eruptions (6 h cache);
      circle layer, erupting-now vs recent styling, popup with VEI + dates +
      GVP link. Verified: full Ring of Fire renders; Marapi popup (ERUPTING,
      VEI 2, started 2023-12-03).
- [x] /api/hurricanes: NHC active storms (15 min cache); current position +
      strength + movement, popup with advisory link, graceful empty out of
      season (verified 0 storms in July). Forecast CONE/track deferred: NHC
      only ships those as shapefile/KMZ zips, disproportionate for a free-tier
      proxy; documented in the route.

### 7.6 Story mode + animated events ✅ (14 Jul 2026)
- [x] stories.ts + StoryPlayer.tsx: three guided tours (CO2 since 1750, century
      of storms, three futures); ?story= deep links; reduced-motion safe.
      Story chips in desktop header + Stories section in mobile drawer.
      StoryPlayer card: title, caption, progress dots, prev/play/next/close.
      Drives metric, year, scenario, storm layer and map flyTo from config.
- [x] Animated events: storm tracks fade in on year change during play (draw-on
      feel); quake pulse ring on M7+ events when year changes; fires raster
      glow-breathing. All gated on prefers-reduced-motion; rAF pauses on
      document.hidden.
- [x] Starfield background: canvas above WebGL, mix-blend-mode:screen so stars
      appear only in dark space (invisible on bright globe). 220 stars, 8
      twinkling (rAF sine wave). ResizeObserver + screen.width fallback for
      headless environments.

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

## Phase 7.7 — Visual overhaul ✅ (16 Jul 2026)
Requested: full visual improvement covering the background, the globe, the
aurora, and major cities.
- [x] Hyper-realistic night sky: Starfield rewrite (DPR-aware, area-scaled
      star count, power-law magnitudes, temperature-based star colours, Milky
      Way band with dust lanes, halo on the brightest stars, resize rebuild)
- [x] Stars no longer show through the globe: the planet's disc is masked out
      of the sky canvas (radius = worldSize/2pi x sec(lat), tracks zoom/pan)
- [x] Globe atmosphere: GlobeAtmosphere canvas limb glow + halo that tracks
      the globe's radius and fades as the limb leaves the viewport; deeper
      sky colours; retuned Blue Marble raster
- [x] Real-looking aurora: violet fringe + green body + bright core heatmap
      stack, per-point radius scaled by sec(lat) so the OVATION grid blends
      smoothly (no rings), slow multi-sine shimmer (reduced-motion safe)
- [x] Major cities: scripts/build-cities.ts -> public/data/cities.json (789
      cities, 3 tiers, 200 capitals); amber dots + labels revealed by zoom;
      click popup with population, capital badge, country + Wikipedia + news
      links; "Major cities" toggle (default on) in the layers panel
- [x] Verified in browser: choropleth intact, city popup (Cairo), aurora over
      the Arctic, flat-map fallback, tsc + production build clean

### Review notes (Phase 7.7)
- MapLibre globe pixel radius is worldSize/2pi x sec(centre lat); shared via
  globePixelRadius() in GlobeAtmosphere.tsx, used by the star mask too.
- Heatmap KDE happens in mercator space: fixed pixel radii leave the 1-degree
  OVATION grid as concentric rings near the poles. Fixed with per-point
  data-driven heatmap-radius scaled by sec(lat) (capped at 14).
- Starfield hides entirely on the flat projection (map covers the viewport).

## Phase 7.8 — Light pollution: "The vanishing night" ✅ (16 Jul 2026)
- [x] src/lib/sky.ts: Lorenz atlas decoder (browser + Node), Schaefer NELM,
      Hipparcos star counts, plain-English bands, feature-loss thresholds
- [x] scripts/build-sky-quality.ts: 789 cities x 5 years (2016-2024) decoded
      from cached atlas tiles; mpsas baked into cities.json (2024) and
      sky-quality.json (36 KB series). London 17.4 / Tokyo 17.2 spot-checked
      against the source atlas
- [x] SkySimulator.tsx: full-screen canvas sky (honest magnitudes, Milky Way,
      skyglow dome, silhouette with windows that light up), rtl slider with
      band labels, star counter, feature checklist, per-city year chips with
      a stars-lost delta line, reduced-motion + rAF-stall fallbacks
- [x] Earth at Night layer (GIBS Black Marble, mutually exclusive with
      satellite imagery) + "The vanishing night" story (5 steps)
- [x] Popups: city Night sky row + "See what light pollution does" button;
      click-anywhere sky popup (in-browser tile decode, native gunzip); land
      clicks show sky in night mode; polar out-of-coverage message
- [x] Verified in browser (pristine vs inner-city skies, Tokyo popup + year
      chips, Black Marble Europe/Japan, night-mode land click, Svalbard
      message, story run); tsc + production build clean

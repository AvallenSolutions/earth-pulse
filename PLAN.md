# Earth Pulse: Global Climate & Environment Dashboard — Master Plan

**Status:** Plan approved for review, no build started
**Date:** 13 July 2026
**Owner:** Tim Etherington-Judge

---

## 1. Vision

A free, public awareness tool that lets anyone explore the state of the planet: an interactive world map as the hero, with a time slider reaching back 50+ years, layering near-real-time signals (fires, air quality, drought) over deep historical records (emissions, temperature, energy, water). Search any country, scrub through time, and understand what has changed and what is changing right now.

**Design principles**
- Storytelling matters as much as data: every metric gets a one-line "why this matters" explanation
- Zero paywalls, zero logins, fast on mobile
- Every number links to its source; credibility is the product
- Free-tier infrastructure throughout; graceful degradation if a live feed is down

---

## 2. Metric domains and data sources

All sources below are publicly available at no cost (some need a free API key). "History" = how far back country-level data goes.

### 2.1 Climate (temperature & greenhouse gases)

| Metric | Source | History | Freshness | Access |
|---|---|---|---|---|
| Country temperature anomaly | Berkeley Earth (country files) | 1750s+ | Monthly | Free CSV downloads |
| Global temperature anomaly | NASA GISTEMP | 1880+ | Monthly | Free CSV |
| CO2 emissions per country | Our World in Data / Global Carbon Project | 1750+ | Annual | Free CSV + API (chart grapher API) |
| All-GHG emissions (CH4, N2O) | OWID / PRIMAP-hist | 1850+ | Annual | Free CSV |
| Atmospheric CO2 (the "heartbeat") | NOAA Mauna Loa | 1958+ | Daily/weekly | Free CSV/JSON |
| Atmospheric methane | NOAA GML | 1983+ | Monthly | Free CSV |

### 2.2 Energy

| Metric | Source | History | Freshness | Access |
|---|---|---|---|---|
| Energy mix per country (coal/oil/gas/nuclear/renewables) | OWID Energy dataset (Energy Institute Statistical Review + Ember) | 1965+ | Annual | Free CSV, single harmonised file |
| Monthly electricity generation by fuel | Ember Data API | 2015+ | Monthly | Free API key |
| Renewable capacity | IRENA | 2000+ | Annual | Free downloads |

### 2.3 Water: droughts & floods

| Metric | Source | History | Freshness | Access |
|---|---|---|---|---|
| Drought index (SPEI) global gridded | SPEI Global Drought Monitor / CSIC | 1955+ | Monthly | Free NetCDF/web |
| Drought & flood alerts | Copernicus Emergency (GDO drought, GloFAS floods) | ~20 yrs | Daily/near-real-time | Free, open Copernicus licence |
| Water stress per country | WRI Aqueduct | Current + projections | Static | Free download |
| Renewable water resources & withdrawals | FAO AQUASTAT | 1960s+ | Annual | Free API/CSV |
| Precipitation anomaly per country | Copernicus ERA5 via Open-Meteo Climate API | 1940+ | Daily reanalysis | Free non-commercial API, no key |

### 2.4 Pollution

| Metric | Source | History | Freshness | Access |
|---|---|---|---|---|
| Live air quality (PM2.5, NO2, O3) station-level | OpenAQ | ~2016+ | Near-real-time | Free API key |
| Live city AQI (fallback/coverage) | WAQI | Live only | Near-real-time | Free token |
| Historical PM2.5 exposure per country | OWID (van Donkelaar satellite-derived) + WHO | 1990+ | Annual | Free CSV |
| Air pollution deaths | OWID / IHME Global Burden of Disease | 1990+ | Annual | Free CSV |
| Ocean plastic inputs | OWID / Meijer et al. | Snapshot | Static | Free CSV |

### 2.5 Cryosphere & oceans

| Metric | Source | History | Freshness | Access |
|---|---|---|---|---|
| Arctic/Antarctic sea ice extent | NSIDC Sea Ice Index | 1979+ | Daily | Free CSV/JSON |
| Global mean sea level | NASA (satellite altimetry) + PSMSL tide gauges | 1993+ (satellite), 1880+ (gauges) | ~Monthly | Free CSV |
| Ocean heat content | NOAA NCEI | 1955+ | Quarterly | Free CSV |
| Glacier mass balance | WGMS | 1950+ | Annual | Free download |

### 2.6 Land & life

| Metric | Source | History | Freshness | Access |
|---|---|---|---|---|
| Tree cover loss per country | Global Forest Watch (Hansen/UMD) | 2001+ | Annual + weekly alerts | Free API key |
| Long-run forest area | FAO Forest Resources Assessment | 1990+ | 5-yearly | Free CSV |
| Active fires (satellite) | NASA FIRMS (VIIRS/MODIS) | 2000+ archive | Every ~3 hours | Free API key |
| Living Planet Index (wildlife populations) | WWF/ZSL | 1970+ | Annual report | Free download |
| Natural disaster counts/impacts | OWID (from EM-DAT) | 1900+ | Annual | Free CSV via OWID (EM-DAT direct has licence restrictions — use OWID's republication) |

### 2.7 Satellite imagery layers (the "wow" layer)

| Layer | Source | Notes |
|---|---|---|
| True-colour daily earth imagery | NASA GIBS (Worldview tiles) | Free WMTS/XYZ tile endpoints, no key, can overlay directly on the map with time dimension back to 2000 |
| Night lights, fires, aerosol, snow cover | NASA GIBS | Same endpoint family, hundreds of layers |

**Backbone strategy:** Our World in Data is the harmonised backbone for annual country data (one consistent country/ISO-code scheme, well-documented, free JSON API per chart). Specialist sources (FIRMS, OpenAQ, NSIDC, GIBS, Copernicus) provide the real-time layers on top.

---

## 3. Product design

### 3.1 Primary interface: the map explorer

- Full-screen interactive world map (choropleth), metric picker grouped by domain (Climate / Energy / Water / Pollution / Ice & Oceans / Land & Life)
- **Time slider** along the bottom: scrub from 1970 (or earliest available) to today; press play to animate. Slider adapts to the metric's native resolution (annual, monthly, daily)
- **Live layers** toggle: active fires (points), air quality stations (dots coloured by AQI), drought/flood alerts, satellite imagery (GIBS) with a date picker
- Hover a country: tooltip with current value + sparkline of its full history
- A persistent "planet vitals" strip: atmospheric CO2 today, global temp anomaly, Arctic sea ice vs average — the heartbeat numbers

### 3.2 Country deep-dive pages

- Click a country or use the search box (country name, fuzzy)
- URL-addressable: `/country/kenya?metric=co2&from=1970&to=2025` — every view shareable
- Charts across all domains for that country, each with source attribution and a "compare with…" second-country overlay
- Auto-generated headline facts ("Kenya's CO2 per capita is 1/30th of the USA's")

### 3.3 Time model

- Annual metrics: year slider, 1970 → latest (data back to 1750 where it exists — exceed the 50-year brief wherever the source allows)
- Monthly metrics (temperature anomaly, sea ice, Mauna Loa): month granularity
- Live layers: "now" with a 24h–7 day window
- Consistent temporal query interface in the API: `?date=1987` or `?date=2026-07` or `?window=24h`

### 3.4 Accessibility & storytelling

- Colour-blind-safe palettes (follow the dataviz skill), dark/light themes
- Each metric has a plain-English explainer card: what it is, why it matters, source, caveats
- OG-image generation per view for social sharing (awareness tool = shareability is a feature)

---

## 4. Architecture

**Stack:** Next.js (App Router) on Vercel + Supabase Postgres + MapLibre GL JS. All free-tier.

```
┌────────────────────────────────────────────────────────┐
│  Next.js on Vercel                                     │
│                                                        │
│  Map explorer (MapLibre GL + free vector basemap)      │
│  Country pages (ISR, revalidated daily)                │
│  API routes:                                           │
│   /api/metrics/[metric]?country=&from=&to=  ──► Supabase
│   /api/live/[layer]   ──► proxy + cache ──► FIRMS/OpenAQ/
│                                             NSIDC/GloFAS
│  Vercel Cron:                                          │
│   daily   → refresh live-ish aggregates (ice, CO2 ppm) │
│   weekly  → check OWID/Berkeley for dataset updates    │
└────────────────────────────────────────────────────────┘
                          │
                ┌─────────▼─────────┐
                │ Supabase Postgres │
                │  countries (ISO)  │
                │  metrics registry │
                │  observations     │
                │  (long/narrow     │
                │   format)         │
                └───────────────────┘
```

### Key decisions

1. **Two-tier data strategy.**
   - *Historical tier:* annual/monthly country data ingested into Supabase in a single narrow `observations` table (`country_iso, metric_id, date, value`). Ingested by ETL scripts run locally/CI plus a weekly Vercel cron freshness check. This is small data — a few million rows at most, comfortably inside Supabase free tier (500 MB).
   - *Live tier:* never stored, always proxied. API routes fetch FIRMS/OpenAQ/GIBS/GloFAS on demand with Vercel's cache (`s-maxage` 5–60 min depending on layer). This keeps us inside every provider's free quota and Supabase's storage limit.

2. **MapLibre GL JS + OpenFreeMap basemap.** Both completely free, no token, no usage cap. Country polygons from Natural Earth (bundled as static GeoJSON/vector tiles). Avoids Mapbox/Google billing entirely.

3. **NASA GIBS for satellite imagery.** Free, keyless XYZ tile endpoints with a time dimension — the satellite layer costs nothing and needs no proxy.

4. **Choropleth data shipped as static JSON per metric-year**, generated at build/ingest time and served from Vercel's CDN (`/data/co2/2024.json`). Map interactions never hit the database; only country deep-dives do. This is what keeps a public viral-capable site free to run.

5. **Country harmonisation.** One `countries` reference table (ISO 3166-1 alpha-3, name variants, OWID entity names, historical entities policy: USSR/Yugoslavia data mapped where OWID has already back-filled successors). All ingest must resolve to ISO3 or be rejected to a review log.

6. **Charts:** Observable Plot or Recharts, per the dataviz skill conventions.

### Free-tier budget check

| Service | Free limit | Our usage |
|---|---|---|
| Vercel Hobby | 100 GB bandwidth/mo | Static JSON + tiles offloaded to GIBS/OpenFreeMap; fine unless the site goes very viral (then Pro at ~$20/mo is the single upgrade path) |
| Supabase | 500 MB DB, 5 GB egress | Narrow table ≈ 100–300 MB; egress low because choropleths are static |
| OpenAQ / FIRMS / Ember / GFW | Generous free keys | Server-side proxy + cache keeps well under limits |
| Open-Meteo | Free non-commercial | Awareness tool qualifies; attribute per licence |

Note: Vercel Hobby prohibits commercial use. As a free public-good tool this is fine; if it ever becomes an alka**tera** marketing asset, move to the existing alka**tera** Pro team.

---

## 5. Build phases

### Phase 0 — Foundations (small)
- [ ] Repo scaffold: Next.js + TypeScript + Tailwind, MapLibre, Supabase client
- [ ] `countries` reference table + Natural Earth boundaries pipeline
- [ ] Metrics registry schema (`metrics`: id, name, unit, domain, source, licence, explainer)
- [ ] `observations` table + ingest framework (idempotent upserts, source versioning)
- [ ] Register free API keys: NASA FIRMS, OpenAQ, Ember, GFW

### Phase 1 — Historical core (the MVP of the plan)
- [ ] Ingest: OWID CO2 dataset (1750+), OWID Energy (1965+), Berkeley Earth country temperatures, OWID PM2.5 + pollution deaths
- [ ] Static choropleth JSON generation per metric-year
- [ ] Map explorer: metric picker, choropleth, hover tooltips with sparklines
- [ ] Time slider with play/animate (annual)
- [ ] Country search + country deep-dive page with charts and source attribution
- [ ] Shareable URLs + OG images

### Phase 2 — The live pulse
- [ ] Planet vitals strip: Mauna Loa CO2 (daily), NASA GISTEMP latest, NSIDC sea ice vs 1981–2010 average
- [ ] Live layers: NASA FIRMS active fires, OpenAQ station AQI dots
- [ ] NASA GIBS satellite imagery layer with date picker
- [ ] Proxy API routes with tuned cache lifetimes; graceful "feed unavailable" states

### Phase 3 — Water: droughts & floods
- [ ] SPEI drought index gridded layer (monthly, 1955+) rendered as raster/choropleth
- [ ] Copernicus GDO drought alerts + GloFAS flood alerts as live layers
- [ ] FAO AQUASTAT country water resources/withdrawals into the historical tier
- [ ] WRI Aqueduct water stress layer

### Phase 4 — Ice, oceans, land & life
- [ ] Sea level (satellite + tide gauges), ocean heat content, glacier mass balance
- [ ] Global Forest Watch tree cover loss (choropleth + weekly deforestation alerts)
- [ ] Natural disasters (OWID/EM-DAT), Living Planet Index
- [ ] Methane and all-GHG (PRIMAP) series

### Phase 5 — Polish & launch
- [ ] Metric explainer cards, "why this matters" copy (content-writer pass, British English)
- [ ] Accessibility audit, colour-blind palettes, mobile performance budget
- [ ] SEO: per-country static pages, sitemap
- [ ] Monitoring: ingest freshness alerts, dead-feed detection
- [ ] Soft launch, gather feedback, iterate

---

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Free API quota exhaustion on a viral day | All live feeds proxied with CDN caching; choropleths are static files; worst case a live layer greys out, history never breaks |
| EM-DAT licence restricts redistribution | Use OWID's republished aggregates only; link to EM-DAT for detail |
| Open-Meteo is non-commercial | Fine as a public-good tool; swap to direct ERA5/Copernicus ingest if commercialised |
| Country entity mismatches (Kosovo, Taiwan, historical states) | Single ISO3 reference table, ingest-time validation, documented policy per source |
| Gridded data (SPEI, ERA5) is heavy for free tier | Pre-aggregate to country level offline during ingest; ship only country values, never raw grids |
| Source schema changes silently | Weekly cron freshness check + row-count sanity alerts |

---

## 7. Open questions for Tim

1. Name/domain for the project (working title: "Earth Pulse")
2. Should this carry any alka**tera** branding, or stay fully independent? (Affects Vercel Hobby vs Pro from day one)
3. Any appetite for a small "what can I do" action section per country, or keep it purely observational?

---

## Data roadmap (13 Jul 2026): towards the environmental God's Eye

Live now: 27 country metrics (1750-2025), 3 global metrics, 6 live layers
(satellite imagery, fires, floods, air quality, earthquakes, disaster alerts).

### Next data candidates (all free)
**Historical/annual (OWID-pattern, ~30 min each):**
oil/gas electricity shares, per-capita electricity use, energy intensity,
CO2 by sector, consumption-based CO2, aviation emissions, ozone-depleting
substance consumption, mismanaged plastic share, outdoor air pollution death
rates, agricultural land share, soil erosion, freshwater species, fish stocks
overexploited, aquaculture vs capture, marine protected areas, coral
bleaching events, urbanisation share, sanitation access, waste per capita.

**Higher-resolution time (needs monthly pipeline):**
ERA5 monthly temperature/precipitation per country (Open-Meteo climate API),
NSIDC monthly sea ice, NOAA monthly CO2/CH4, Ember monthly electricity mix.

**More live layers (keyless unless noted):**
- GOES/Himawari geostationary imagery (GIBS, 10-min refresh)
- NOAA NHC active hurricane tracks + cones (CurrentStorms.json, seasonal)
- Copernicus EFFIS fire danger forecast (WMS)
- Smithsonian GVP weekly volcanic activity report
- USGS river gauges (US), flood stage (live)
- Open-Meteo current extreme temperatures (grid sample -> hottest/coldest now)
- Aurora oval forecast (NOAA SWPC, JSON)
- Lightning (Blitzortung community feed, websocket; licensing to check)
- Ship traffic density / illegal fishing (Global Fishing Watch API, free key)
- GRACE groundwater anomaly (monthly raster via NASA)

### God's Eye direction
Timeline already scrubs 275 years; live layers cover "now". The gap is the
middle: event playback (e.g. fire season animation via FIRMS archive,
storm-track history via IBTrACS) and a "what happened today" event ticker
from GDACS + USGS + FIRMS counts. IBTrACS (1850s+ hurricane tracks) is the
single highest-value addition for 4D playback.

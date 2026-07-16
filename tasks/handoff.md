# Handoff: Earth Pulse — Phase 7.7 complete
Updated: 2026-07-16 | Branch: main | Worktree: main (~/Documents/GitHub/earth-pulse) | Dev port: 3300

## Goal
Earth Pulse is a free public climate/environment dashboard: an interactive MapLibre globe
(also flat) with a 1750→2100 time slider, ~38 country metrics, live layers, per-country
pages, /planet and /compare. Live at https://earth-pulse-alkatera.vercel.app (deployed
site is several commits behind main — NOT yet redeployed; deploys need Tim's per-deploy
permission).

## Done this session (Phase 7.7: visual overhaul)

### 1. Hyper-realistic night sky (Starfield.tsx rewritten)
- DPR-aware canvas (dpr capped at 2); star count scales with area (~1,500 at
  desktop sizes, capped 2,200); power-law magnitude distribution.
- Temperature-based star colours (blue-white O/B → red-orange M, weighted like
  the real sky); brightest stars get a soft radial halo; a subset twinkles.
- Milky Way: soft gradient blobs along a diagonal arc + destination-out dust
  lanes, pre-rendered once to an offscreen canvas; a quarter of stars cluster
  along the band.
- First paint is unconditional (hidden tabs still get a sky); rAF animates
  twinkle only; rebuilds on resize; static under prefers-reduced-motion.
- **Globe mask:** the planet's disc is erased from the sky canvas each frame
  (destination-out circle) so stars never show through the dark night side.
  Hidden entirely on flat projection.

### 2. Globe + atmosphere (GlobeAtmosphere.tsx new)
- Canvas overlay (screen blend, z-1): thin bright blue rim hugging the limb +
  wide soft halo scattering into space. Fades as the limb leaves the viewport.
- `globePixelRadius(map)` = worldSize/2pi x sec(centre lat) — exported and
  shared with the Starfield mask. Redraws on zoom/move/resize.
- Mounted with `mapObj` (set at map creation, NOT at "load") so the mask and
  rim track the globe from the first frame even while GIBS tiles are slow.
- Style: deeper space (#010409), bluer horizon (#2e5f9e); Blue Marble retuned
  (saturation -0.18, brightness-max 0.88, contrast 0.05) so choropleth tints
  stay readable but the planet feels real.

### 3. Aurora (three-layer live heatmap + shimmer)
- aurora-fringe (violet, wide) + aurora (green body) + aurora-core (bright
  green-white) from the same OVATION source.
- Points carry `s = min(sec(lat), 14)`; heatmap-radius is data-driven
  `base x s` (zoom-interpolated bases 9/6/3 → 26/18/9). This is the fix for
  the concentric-ring artefacts: heatmap KDE runs in mercator space.
- Shimmer: rAF multi-sine opacity waves at offset phases per layer + core
  intensity pulse; gated on prefers-reduced-motion; paused when hidden;
  restores base opacities on cleanup. Base opacities: 0.32/0.7/0.55.
- Weight: interpolate on prob 5→0.2, 90→1.

### 4. Major cities (new layer, default ON)
- `scripts/build-cities.ts`: Natural Earth 50m populated places (download
  documented in header) → `public/data/cities.json`. 789 cities, 200
  capitals; non-ISO3 sovereignty codes rejected to a log line. Tiers: top 40
  by pop = 0, next 160 + all capitals = 1, rest = 2.
- Six map layers (dot + label per tier), minzooms 0/2.2/3.6; amber dots
  (#ffd18f), Noto Sans labels via OpenFreeMap glyphs (style now has a glyphs
  URL: https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf).
- Click → EventPopup kind "city": capital badge, population (urban area),
  country page link, Wikipedia, news. City layers are in the click-through
  guard so clicking a city never navigates to the country underneath.
- "Places · Major cities" toggle at the top of the layers panel.

## Verified in browser (fresh tabs, port 3300)
- Choropleth + borders + hover intact over the retuned Blue Marble.
- Stars masked exactly at the limb at zoom 1.9 (lat 18) and zoom 1.7 (lat 66).
- Cairo popup shows CAPITAL CITY badge, "12 million", three links.
- Aurora oval over the Arctic: smooth luminous band, no rings.
- Flat map: starfield hidden, atmosphere cleared, choropleth fine.
- `tsc --noEmit` clean; `npm run build` clean. Committed on main.

## Pending Tim actions (unchanged from 7.6)
- Create the GitHub repo (blocks the weekly refresh cron), add VERCEL_TOKEN.
- Decide when to deploy (live site now further behind main).

## Gotchas discovered this session
- **MapLibre globe radius needs sec(lat)** — see tasks/lessons.md.
- **Heatmap KDE is mercator-space** — per-point radius x sec(lat) smooths
  polar grids; layer-wide radius cannot.
- **First canvas paint must not be gated on document.hidden** (embedded pane
  is always hidden; backgrounded tabs would open blank).
- **map "load" can lag first render by many seconds** on slow GIBS days; the
  star mask/atmosphere take the map object at creation (mapObj state).
- GIBS was very slow this session (~30s to full load); USGS quakes feed
  intermittently timed out server-side (external, harmless).

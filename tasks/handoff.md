# Handoff: Earth Pulse — Phase 7.6 complete
Updated: 2026-07-14 19:00 | Branch: main | Worktree: main (~/Documents/GitHub/earth-pulse) | Dev port: 3300

## Goal
Earth Pulse is a free public climate/environment dashboard: an interactive MapLibre globe
(also flat) with a 1750→2100 time slider, ~38 country metrics, live layers, per-country
pages, /planet and /compare. Live at https://earth-pulse-alkatera.vercel.app (deployed =
commit 35cf6e3, now 3+ commits behind main — NOT yet redeployed).

## Done this session (Phase 7.6)

### Starfield background
- `src/components/Starfield.tsx`: canvas above WebGL (z-[1]), `mix-blend-mode: screen`
  so stars appear only in dark space around the globe and are invisible on bright surfaces.
  220 stars total: 185 dim background stars, 27 medium, 8 bright twinkling (rAF sine wave
  on opacity). Pauses on `document.hidden`. Reduced-motion: draw once, no animation.
  ResizeObserver for correct sizing; falls back to `screen.width / dpr` for headless
  environments. Added to MapExplorer immediately after the mapContainer div.

### Story mode
- `src/lib/stories.ts`: typed `Story` + `StoryStep` config. Three stories:
  - "CO2 since 1750" (6 steps): co2_per_capita, 1750→2022, flies UK→USA→Europe→Asia
  - "A century of storms" (5 steps): storms layer, key hurricane seasons 1992→2024
  - "Three futures" (6 steps): temperature_anomaly, SSP1-2.6/SSP2-4.5/SSP5-8.5 diverging to 2100
- `src/components/StoryPlayer.tsx`: fixed card at bottom of screen, story title (blue),
  caption text, progress dots (active dot widens), prev/play/next/close buttons.
- MapExplorer.tsx additions:
  - `initialStory?: string` prop; `?story=` URL param read in page.tsx
  - State: `activeStory`, `storyStep`, `storyPlaying`
  - Step driver effect: applies metric/year/scenario/layers/flyTo from step config;
    respects prefers-reduced-motion (jumpTo instead of flyTo)
  - Auto-advance effect: setTimeout(holdMs) advances step; stops at last step
  - URL state: adds `story=id` when active
  - Story chips in the desktop header (under "Planet trends →")
  - Stories section in mobile drawer (title + tagline cards)
  - StoryPlayer rendered above the time slider when active

### Animated events
- **Storm draw-on:** When playing with storms on, storm tracks fade from opacity 0 → 0.8
  over 550ms on each year change. Gives a "tracks appearing" feel. Gated on
  prefers-reduced-motion.
- **Quake pulse:** On year change with quakeHistOn, M7+ earthquakes display an expanding
  ring (circle-stroke, radius set by data expression on magnitude). Opacity sine-wave 
  (0 → 0.7 → 0) over 1100ms. Separate "quake-pulse" layer above quakehist.
- **Fires breathing:** When fires layer is active, raster opacity oscillates 0.82–1.0 at
  0.0007 rad/ms (≈2.5s cycle). Resets to 1.0 on cleanup. Gated on prefers-reduced-motion.

## Verified in browser
- Starfield canvas: drawing buffer 840×525, mix-blend-mode screen confirmed, test pixels
  visible in dark space around globe. Animation pauses on document.hidden (correct).
- Story player: clicking "CO2 since 1750" chip → player card appears, year jumps to 1750,
  metric → co2_per_capita, globe flies to Britain. Next button → year 1850, caption updates,
  progress dot advances. Story chip highlighted in header.
- TypeScript: clean (0 errors)

## Pending Tim actions
- **Create the GitHub repo** (blocks the weekly refresh cron): `gh repo create
  AvallenSolutions/earth-pulse --private --source . --push` — the permission classifier
  refuses to let the agent run it. Then add a **VERCEL_TOKEN** repo secret.
- **Decide when to deploy** (live site is now several commits behind main). Deploy flow:
  `vercel deploy --prod --yes` then `vercel alias set <url> earth-pulse-alkatera.vercel.app`
  (avallen-solutions team). The weekly refresh cron needs GitHub + the VERCEL_TOKEN before
  it can auto-deploy.

## Gotchas and decisions
- **NEVER deploy without Tim's express, per-deploy permission.** (memory)
- **Restart the dev server after bulk MapExplorer.tsx edits** — Fast Refresh serves stale
  bundles; toggles set state but effects never run. preview_stop + preview_start.
- **Browser-verify traps:** in-app Browser downscales screenshots to ~800px; resize to ≤800
  so click coords map correctly. Fresh tab for each verify (HMR patches corrupt hook deps).
- **Preview browser quirk:** `window.innerWidth = 0` and `document.hidden = true` always
  in the embedded preview pane. Starfield uses `screen.width/dpr` fallback for sizing;
  rAF pauses on hidden (by design). Both work correctly in real browsers.
- **Mix-blend-mode: screen** on the starfield canvas blends white star pixels with the
  near-black WebGL sky (#04060c), making stars visible in space but invisible on the bright
  globe disc. No z-fighting with UI panels (z-10+) since mix-blend only affects what's below.
- **Story auto-advance vs idle spin:** closing a story does not reset the idle spin timer.
  The spin resumes after 12s of inactivity as normal.
- **StoryPlayer position:** `bottom-[9.5rem]` clears the slider (`bottom-9`, ~90px tall)
  and the globe toggle (`bottom-[6.75rem]`). On very short viewports this might be tight.
- **No em dashes anywhere** (per Tim's style rules). Captions use commas/semicolons/colons.
- All new animation effects (storm fade, quake pulse, fires breathe) gate on
  `prefers-reduced-motion: reduce` and pause on `document.hidden`.

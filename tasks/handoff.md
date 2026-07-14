# Handoff: Earth Pulse — Phase 7.6 (story mode, animated events, visual polish + starry sky)
Updated: 2026-07-14 17:30 | Branch: main | Worktree: main (~/Documents/GitHub/earth-pulse) | Dev port: 3300

## Goal
Earth Pulse is a free public climate/environment dashboard: an interactive MapLibre globe
(also flat) with a 1750→2100 time slider, ~38 country metrics, live layers, per-country
pages, /planet and /compare. Live at https://earth-pulse-alkatera.vercel.app (deployed =
commit 30a90c3, now well behind main — NOT yet redeployed). This session builds **Phase 7.6**,
the final planned phase, plus extra visual polish Tim asked for:

1. **Story mode** — guided cinematic tours that fly the globe on rails while the timeline
   plays and caption cards explain what you see. Reuse existing machinery (map.flyTo, the
   play interval, metric/layer state setters). Stories: "CO2 since 1750", "A century of
   storms", "Three futures" (temperature SSP scenarios to 2100). Shareable as `?story=co2`
   via the existing URL-state pattern. Honour prefers-reduced-motion (no flight; instant steps).
2. **Animated events** — make play mode feel alive: storm tracks draw themselves point-by-point
   as the year advances; history quakes pulse (expanding ring) when they first appear, biggest
   for M7+; subtle glow-breathing on the fires raster. All gated behind prefers-reduced-motion;
   all rAF loops pause on document.hidden (same pattern as the idle spin).
3. **Visual polish + realistic starry background** (Tim's addition): replace the flat near-black
   space behind the globe with a real starfield — subtle, many small stars, a few brighter ones,
   maybe faint parallax on drag/spin. Plus any tasteful polish that lifts the whole thing.

Full plan: `~/.claude/plans/please-write-a-plan-replicated-lantern.md` (Phase 7 section).
Phase tracker: tasks/todo.md (Phase 7 block, 7.1–7.5 ticked).

## Done (verified in browser + committed, this Phase 7 session)
- 7.1 always-fresh data (0ab6f1d): .github/workflows/refresh-data.yml weekly cron; client
  polling (ticker+quakes 2min, disasters 10min, air 30min, visibility-aware, setData in place);
  freshness.json stamps → "as of HH:MM" + "updated X ago" in drawer/panel/planet footer.
- 7.2 (c5e0978): 8 new metrics; Stripes.tsx (warming stripes on country pages + /planet);
  MoversPanel.tsx (biggest rises/falls, on /planet + desktop map column + drawer).
- 7.3 (fd46c3b): scripts/ingest-monthly.ts (CCKP ERA5 monthly temp/precip anomalies,
  1950-2024, 2.9MB); "Monthly" toggle on the slider (self-discovering via monthly/<m>/index.json),
  month scrubbing + month play. Verified GBR 2018 heatwave, PAK Jul-2022 flood.
- 7.4 partial (c146dc5): precipitation projections to 2100 (ingest-projections.ts now
  variable-generic, tas+pr); IPCC AR6 sea-level fan on /planet
  (public/data/planet/sealevel-projections.json).
- 7.5 (35cf6e3): three live layers — aurora (/api/aurora, SWPC OVATION heatmap), volcanoes
  (/api/volcanoes, GVP recent+ongoing, popups), hurricanes (/api/hurricanes, NHC active,
  empty out of season). Verified in a fresh tab: Marapi popup, Arctic aurora glow, Ring of Fire.
- iPad stability fix (887c1a3): drawer no longer uses backdrop-blur over WebGL;
  visibilitychange → map.triggerRepaint().

## Done (unverified / deferred)
- 7.4 remaining: **WRI Aqueduct water stress futures (2030/50/80)** not built — needs source
  discovery for a country-level futures CSV. Optional to fold into this session or leave.
- Hurricane forecast CONE/track deferred: NHC ships them only as shapefile/KMZ zips,
  disproportionate for a free-tier proxy (documented in src/app/api/hurricanes/route.ts).

## In flight
- Nothing mid-edit. Working tree clean at 35cf6e3. This is a fresh start on 7.6.

## Next (build order for 7.6)
1. **Starry background first** (self-contained, high visual payoff, easy to verify). The globe
   scene is a MapLibre `sky` block in src/components/MapExplorer.tsx (~line 156-181: sky-color,
   horizon-color, atmosphere-blend). Space is currently flat #04060c. Options: (a) a fixed CSS
   starfield div behind the map canvas (map container bg is transparent-ish over #0d0d0d body),
   or (b) a canvas/SVG star layer. A CSS/absolute starfield behind the map is simplest and
   won't touch WebGL. Add faint twinkle + a few bright stars; keep it subtle, not a screensaver.
2. **stories.ts + StoryPlayer.tsx** — typed story config (steps: {camera:{center,zoom}, metric,
   yearRange|year, scenario?, layers?, caption, holdMs}); overlay with caption card + progress
   dots + next/back/close. Drive via existing setters in MapExplorer. Entry: a "Stories" row in
   the drawer + chips on the map. `?story=` deep link. Reduced-motion safe.
3. **Animated events** — storm-track draw-on (line-gradient / progressive trim during play),
   quake pulse (rAF ring on a duplicate circle layer), fires opacity breathing. Gate on
   prefers-reduced-motion; pause rAF on document.hidden.
4. Optional: WRI Aqueduct futures if time.
5. Verify each in the browser, then update tasks/todo.md + this handoff.

## Gotchas and decisions
- **NEVER deploy without Tim's express, per-deploy permission.** Do not chain vercel deploy
  onto build/commit. (memory: no-deploy-without-permission.md. The weekly refresh cron is the
  ONE standing exception, and it isn't live yet.)
- **Restart the dev server after bulk MapExplorer.tsx edits** (preview_stop + preview_start).
  Fast Refresh serves stale bundles — toggles set state but effects never run. See lessons.md.
- **Browser-verify traps (cost 40 min in 7.5, now in lessons.md):** the in-app Browser
  downscales screenshots to ~800px when the viewport is wider, so click coords don't map to
  screenshot pixels. Fix: resize_window to width ≤800 (e.g. 760) so canvas width == screenshot
  width, then click the map.project() pixel. AND a long-lived reused tab accumulates HMR patches
  that corrupt React hook dep arrays ("dependency array size changed") and silently break the map
  init effect — open a FRESH tab (tabs_create) for a clean verify.
- WebGL screenshots can show black/stale frames; call map.triggerRepaint() before screenshotting.
  querySourceFeatures/queryRenderedFeatures return 0 until the map finishes loading — visual is truth.
- Storm tracks must use unwrapped longitudes (>±180) or MapLibre draws a band round the planet.
- Idle globe spin lives at ~MapExplorer.tsx line ~1120 (rAF, pauses on hidden/playing/popup) —
  a good pattern to copy for animated events; also the thing to make sure parallax/starfield
  cooperates with.
- No new runtime deps — MapLibre + hand-rolled SVG/CSS cover all of this. British English, no em dashes.
- public/data is ~31MB (fine for repo + Vercel).

## Pending Tim actions
- **Create the GitHub repo** (blocks the weekly refresh cron): `gh repo create
  AvallenSolutions/earth-pulse --private --source . --push` — the permission classifier refuses
  to let the agent run it. Then add a **VERCEL_TOKEN** repo secret (avallen-solutions scope) so
  refresh-data.yml can deploy.
- **Decide when to deploy** the Phase 7 work (live site is 8 commits behind main). Deploy flow:
  `vercel deploy --prod --yes` then `vercel alias set <url> earth-pulse-alkatera.vercel.app`
  (alias does NOT move automatically), Vercel team avallen-solutions.
- Optional: say whether to include WRI Aqueduct futures in this session.

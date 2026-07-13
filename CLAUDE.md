# Earth Pulse

## Me
Tim Etherington-Judge, Co-Founder at alka**tera** (write it exactly like that: lowercase,
"tera" in bold). British English in all writing. NEVER use em dashes in text copy.

## What this is
A free public awareness dashboard for global climate and environment data: an interactive
world map with a time slider covering 50+ years of history, plus near-real-time layers
(fires, air quality, drought). For the general public; no logins, no paywalls.

## Stack
- Next.js (App Router, TypeScript, Tailwind) on Vercel Hobby
- Supabase Postgres (historical tier: countries, metrics registry, observations)
- MapLibre GL JS + OpenFreeMap basemap (no Mapbox, no tokens)
- NASA GIBS for satellite imagery tiles (keyless)
- Static JSON choropleths served from /public/data (map never queries the DB)

## Conventions
- Migrations: post the full SQL in chat for Tim to run in the Supabase SQL editor.
  Migration files live in supabase/migrations/.
- Dev server: port 3300 (8888/8891/4000/4100 are taken by other projects). Never fall
  back silently to a neighbouring port.
- Verify UI changes in the browser before calling them done.
- Plain language in all user-facing copy; users are not climate scientists.
- Every metric shown must carry source attribution and a plain-English explainer.
- All country data keyed by ISO 3166-1 alpha-3. Ingest that cannot resolve to ISO3 is
  rejected to a review log, never guessed.
- Free-tier budget is a hard constraint: live feeds are proxied and cached, never stored;
  choropleth data is pre-built static JSON.

## Data pipeline
- Ingest scripts in scripts/ (run with `npx tsx scripts/<name>.ts`), idempotent upserts
- Raw downloads go to data/raw/ (gitignored); generated static JSON to public/data/
- The full build plan and phase tracker: PLAN.md and tasks/todo.md

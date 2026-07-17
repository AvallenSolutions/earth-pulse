"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ATLAS_YEARS,
  SKY_BANDS,
  SKY_FEATURES,
  bandFor,
  formatStarCount,
  nelm,
  smoothstep,
  starsAboveHorizon,
} from "@/lib/sky";
import {
  SKY_OBJECTS,
  altAz,
  compassWord,
  fetchConstellations,
  fetchStars,
  gmstHours,
  kelvinToRgb,
  milkyWayBlobs,
  type SkyObject,
} from "@/lib/celestial";
import {
  moonPosition,
  planetPositions,
  sunPosition,
  type MoonState,
} from "@/lib/ephemeris";

/**
 * Full-screen night sky simulator, now the real sky: every star is a Yale
 * Bright Star Catalogue star placed by genuine astronomy for the viewer's
 * latitude on a canonical clear January evening (22:00 local, when Orion,
 * the Plough and Andromeda share the sky at northern mid-latitudes). The
 * Milky Way follows the real galactic plane; the Andromeda galaxy, Orion
 * Nebula, Pleiades and Carina Nebula are drawn at their true positions;
 * constellation figures and labels can be toggled. Drag to look around the
 * whole horizon.
 *
 * One slider still drives everything: sky brightness (mpsas) from the
 * Light Pollution Atlas sets the naked-eye limit, star wash, skyglow dome
 * and which showpieces survive.
 */

const MPSAS_MIN = 16.5;
const MPSAS_MAX = 22.0;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Canonical evening: the 15th of the month at 22:00. Treating local mean
 *  time as UT makes the sky longitude-independent, so latitude plus month
 *  fully determine the view. */
function canonicalTime(month: number): number {
  return Date.UTC(new Date().getUTCFullYear(), month, 15, 22, 0, 0);
}

const MAX_ALT = 85; // degrees of sky above the horizon shown

// Tunable feel constants
const STAR_FADE_MAG = 0.8; // soft fade width at the visibility limit
const GLOW_EASE = 1.6; // skyglow ramp: g = t^GLOW_EASE
const MW_FADE: [number, number] = [20.1, 21.4]; // Milky Way smoothstep window

type SkyStar = {
  az: number;
  alt: number;
  mag: number;
  colour: string;
  twinkle: boolean;
  phase: number;
  speed: number;
};

type Segment = { az1: number; alt1: number; az2: number; alt2: number };

type PlacedObject = SkyObject & { az: number; alt: number };

type PlacedPlanet = {
  name: string;
  az: number;
  alt: number;
  mag: number;
  colour: string;
};

type SkyData = {
  stars: SkyStar[];
  segments: Segment[];
  objects: PlacedObject[];
  planets: PlacedPlanet[];
  moon: (MoonState & { az: number; alt: number }) | null;
  /** Sun altitude: above -18 and twilight starts washing the sky out */
  sunAlt: number;
  sunAz: number;
  /** 360-degree Milky Way strip, x = azimuth, y = altitude */
  strip: HTMLCanvasElement;
  stripPxPerDeg: number;
};

const wrap180 = (a: number) => ((a + 540) % 360) - 180;

/** Atmospheric extinction: stars dim towards the horizon. */
const horizonDim = (alt: number) => (alt < 15 ? 0.35 + 0.65 * (alt / 15) : 1);

async function buildSkyData(lat: number, month: number): Promise<SkyData> {
  const [catalogue, constellations] = await Promise.all([
    fetchStars(),
    fetchConstellations(),
  ]);
  const t = canonicalTime(month);
  const LST_HOURS = gmstHours(t);

  const stars: SkyStar[] = [];
  for (const s of catalogue) {
    const { alt, az } = altAz(s.ra, s.dec, lat, LST_HOURS);
    if (alt < -2) continue;
    stars.push({
      az,
      alt,
      mag: s.mag,
      colour: kelvinToRgb(s.k),
      twinkle: s.mag < 4.2 && (s.ra * 100) % 5 < 2,
      phase: (s.ra * 13.7) % 6.28,
      speed: 0.3 + ((((s.dec * 7.31 + s.ra) % 1) + 1) % 1) * 0.5,
    });
  }

  const segments: Segment[] = [];
  for (const lines of Object.values(constellations)) {
    for (const line of lines) {
      for (let i = 1; i < line.length; i++) {
        const a = altAz(line[i - 1][0] / 100, line[i - 1][1] / 100, lat, LST_HOURS);
        const b = altAz(line[i][0] / 100, line[i][1] / 100, lat, LST_HOURS);
        if (Math.max(a.alt, b.alt) < 0) continue;
        if (Math.abs(wrap180(a.az - b.az)) > 90) continue; // wrap artefact
        segments.push({ az1: a.az, alt1: a.alt, az2: b.az, alt2: b.alt });
      }
    }
  }

  const objects: PlacedObject[] = SKY_OBJECTS.map((o) => {
    const { alt, az } = altAz(o.ra, o.dec, lat, LST_HOURS);
    return { ...o, alt, az };
  });

  // The Solar System on this evening: bright planets, the Moon with its
  // true phase, and the Sun (for twilight)
  const planets: PlacedPlanet[] = planetPositions(t).map((p) => ({
    name: p.name,
    mag: p.mag,
    colour: p.colour,
    ...altAz(p.ra, p.dec, lat, LST_HOURS),
  }));
  const moonState = moonPosition(t);
  const moonAltAz = altAz(moonState.ra, moonState.dec, lat, LST_HOURS);
  const moon = moonAltAz.alt > -3 ? { ...moonState, ...moonAltAz } : null;
  const sun = sunPosition(t);
  const sunAA = altAz(sun.ra, sun.dec, lat, LST_HOURS);

  // Milky Way: pre-render the full 360-degree band once; frames blit a window
  const stripPxPerDeg = 4; // fixed working resolution, scaled on composite
  const strip = document.createElement("canvas");
  strip.width = 360 * stripPxPerDeg;
  strip.height = MAX_ALT * stripPxPerDeg;
  const sctx = strip.getContext("2d")!;
  const yFor = (alt: number) => strip.height * (1 - alt / MAX_ALT);
  for (const pass of [false, true]) {
    sctx.globalCompositeOperation = pass ? "destination-out" : "source-over";
    for (const bl of milkyWayBlobs()) {
      if (bl.dark !== pass) continue;
      const { alt, az } = altAz(bl.ra, bl.dec, lat, LST_HOURS);
      if (alt < -8) continue;
      const radius = bl.size * stripPxPerDeg;
      const y = yFor(alt);
      const dim = horizonDim(Math.max(alt, 0));
      const tint = bl.dark ? "0,0,0" : bl.warm ? "228,212,196" : "198,210,236";
      const alpha = bl.dark ? bl.alpha : bl.alpha * 1.6 * dim;
      for (const xBase of [az * stripPxPerDeg, az * stripPxPerDeg - strip.width, az * stripPxPerDeg + strip.width]) {
        if (xBase < -radius || xBase > strip.width + radius) continue;
        const g = sctx.createRadialGradient(xBase, y, 0, xBase, y, radius);
        g.addColorStop(0, `rgba(${tint},${alpha.toFixed(3)})`);
        g.addColorStop(1, `rgba(${tint},0)`);
        sctx.fillStyle = g;
        sctx.fillRect(xBase - radius, y - radius, radius * 2, radius * 2);
      }
    }
  }
  sctx.globalCompositeOperation = "source-over";
  return {
    stars,
    segments,
    objects,
    planets,
    moon,
    sunAlt: sunAA.alt,
    sunAz: sunAA.az,
    strip,
    stripPxPerDeg,
  };
}

type Silhouette = {
  layer: HTMLCanvasElement;
  windows: { x: number; y: number; r: number }[];
};

function makeRand(seed: number) {
  return () => {
    seed ^= seed << 13;
    seed ^= seed >> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0x100000000;
  };
}

function paintSilhouette(W: number, H: number, horizonY: number): Silhouette {
  const off = document.createElement("canvas");
  off.width = W;
  off.height = H;
  const ctx = off.getContext("2d")!;
  const rand = makeRand(0x1c0ffee5);
  ctx.fillStyle = "#030306";
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, horizonY);
  let x = 0;
  let y = horizonY;
  while (x < W) {
    x += 14;
    if (rand() < 0.18) {
      const h = (0.01 + rand() * 0.03) * H;
      ctx.quadraticCurveTo(x - 7, y - h, x, Math.min(horizonY + 4, y + (rand() - 0.5) * 0.01 * H));
    } else {
      y = horizonY + (rand() - 0.5) * 0.018 * H;
      ctx.lineTo(x, y);
    }
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
  const windows: Silhouette["windows"] = [];
  const buildings = 4 + Math.floor(rand() * 2);
  let bx = W * 0.38;
  for (let i = 0; i < buildings; i++) {
    const bw = (0.02 + rand() * 0.05) * W;
    const bh = (0.03 + rand() * 0.07) * H;
    ctx.fillRect(bx, horizonY - bh, bw, bh + 4);
    const cols = Math.max(1, Math.floor(bw / 26));
    const rows = Math.max(1, Math.floor(bh / 30));
    for (let c = 0; c < cols; c++)
      for (let rr = 0; rr < rows; rr++)
        if (rand() < 0.4)
          windows.push({
            x: bx + (c + 0.5) * (bw / cols),
            y: horizonY - bh + (rr + 0.5) * (bh / rows),
            r: 1.1,
          });
    bx += bw + (0.004 + rand() * 0.012) * W;
  }
  return { layer: off, windows };
}

function lerpRgb(from: [number, number, number], to: [number, number, number], g: number): string {
  const c = from.map((f, i) => Math.round(f + (to[i] - f) * g));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Checklist status for a named feature at this latitude and evening. */
function featureStatus(
  label: string,
  minMpsas: number,
  mpsas: number,
  objects: PlacedObject[] | null,
  lat: number
): { symbol: string; note: string; dimmed: boolean } {
  const ids: Record<string, string> = {
    "The Milky Way": "",
    "The Andromeda galaxy with the naked eye": "m31",
    "The Orion Nebula as a fuzzy glow": "m42",
    "All seven stars of the Plough": "plough",
  };
  const obj = objects?.find((o) => o.id === ids[label]);
  if (obj) {
    const maxAlt = 90 - Math.abs(lat - obj.dec);
    if (maxAlt < 4)
      return { symbol: "—", note: "never rises at this latitude", dimmed: true };
    if (obj.alt < 3)
      return { symbol: "—", note: "below the horizon this evening", dimmed: true };
    if (mpsas >= minMpsas)
      return { symbol: "✓", note: `${compassWord(obj.az)}`, dimmed: false };
    return { symbol: "✕", note: "lost", dimmed: true };
  }
  return mpsas >= minMpsas
    ? { symbol: "✓", note: "", dimmed: false }
    : { symbol: "✕", note: "lost", dimmed: true };
}

export function SkySimulator({
  initialMpsas,
  cityName,
  series,
  lat,
  escape,
  mine,
  onClose,
}: {
  initialMpsas?: number;
  cityName?: string;
  /** Per-year mpsas values aligned with ATLAS_YEARS (from sky-quality.json) */
  series?: (number | null)[];
  /** Viewer latitude; shapes which sky is overhead. Defaults to 45N. */
  lat?: number;
  /** Nearest darker sky, from the find-my-sky search */
  escape?: { km: number; direction: string; mpsas: number } | null;
  /** Opened via find-my-sky: address the viewer directly */
  mine?: boolean;
  onClose: () => void;
}) {
  const clamp = (v: number) => Math.min(Math.max(v, MPSAS_MIN), MPSAS_MAX);
  const viewerLat = Math.min(84, Math.max(-84, lat ?? 45));
  const [mpsas, setMpsas] = useState(() => clamp(initialMpsas ?? 21.9));
  const [activeYear, setActiveYear] = useState<number | null>(() =>
    initialMpsas !== undefined && series ? ATLAS_YEARS[ATLAS_YEARS.length - 1] : null
  );
  const [guides, setGuides] = useState(true);
  const [month, setMonth] = useState(0);
  // The readout card can be minimised to just the slider so the full sky
  // shows on any screen. Open by default on desktop, collapsed on phones.
  const [detailsOpen, setDetailsOpen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches
  );
  const initialFacing = viewerLat >= -10 ? 180 : 0;
  const [facingWord, setFacingWord] = useState(compassWord(initialFacing));
  // Bumped whenever the async sky rebuild lands, so the checklist and other
  // JSX derived from skyRef re-render (a ref alone never re-renders)
  const [skyVersion, setSkyVersion] = useState(0);
  const skyReady = skyVersion > 0;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const targetRef = useRef(mpsas);
  targetRef.current = mpsas;
  const guidesRef = useRef(guides);
  guidesRef.current = guides;
  const azRef = useRef(initialFacing);
  const skyRef = useRef<SkyData | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let silhouette: Silhouette | null = null;
    let W = 0;
    let H = 0;
    let horizonY = 0;
    let pxPerDegY = 1;
    let pxPerDegX = 1;
    let disp = targetRef.current;
    let disposed = false;

    const xFor = (az: number) => W / 2 + wrap180(az - azRef.current) * pxPerDegX;
    const yFor = (alt: number) => horizonY - (alt / MAX_ALT) * (horizonY - 0.02 * H);

    const drawObjects = (ctx: CanvasRenderingContext2D, wash: number) => {
      const sky = skyRef.current;
      if (!sky) return;
      for (const o of sky.objects) {
        if (o.alt < 2) continue;
        const x = xFor(o.az);
        if (x < -60 || x > W + 60) continue;
        const y = yFor(o.alt);
        const gate = smoothstep(o.minMpsas - 0.6, o.minMpsas + 0.9, disp) * wash * horizonDim(o.alt);
        if (gate <= 0.02) continue;
        const dppx = pxPerDegX;
        if (o.kind === "galaxy") {
          // M31: an inclined spindle of soft light
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(-0.6);
          ctx.scale(1, 0.38);
          const r = 1.7 * dppx;
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
          g.addColorStop(0, `rgba(235,225,215,${(0.5 * gate).toFixed(3)})`);
          g.addColorStop(0.4, `rgba(215,205,200,${(0.22 * gate).toFixed(3)})`);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.fillRect(-r, -r, r * 2, r * 2);
          ctx.restore();
        } else if (o.kind === "nebula") {
          const r = (o.id === "carina" ? 1.4 : 0.9) * dppx;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          const tint = o.id === "m42" ? "252,204,212" : "240,220,200";
          g.addColorStop(0, `rgba(${tint},${(0.55 * gate).toFixed(3)})`);
          g.addColorStop(0.5, `rgba(190,205,230,${(0.2 * gate).toFixed(3)})`);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
        } else if (o.kind === "cluster") {
          const r = 1.1 * dppx;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, `rgba(185,205,245,${(0.28 * gate).toFixed(3)})`);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
      }
    };

    const drawGuides = (ctx: CanvasRenderingContext2D, wash: number) => {
      const sky = skyRef.current;
      if (!sky || !guidesRef.current) return;
      // Constellation figures
      ctx.strokeStyle = `rgba(140,170,215,${(0.3 * wash).toFixed(3)})`;
      ctx.lineWidth = Math.max(1, 0.6 * (dpr / 2 + 0.5));
      ctx.beginPath();
      for (const s of sky.segments) {
        const x1 = xFor(s.az1);
        const x2 = xFor(s.az2);
        if ((x1 < 0 && x2 < 0) || (x1 > W && x2 > W)) continue;
        if (Math.abs(x1 - x2) > W) continue;
        ctx.moveTo(x1, yFor(s.alt1));
        ctx.lineTo(x2, yFor(s.alt2));
      }
      ctx.stroke();
      // Labels for the showpieces that are up and surviving the sky
      ctx.font = `${Math.round(11 * (dpr / 2 + 0.5) * 2) / 2 + 6}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      for (const o of sky.objects) {
        if (o.alt < 4) continue;
        const gate = smoothstep(o.minMpsas - 0.6, o.minMpsas + 0.9, disp);
        if (gate < 0.25) continue;
        const x = xFor(o.az);
        if (x < 30 || x > W - 30) continue;
        const y = yFor(o.alt);
        const a = (0.75 * gate * wash).toFixed(3);
        ctx.strokeStyle = `rgba(170,190,220,${(0.4 * gate * wash).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(x, y - 14 * (dpr / 2 + 0.5));
        ctx.lineTo(x, y - 26 * (dpr / 2 + 0.5));
        ctx.stroke();
        ctx.fillStyle = `rgba(190,205,228,${a})`;
        ctx.fillText(o.label, x, y - 32 * (dpr / 2 + 0.5));
      }
      // Planets and the Moon: name what people will actually notice
      const solar: { label: string; az: number; alt: number }[] = [
        ...sky.planets.filter((p) => p.alt > 1.5).map((p) => ({ label: p.name, az: p.az, alt: p.alt })),
        ...(sky.moon && sky.moon.alt > 1.5
          ? [{ label: `Moon · ${sky.moon.phaseName}`, az: sky.moon.az, alt: sky.moon.alt }]
          : []),
      ];
      for (const s of solar) {
        const x = xFor(s.az);
        if (x < 30 || x > W - 30) continue;
        const y = yFor(s.alt);
        ctx.fillStyle = `rgba(190,205,228,${(0.7 * wash + 0.15).toFixed(3)})`;
        ctx.fillText(s.label, x, y - 26 * (dpr / 2 + 0.5));
      }
    };

    const paint = (time?: number) => {
      const ctx = canvas.getContext("2d");
      if (!ctx || !silhouette) return;
      const t = Math.min(Math.max((MPSAS_MAX - disp) / 5.5, 0), 1);
      const g = Math.pow(t, GLOW_EASE);
      const limit = nelm(disp);
      const sky = skyRef.current;
      // Twilight: at high latitudes in summer the Sun never drops far enough
      // for real darkness, and the sky says so
      const tw = sky ? smoothstep(-18, -6, sky.sunAlt) : 0;
      const wash = (1 - 0.35 * t) * (1 - 0.8 * tw);

      // Sky gradient, zenith to horizon
      const mix = (dark: [number, number, number], glow: [number, number, number], twi: [number, number, number]) => {
        const base = dark.map((d, i) => d + (glow[i] - d) * g) as [number, number, number];
        return lerpRgb(base, twi, tw * 0.85);
      };
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
      skyGrad.addColorStop(0, mix([5, 8, 17], [44, 37, 28], [30, 48, 88]));
      skyGrad.addColorStop(0.62, mix([9, 13, 25], [98, 71, 44], [62, 92, 146]));
      skyGrad.addColorStop(1, mix([16, 21, 34], [182, 122, 58], [128, 158, 198]));
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, W, H);

      // Milky Way window from the pre-rendered 360-degree strip
      const mw = smoothstep(MW_FADE[0], MW_FADE[1], disp) * (1 - tw);
      if (sky && mw > 0) {
        const { strip, stripPxPerDeg } = sky;
        const winDeg = W / pxPerDegX;
        let sx = ((azRef.current - winDeg / 2) * stripPxPerDeg) % strip.width;
        if (sx < 0) sx += strip.width;
        const sw = winDeg * stripPxPerDeg;
        const dy = 0.02 * H; // align alt range with the star projection
        const dh = horizonY - dy;
        ctx.globalAlpha = mw;
        if (sx + sw <= strip.width) {
          ctx.drawImage(strip, sx, 0, sw, strip.height, 0, dy, W, dh);
        } else {
          const first = strip.width - sx;
          const firstW = (first / sw) * W;
          ctx.drawImage(strip, sx, 0, first, strip.height, 0, dy, firstW, dh);
          ctx.drawImage(strip, 0, 0, sw - first, strip.height, firstW, dy, W - firstW, dh);
        }
        ctx.globalAlpha = 1;
      }

      // Deep sky objects beneath the stars
      drawObjects(ctx, wash);

      // Stars: real catalogue, real extinction, photo bloom on the brightest
      if (sky) {
        for (const st of sky.stars) {
          if (st.alt < 0) continue;
          const vis = Math.min(Math.max((limit - st.mag) / STAR_FADE_MAG, 0), 1);
          if (vis <= 0) continue;
          const x = xFor(st.az);
          if (x < -12 || x > W + 12) continue;
          const y = yFor(st.alt);
          let a = (0.18 + 0.82 * vis) * vis * wash * horizonDim(st.alt);
          if (st.twinkle && time !== undefined)
            a *= 0.75 + 0.25 * Math.sin(time * 0.0012 * st.speed + st.phase);
          const b = Math.min(Math.max((6.7 - st.mag) / 7, 0), 1);
          const r = (0.4 + 2.6 * b * b) * (dpr / 2 + 0.5);
          if (st.mag < 1.6) {
            // Bloom + subtle diffraction spikes: the photo look
            const halo = r * 5;
            const hg = ctx.createRadialGradient(x, y, 0, x, y, halo);
            hg.addColorStop(0, `rgba(${st.colour},${(a * 0.55).toFixed(3)})`);
            hg.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = hg;
            ctx.fillRect(x - halo, y - halo, halo * 2, halo * 2);
            ctx.strokeStyle = `rgba(${st.colour},${(a * 0.3).toFixed(3)})`;
            ctx.lineWidth = Math.max(1, r * 0.22);
            ctx.beginPath();
            ctx.moveTo(x - halo, y);
            ctx.lineTo(x + halo, y);
            ctx.moveTo(x, y - halo);
            ctx.lineTo(x, y + halo);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${st.colour},${Math.min(1, a * 1.2).toFixed(3)})`;
            ctx.fill();
          } else if (r > 1.4) {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${st.colour},${a.toFixed(3)})`;
            ctx.fill();
          } else {
            const s = Math.max(1, r * 1.7);
            ctx.fillStyle = `rgba(${st.colour},${a.toFixed(3)})`;
            ctx.fillRect(x - s / 2, y - s / 2, s, s);
          }
        }
      }

      // The bright planets: they survive city skies long after the stars go
      if (sky) {
        for (const p of sky.planets) {
          if (p.alt < 0.5) continue;
          const x = xFor(p.az);
          if (x < -12 || x > W + 12) continue;
          const y = yFor(p.alt);
          const vis = Math.min(Math.max((limit - p.mag) / STAR_FADE_MAG, 0), 1);
          if (vis <= 0) continue;
          const a = (0.3 + 0.7 * vis) * (1 - 0.15 * t) * horizonDim(p.alt) * (1 - 0.5 * tw);
          const b = Math.min(Math.max((6.7 - p.mag) / 7, 0), 1);
          const r = (0.5 + 2.6 * b * b) * (dpr / 2 + 0.5);
          const halo = r * 4.5;
          const hg = ctx.createRadialGradient(x, y, 0, x, y, halo);
          hg.addColorStop(0, `rgba(${p.colour},${(a * 0.5).toFixed(3)})`);
          hg.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = hg;
          ctx.fillRect(x - halo, y - halo, halo * 2, halo * 2);
          if (p.mag < -1) {
            ctx.strokeStyle = `rgba(${p.colour},${(a * 0.3).toFixed(3)})`;
            ctx.lineWidth = Math.max(1, r * 0.22);
            ctx.beginPath();
            ctx.moveTo(x - halo, y);
            ctx.lineTo(x + halo, y);
            ctx.moveTo(x, y - halo);
            ctx.lineTo(x, y + halo);
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${p.colour},${Math.min(1, a * 1.2).toFixed(3)})`;
          ctx.fill();
        }

        // The Moon with its true phase (drawn about twice its real size so
        // the phase reads at panorama scale)
        if (sky.moon && sky.moon.alt > 0) {
          const x = xFor(sky.moon.az);
          if (x > -40 && x < W + 40) {
            const y = yFor(sky.moon.alt);
            const R = 1.05 * pxPerDegX;
            const k = sky.moon.illuminated;
            const glowR = R * (2 + 3 * k);
            const mg = ctx.createRadialGradient(x, y, R * 0.8, x, y, glowR);
            mg.addColorStop(0, `rgba(225,232,245,${(0.28 * k + 0.04).toFixed(3)})`);
            mg.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = mg;
            ctx.fillRect(x - glowR, y - glowR, glowR * 2, glowR * 2);
            // Dark side first (earthshine), then the lit shape
            ctx.beginPath();
            ctx.arc(x, y, R, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(78,84,96,0.5)";
            ctx.fill();
            const sunSide = wrap180(sky.sunAz - sky.moon.az) > 0 ? 1 : -1;
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, R, 0, Math.PI * 2);
            ctx.clip();
            const lit = "rgba(238,240,234,0.96)";
            ctx.beginPath();
            if (sunSide > 0) ctx.arc(x, y, R, -Math.PI / 2, Math.PI / 2);
            else ctx.arc(x, y, R, Math.PI / 2, (3 * Math.PI) / 2);
            ctx.closePath();
            ctx.fillStyle = lit;
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(x, y, R * Math.abs(2 * k - 1), R, 0, 0, Math.PI * 2);
            ctx.fillStyle = k >= 0.5 ? lit : "rgba(78,84,96,0.9)";
            ctx.fill();
            ctx.restore();
          }
        }
      }

      drawGuides(ctx, wash);

      // City glow domes above the horizon
      const dome = ctx.createRadialGradient(
        W / 2, horizonY + 0.22 * H, 0,
        W / 2, horizonY + 0.22 * H, 0.85 * W
      );
      dome.addColorStop(0, `rgba(255,167,80,${(0.45 * g).toFixed(3)})`);
      dome.addColorStop(1, "rgba(255,167,80,0)");
      ctx.fillStyle = dome;
      ctx.fillRect(0, 0, W, H);
      for (const sx of [0.15, 0.85]) {
        const side = ctx.createRadialGradient(
          W * sx, horizonY + 0.15 * H, 0,
          W * sx, horizonY + 0.15 * H, 0.4 * W
        );
        side.addColorStop(0, `rgba(255,150,70,${(0.2 * g).toFixed(3)})`);
        side.addColorStop(1, "rgba(255,150,70,0)");
        ctx.fillStyle = side;
        ctx.fillRect(0, 0, W, H);
      }

      // Ground, then its windows lighting up with pollution
      ctx.drawImage(silhouette.layer, 0, 0);
      if (t > 0.05) {
        ctx.fillStyle = `rgba(255,190,120,${(0.55 * t).toFixed(3)})`;
        for (const w of silhouette.windows) {
          ctx.beginPath();
          ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const build = (cssW: number, cssH: number) => {
      W = Math.round(cssW * dpr);
      H = Math.round(cssH * dpr);
      canvas.width = W;
      canvas.height = H;
      horizonY = 0.86 * H;
      pxPerDegY = (horizonY - 0.02 * H) / MAX_ALT;
      // Match vertical scale where possible; clamp the field of view so
      // narrow screens still see enough sky and wide ones are not absurd
      pxPerDegX = Math.max(W / 220, Math.min(W / 100, pxPerDegY));
      silhouette = paintSilhouette(W, H, horizonY);
      paint();
    };

    buildSkyData(viewerLat, month).then((data) => {
      if (disposed) return;
      skyRef.current = data;
      setSkyVersion((v) => v + 1);
      paint();
    });

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) build(Math.round(width), Math.round(height));
    });
    ro.observe(canvas);
    if (canvas.offsetWidth) build(canvas.offsetWidth, canvas.offsetHeight);

    // Drag to look around the horizon
    let dragging = false;
    let lastX = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = (e.clientX - lastX) * dpr;
      lastX = e.clientX;
      azRef.current = ((azRef.current - dx / pxPerDegX) % 360 + 360) % 360;
      setFacingWord(compassWord(azRef.current));
      paint();
    };
    const onUp = () => {
      dragging = false;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    let lastRaf = 0;
    if (!reduced) {
      let lastTime = 0;
      const tick = (time: number) => {
        lastRaf = performance.now();
        const dt = lastTime ? time - lastTime : 16;
        lastTime = time;
        disp += (targetRef.current - disp) * Math.min(1, dt * 0.006);
        if (Math.abs(targetRef.current - disp) < 0.002) disp = targetRef.current;
        paint(time);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    // Repaint synchronously on change under reduced motion, or whenever the
    // rAF loop is stalled (throttled webviews); otherwise the loop eases.
    const repaintNow = () => {
      if (reduced || performance.now() - lastRaf > 250) {
        disp = targetRef.current;
        paint();
      }
    };
    canvas.addEventListener("sky-repaint", repaintNow);

    return () => {
      disposed = true;
      ro.disconnect();
      cancelAnimationFrame(raf);
      canvas.removeEventListener("sky-repaint", repaintNow);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerLat, month]);

  const setSky = useCallback((v: number, year: number | null) => {
    setMpsas(v);
    setActiveYear(year);
    targetRef.current = v;
    canvasRef.current?.dispatchEvent(new Event("sky-repaint"));
  }, []);

  const toggleGuides = useCallback(() => {
    setGuides((g) => {
      guidesRef.current = !g;
      return !g;
    });
    canvasRef.current?.dispatchEvent(new Event("sky-repaint"));
  }, []);

  const band = bandFor(mpsas);
  const limit = nelm(mpsas);
  const starCount = starsAboveHorizon(limit);

  // Postcard: composite the live canvas with a caption band and share it
  const savePostcard = useCallback(() => {
    const src = canvasRef.current;
    if (!src || !src.width) return;
    const out = document.createElement("canvas");
    out.width = 1200;
    out.height = 900;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#050508";
    ctx.fillRect(0, 0, 1200, 900);
    // Cover-fit the upper two thirds of the sky (the control card region is
    // DOM, not canvas, so the canvas is clean sky + silhouette)
    const usableH = src.height * 0.9;
    const scale = Math.max(1200 / src.width, 770 / usableH);
    const sw = 1200 / scale;
    const sh = 770 / scale;
    ctx.drawImage(src, (src.width - sw) / 2, 0, sw, sh, 0, 0, 1200, 770);
    const fade = ctx.createLinearGradient(0, 700, 0, 780);
    fade.addColorStop(0, "rgba(5,5,8,0)");
    fade.addColorStop(1, "rgba(5,5,8,1)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 700, 1200, 80);
    ctx.fillStyle = "#050508";
    ctx.fillRect(0, 780, 1200, 120);
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 34px system-ui, sans-serif";
    ctx.fillText(cityName ? `The night sky over ${cityName}` : "My night sky", 40, 806);
    ctx.fillStyle = "#c3c2b7";
    ctx.font = "21px system-ui, sans-serif";
    ctx.fillText(
      `${band.label} · about ${formatStarCount(starCount)} stars visible${activeYear ? ` · ${activeYear}` : ""} · a clear ${MONTHS[month]} evening`,
      40, 842
    );
    ctx.fillStyle = "#898781";
    ctx.font = "17px system-ui, sans-serif";
    ctx.fillText("earth-pulse-alkatera.vercel.app · Light Pollution Atlas 2024 · Yale Bright Star Catalogue", 40, 874);
    out.toBlob((blob) => {
      if (!blob) return;
      const slug = cityName ? `-${cityName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : "";
      const file = new File([blob], `night-sky${slug}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        navigator.share({ files: [file], title: file.name }).catch(() => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = file.name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 30_000);
        });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }, "image/png");
  }, [cityName, band, starCount, activeYear, month]);

  const yearsWithData: { year: number; mpsas: number }[] = series
    ? ATLAS_YEARS.flatMap((y, i) =>
        series[i] === null || series[i] === undefined
          ? []
          : [{ year: y as number, mpsas: series[i]! }]
      )
    : [];
  const first = yearsWithData[0];
  const last = yearsWithData[yearsWithData.length - 1];
  const firstStars = first ? starsAboveHorizon(nelm(first.mpsas)) : 0;
  const lastStars = last ? starsAboveHorizon(nelm(last.mpsas)) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Night sky simulator"
      className="fixed inset-0 z-[60] bg-black"
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing"
      />

      <button
        ref={closeRef}
        onClick={onClose}
        aria-label="Close the night sky simulator"
        className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/40 text-[#c3c2b7] backdrop-blur hover:bg-white/10 hover:text-white"
      >
        ✕
      </button>

      <div className="pointer-events-none absolute left-4 right-16 top-4 z-10">
        <h2 className="text-base font-semibold tracking-tight text-white sm:text-lg">
          {mine
            ? "Your night sky"
            : cityName
              ? `The night sky over ${cityName}`
              : "Night sky simulator"}
        </h2>
        <p className="hidden text-sm text-[#c3c2b7] sm:block">
          The real sky for this latitude on a clear {MONTHS[month]} evening.
          Drag to look around · facing {facingWord}.
        </p>
        <p className="text-xs text-[#c3c2b7] sm:hidden">
          Drag to look around · facing {facingWord}
        </p>
        {!skyReady && (
          <p className="mt-1 text-xs text-[#898781]">Loading the stars…</p>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 mx-auto w-[min(720px,94%)] pb-4">
        <div className="rounded-2xl border border-white/15 bg-[#141413]/85 p-3 shadow-2xl backdrop-blur sm:p-4">
          {/* Minimise / expand the readouts (all screens) so the sky can be
              seen in full; when minimised, show the essentials inline */}
          <div className="mb-2 flex items-center gap-2">
            {!detailsOpen && (
              <span className="min-w-0 truncate text-sm text-white">
                <span className="font-semibold">{band.label}</span>
                <span className="text-[#c3c2b7]"> · about {formatStarCount(starCount)} stars</span>
              </span>
            )}
            <button
              onClick={() => setDetailsOpen((o) => !o)}
              aria-expanded={detailsOpen}
              aria-label={detailsOpen ? "Minimise the panel" : "Expand the panel"}
              className="ml-auto shrink-0 rounded-full border border-white/15 px-2.5 py-0.5 text-[11px] text-[#c3c2b7] transition-colors hover:text-white"
            >
              {detailsOpen ? "Minimise ▾" : "Expand ▴"}
            </button>
          </div>
          <input
            type="range"
            min={MPSAS_MIN}
            max={MPSAS_MAX}
            step={0.05}
            value={mpsas}
            onChange={(e) => setSky(Number(e.target.value), null)}
            aria-label="Sky quality, from pristine dark sky on the left to inner city on the right"
            aria-valuetext={`${band.label}: ${mpsas.toFixed(1)} magnitudes per square arcsecond, about ${formatStarCount(starCount)} stars visible`}
            className="ep-slider w-full"
            style={{
              direction: "rtl",
              background: "linear-gradient(to right, #101d38, #4a3a24, #b67a3a)",
            }}
          />
          <div className="mt-1 flex justify-between text-[10px] text-[#898781]">
            {SKY_BANDS.map((b) => (
              <span key={b.label} className={b.label === band.label ? "font-semibold text-white" : ""}>
                {b.label}
              </span>
            ))}
          </div>

          <div
            aria-live="polite"
            className={`mt-3 gap-3 sm:grid-cols-2 ${detailsOpen ? "grid" : "hidden"}`}
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-white">{band.label}</span>
                <span className="flex gap-1">
                  <button
                    onClick={toggleGuides}
                    aria-pressed={guides}
                    className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                      guides
                        ? "border-white/30 bg-white/10 text-white"
                        : "border-white/10 text-[#898781] hover:text-[#c3c2b7]"
                    }`}
                  >
                    Constellations {guides ? "on" : "off"}
                  </button>
                  <button
                    onClick={savePostcard}
                    className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-[#898781] transition-colors hover:border-white/20 hover:text-white"
                  >
                    Save image ↓
                  </button>
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-snug text-[#c3c2b7]">{band.blurb}</p>
              <dl className="mt-2 space-y-1 text-xs text-[#898781]">
                <div className="flex justify-between gap-3">
                  <dt>Stars visible</dt>
                  <dd className="tabular-nums text-[#c3c2b7]">about {formatStarCount(starCount)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Faintest star you can see</dt>
                  <dd className="tabular-nums text-[#c3c2b7]">magnitude {limit.toFixed(1)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Sky brightness</dt>
                  <dd className="tabular-nums text-[#c3c2b7]">{mpsas.toFixed(1)} mag/arcsec²</dd>
                </div>
              </dl>
              <div className="mt-3">
                <div className="flex justify-between text-[10px] text-[#898781]">
                  <span className="font-semibold uppercase tracking-wider">Time of year</span>
                  <span className="text-[#c3c2b7]">{MONTHS[month]} · 10pm</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={11}
                  step={1}
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  aria-label="Month of the year"
                  aria-valuetext={MONTHS[month]}
                  className="ep-slider mt-1 w-full"
                />
              </div>
              {escape && (
                <p className="mt-3 rounded-lg border border-[#2dbe78]/20 bg-[#2dbe78]/5 p-2 text-xs leading-snug text-[#9fd8b4]">
                  Darker sky: about {escape.km} km to the {escape.direction} the
                  sky reaches {escape.mpsas.toFixed(1)} mag/arcsec², roughly{" "}
                  {formatStarCount(starsAboveHorizon(nelm(escape.mpsas)))} stars.
                </p>
              )}
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#898781]">
                What this sky still shows you
              </div>
              <ul className="mt-1.5 space-y-1 text-xs">
                {SKY_FEATURES.map((f) => {
                  const st = featureStatus(
                    f.label,
                    f.minMpsas,
                    mpsas,
                    skyRef.current?.objects ?? null,
                    viewerLat
                  );
                  return (
                    <li key={f.label} className={st.dimmed ? "text-[#52514e]" : "text-[#c3c2b7]"}>
                      {st.symbol} {f.label}
                      {st.note ? ` · ${st.note}` : ""}
                    </li>
                  );
                })}
              </ul>

              {yearsWithData.length > 1 && (
                <div className="mt-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#898781]">
                    {cityName ? `${cityName} over time` : "Over time"}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {yearsWithData.map((d) => (
                      <button
                        key={d.year}
                        onClick={() => setSky(clamp(d.mpsas), d.year)}
                        aria-pressed={activeYear === d.year}
                        className={`rounded-full border px-2 py-0.5 text-[11px] tabular-nums transition-colors ${
                          activeYear === d.year
                            ? "border-white/30 bg-white/10 text-white"
                            : "border-white/10 text-[#898781] hover:text-[#c3c2b7]"
                        }`}
                      >
                        {d.year}
                      </button>
                    ))}
                  </div>
                  {first && last && first.year !== last.year && (
                    <p className="mt-1.5 text-xs leading-snug text-[#c3c2b7]">
                      In {first.year} about {formatStarCount(firstStars)} stars were
                      visible here; in {last.year} it is about {formatStarCount(lastStars)}.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <p className={`mt-1.5 text-center text-[10px] leading-snug text-[#898781] ${detailsOpen ? "" : "hidden"}`}>
          Sky quality:{" "}
          <a
            href="https://djlorenz.github.io/astronomy/lp2024/"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-[#c3c2b7]"
          >
            Light Pollution Atlas 2024 (David J. Lorenz)
          </a>
          , based on VIIRS satellite data from NASA/NOAA. Stars: Yale Bright Star
          Catalogue · constellation figures after Stellarium/d3-celestial. Moon
          and planets are computed for the shown evening (Moon drawn about twice
          its true size; moonlight brightening is not modelled).
        </p>
      </div>
    </div>
  );
}

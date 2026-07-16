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

/**
 * Full-screen night sky simulator: one slider takes the sky from a pristine
 * dark site to an inner city, and the canvas shows exactly what that costs.
 * Stars carry honest apparent magnitudes, so the thinning of the sky tracks
 * the real naked-eye limiting magnitude; the Milky Way and a growing amber
 * skyglow dome follow the same physics-based value (zenith brightness in
 * mag/arcsec^2 from the Light Pollution Atlas).
 *
 * When opened from a city it also carries that city's 2016-2024 history so
 * people can scrub through how their own sky has changed.
 */

const MPSAS_MIN = 16.5;
const MPSAS_MAX = 22.0;

// Tunable feel constants
const STAR_FADE_MAG = 0.8; // soft fade width at the visibility limit
const GLOW_EASE = 1.6; // skyglow ramp: g = t^GLOW_EASE
const MW_FADE: [number, number] = [20.1, 21.4]; // Milky Way smoothstep window

/* ---- canvas building blocks (adapted from Starfield.tsx, which is
        coupled to the globe mask and so not imported directly) ---- */

const STAR_COLOURS: [string, number][] = [
  ["202,215,255", 0.14],
  ["232,238,255", 0.2],
  ["255,255,255", 0.3],
  ["255,244,232", 0.2],
  ["255,231,200", 0.11],
  ["255,214,170", 0.05],
];

function makeRand(seed: number) {
  return () => {
    seed ^= seed << 13;
    seed ^= seed >> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0x100000000;
  };
}

function pickColour(rand: () => number): string {
  let u = rand();
  for (const [rgb, w] of STAR_COLOURS) {
    if (u < w) return rgb;
    u -= w;
  }
  return "255,255,255";
}

/** Milky Way arc across the upper two thirds of the frame (0..1 of height). */
function bandCentre(t: number): number {
  return (0.78 - 0.62 * t + 0.06 * Math.sin(t * Math.PI * 1.7)) * 0.72;
}

type SimStar = {
  x: number;
  y: number;
  mag: number;
  r: number;
  baseAlpha: number;
  colour: string;
  twinkle: boolean;
  phase: number;
  speed: number;
};

function buildStars(W: number, H: number, horizonY: number): SimStar[] {
  const rand = makeRand(0x51a7b3c9);
  const stars: SimStar[] = [];
  const count = Math.min(3000, Math.round((W * H) / 550));
  for (let i = 0; i < count; i++) {
    // Inverse-CDF of real cumulative counts: N(<m) roughly triples per mag
    const mag = Math.max(0.5, 6.8 + Math.log10(rand() + 1e-4) / 0.51);
    const b = Math.min(Math.max((6.8 - mag) / 6.3, 0), 1);
    let x = rand() * W;
    let y = rand() * horizonY;
    if (i % 4 === 0) {
      const t = rand();
      x = t * W;
      y = Math.min(horizonY, (bandCentre(t) + (rand() + rand() - 1) * 0.1) * H);
    }
    stars.push({
      x,
      y,
      mag,
      r: 0.3 + 1.6 * Math.pow(b, 1.3),
      baseAlpha: 0.1 + 0.85 * b,
      colour: pickColour(rand),
      twinkle: b > 0.55 && rand() < 0.5,
      phase: rand() * Math.PI * 2,
      speed: rand() * 0.6 + 0.25,
    });
  }
  return stars;
}

function paintMilkyWay(W: number, H: number): HTMLCanvasElement {
  const off = document.createElement("canvas");
  off.width = W;
  off.height = H;
  const ctx = off.getContext("2d")!;
  const rand = makeRand(0x9e3779b9);
  const blobs = Math.round(W / 6);
  for (let i = 0; i < blobs; i++) {
    const t = rand();
    const cx = t * W;
    const spread = 0.04 + 0.05 * Math.sin(t * Math.PI);
    const cy = (bandCentre(t) + (rand() + rand() - 1) * spread) * H;
    const radius = (0.03 + rand() * 0.075) * Math.max(W, H);
    const warm = rand() < 0.3;
    const a = 0.014 + rand() * 0.024;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, `rgba(${warm ? "228,214,200" : "196,210,238"},${a.toFixed(3)})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 12; i++) {
    const t = 0.15 + rand() * 0.7;
    const cx = t * W;
    const cy = bandCentre(t) * H + (rand() - 0.5) * 0.04 * H;
    const radius = (0.02 + rand() * 0.04) * Math.max(W, H);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, `rgba(0,0,0,${(0.25 + rand() * 0.3).toFixed(2)})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }
  ctx.globalCompositeOperation = "source-over";
  return off;
}

type Silhouette = {
  layer: HTMLCanvasElement;
  windows: { x: number; y: number; r: number }[];
};

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
  // Treeline: a jittery walk with occasional soft bumps
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
  // A small clustered skyline at the centre: the glow has a source
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

/** Lerp between the pristine and inner-city colour for one gradient stop. */
function lerpRgb(from: [number, number, number], to: [number, number, number], g: number): string {
  const c = from.map((f, i) => Math.round(f + (to[i] - f) * g));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function SkySimulator({
  initialMpsas,
  cityName,
  series,
  onClose,
}: {
  initialMpsas?: number;
  cityName?: string;
  /** Per-year mpsas values aligned with ATLAS_YEARS (from sky-quality.json) */
  series?: (number | null)[];
  onClose: () => void;
}) {
  const clamp = (v: number) => Math.min(Math.max(v, MPSAS_MIN), MPSAS_MAX);
  const [mpsas, setMpsas] = useState(() => clamp(initialMpsas ?? 21.9));
  const [activeYear, setActiveYear] = useState<number | null>(() =>
    initialMpsas !== undefined && series ? ATLAS_YEARS[ATLAS_YEARS.length - 1] : null
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const targetRef = useRef(mpsas);
  targetRef.current = mpsas;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Canvas engine: offscreens built per size, repainted per frame (twinkle +
  // eased transitions) or once per change under reduced motion.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let stars: SimStar[] = [];
    let milkyWay: HTMLCanvasElement | null = null;
    let silhouette: Silhouette | null = null;
    let W = 0;
    let H = 0;
    let horizonY = 0;
    let disp = targetRef.current; // displayed mpsas eases toward the target

    const paint = (time?: number) => {
      const ctx = canvas.getContext("2d");
      if (!ctx || !silhouette || !milkyWay) return;
      const t = Math.min(Math.max((MPSAS_MAX - disp) / 5.5, 0), 1);
      const g = Math.pow(t, GLOW_EASE);
      const limit = nelm(disp);

      // Sky: vertical gradient from zenith to horizon
      const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
      sky.addColorStop(0, lerpRgb([6, 10, 20], [44, 37, 28], g));
      sky.addColorStop(0.62, lerpRgb([10, 15, 28], [98, 71, 44], g));
      sky.addColorStop(1, lerpRgb([17, 23, 37], [182, 122, 58], g));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Milky Way
      const mw = smoothstep(MW_FADE[0], MW_FADE[1], disp);
      if (mw > 0) {
        ctx.globalAlpha = mw;
        ctx.drawImage(milkyWay, 0, 0);
        ctx.globalAlpha = 1;
      }

      // Stars, thinned by the naked-eye limit and washed by sky brightness
      const wash = 1 - 0.35 * t;
      for (const st of stars) {
        const vis = Math.min(Math.max((limit - st.mag) / STAR_FADE_MAG, 0), 1);
        if (vis <= 0) continue;
        let a = st.baseAlpha * vis * wash;
        if (st.twinkle && time !== undefined)
          a *= 0.7 + 0.3 * Math.sin(time * 0.0009 * st.speed + st.phase);
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${st.colour},${a.toFixed(3)})`;
        ctx.fill();
      }

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

      // Ground silhouette, then its windows lighting up with pollution
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
      stars = buildStars(W, H, horizonY);
      milkyWay = paintMilkyWay(W, H);
      silhouette = paintSilhouette(W, H, horizonY);
      paint();
    };

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) build(Math.round(width), Math.round(height));
    });
    ro.observe(canvas);
    if (canvas.offsetWidth) build(canvas.offsetWidth, canvas.offsetHeight);

    let lastRaf = 0;
    if (!reduced) {
      // No document.hidden gate: browsers already stop rAF in hidden tabs,
      // and gating breaks embedded webviews that report hidden while visible.
      // Time-based ease so the transition speed is frame-rate independent.
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
      ro.disconnect();
      cancelAnimationFrame(raf);
      canvas.removeEventListener("sky-repaint", repaintNow);
    };
  }, []);

  const setSky = useCallback((v: number, year: number | null) => {
    setMpsas(v);
    setActiveYear(year);
    targetRef.current = v;
    canvasRef.current?.dispatchEvent(new Event("sky-repaint"));
  }, []);

  const band = bandFor(mpsas);
  const limit = nelm(mpsas);
  const starCount = starsAboveHorizon(limit);

  // Historical delta line: first year with data vs the most recent
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
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />

      <button
        ref={closeRef}
        onClick={onClose}
        aria-label="Close the night sky simulator"
        className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/40 text-[#c3c2b7] backdrop-blur hover:bg-white/10 hover:text-white"
      >
        ✕
      </button>

      <div className="pointer-events-none absolute left-4 top-4 z-10">
        <h2 className="text-lg font-semibold tracking-tight text-white">
          {cityName ? `The night sky over ${cityName}` : "Night sky simulator"}
        </h2>
        <p className="text-sm text-[#c3c2b7]">
          Drag the slider to see what light pollution takes away.
        </p>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 mx-auto w-[min(720px,94%)] pb-4">
        <div className="rounded-2xl border border-white/15 bg-[#141413]/85 p-4 shadow-2xl backdrop-blur">
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

          <div aria-live="polite" className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-sm font-semibold text-white">{band.label}</div>
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
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#898781]">
                What this sky still shows you
              </div>
              <ul className="mt-1.5 space-y-1 text-xs">
                {SKY_FEATURES.map((f) => {
                  const visible = mpsas >= f.minMpsas;
                  return (
                    <li
                      key={f.label}
                      className={visible ? "text-[#c3c2b7]" : "text-[#52514e]"}
                    >
                      {visible ? "✓ " : "✕ "}
                      {f.label}
                      {visible ? "" : " · lost"}
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
        <p className="mt-1.5 text-center text-[10px] leading-snug text-[#898781]">
          Sky quality:{" "}
          <a
            href="https://djlorenz.github.io/astronomy/lp2024/"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-[#c3c2b7]"
          >
            Light Pollution Atlas 2024 (David J. Lorenz)
          </a>
          , based on VIIRS satellite data from NASA/NOAA. The simulation approximates
          a clear, moonless night.
        </p>
      </div>
    </div>
  );
}

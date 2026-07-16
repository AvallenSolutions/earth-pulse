"use client";
import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";
import { globePixelRadius } from "./GlobeAtmosphere";

/**
 * A realistic night sky behind the globe: thousands of stars with a natural
 * magnitude distribution and temperature-based colours, a soft Milky Way band,
 * and a faint halo on the brightest few. Everything static is pre-rendered to
 * an offscreen canvas once; only the handful of twinkling stars redraw per
 * frame. The canvas screen-blends over the WebGL map so stars show only in
 * dark space and vanish on the bright globe disc.
 */

interface Star {
  x: number;
  y: number;
  r: number;
  alpha: number;
  colour: string;
  twinkle: boolean;
  phase: number;
  speed: number;
}

/** Stellar colours, weighted roughly like the night sky looks to the eye:
 *  mostly white, some blue-white, a few warm yellow-orange giants. */
const STAR_COLOURS: [string, number][] = [
  ["202,215,255", 0.14], // blue-white (O/B)
  ["232,238,255", 0.2], // white-blue (A)
  ["255,255,255", 0.3], // white (F)
  ["255,244,232", 0.2], // yellow-white (G)
  ["255,231,200", 0.11], // orange (K)
  ["255,214,170", 0.05], // red-orange (M giants)
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

/** The Milky Way arc through the scene: for a given x (as 0..1 of width),
 *  the band centre y (as 0..1 of height). A gentle diagonal sweep. */
function bandCentre(t: number): number {
  return 0.78 - 0.62 * t + 0.06 * Math.sin(t * Math.PI * 1.7);
}

function buildStars(W: number, H: number): Star[] {
  const rand = makeRand(0x2f6e2b1a);
  const stars: Star[] = [];
  const count = Math.min(2200, Math.round((W * H) / 700));

  for (let i = 0; i < count; i++) {
    // Power-law brightness: most stars faint, a rare few bright
    const u = Math.pow(rand(), 3.2);
    const bright = u > 0.82;
    // A third of the stars cluster along the Milky Way band
    let x = rand() * W;
    let y = rand() * H;
    if (i % 4 === 0) {
      const t = rand();
      x = t * W;
      y = (bandCentre(t) + (rand() + rand() - 1) * 0.13) * H;
    }
    stars.push({
      x,
      y,
      r: 0.25 + u * 1.15,
      alpha: 0.08 + u * 0.82,
      colour: pickColour(rand),
      twinkle: bright && rand() < 0.55,
      phase: rand() * Math.PI * 2,
      speed: rand() * 0.6 + 0.25,
    });
  }
  return stars;
}

/** Pre-render the Milky Way and all non-twinkling stars. */
function paintStatic(W: number, H: number, stars: Star[]): HTMLCanvasElement {
  const off = document.createElement("canvas");
  off.width = W;
  off.height = H;
  const ctx = off.getContext("2d")!;
  const rand = makeRand(0x9e3779b9);

  // Milky Way: many overlapping soft blobs along the band, denser mid-arc
  const blobs = Math.round(W / 6);
  for (let i = 0; i < blobs; i++) {
    const t = rand();
    const cx = t * W;
    const spread = 0.05 + 0.07 * Math.sin(t * Math.PI); // widest mid-band
    const cy = (bandCentre(t) + (rand() + rand() - 1) * spread) * H;
    const radius = (0.03 + rand() * 0.075) * Math.max(W, H);
    const warm = rand() < 0.3;
    const a = 0.008 + rand() * 0.014;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, `rgba(${warm ? "228,214,200" : "196,210,238"},${a.toFixed(3)})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }
  // Dust lanes: subtle darker streaks through the band core
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 14; i++) {
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

  for (const st of stars) {
    if (st.twinkle) continue;
    drawStar(ctx, st, st.alpha);
  }
  return off;
}

function drawStar(ctx: CanvasRenderingContext2D, st: Star, alpha: number) {
  // The brightest stars get a soft halo, like slight glare
  if (st.r > 1.05) {
    const g = ctx.createRadialGradient(st.x, st.y, 0, st.x, st.y, st.r * 5);
    g.addColorStop(0, `rgba(${st.colour},${(alpha * 0.35).toFixed(3)})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(st.x - st.r * 5, st.y - st.r * 5, st.r * 10, st.r * 10);
  }
  ctx.beginPath();
  ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${st.colour},${alpha.toFixed(3)})`;
  ctx.fill();
}

export function Starfield({
  map,
  globeOn,
}: {
  /** When set (globe projection on), the planet's disc is masked out of the
   *  sky so stars never show through the dark night side of the Earth. */
  map: maplibregl.Map | null;
  globeOn: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let sizeKey = "";
    let repaint: (() => void) | null = null;

    // Erase the globe's disc (always screen-centred in globe projection) so
    // stars never show through the dark night side of the planet.
    const maskGlobe = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
      if (!map || !globeOn) return;
      const r = globePixelRadius(map) * dpr;
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const build = (cssW: number, cssH: number) => {
      const key = `${cssW}x${cssH}`;
      if (key === sizeKey) return;
      sizeKey = key;
      cancelAnimationFrame(raf);

      const W = Math.round(cssW * dpr);
      const H = Math.round(cssH * dpr);
      canvas.width = W;
      canvas.height = H;

      const stars = buildStars(W, H);
      const staticLayer = paintStatic(W, H, stars);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const twinklers = stars.filter((st) => st.twinkle);
      const paintFrame = (t?: number) => {
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(staticLayer, 0, 0);
        for (const st of twinklers) {
          const a =
            t === undefined
              ? st.alpha
              : st.alpha * (0.55 + 0.45 * Math.sin(t * 0.0009 * st.speed + st.phase));
          drawStar(ctx, st, a);
        }
        maskGlobe(ctx, W, H);
      };
      repaint = () => paintFrame();

      // First paint immediately (even in hidden/backgrounded tabs) so the sky
      // is never blank; the rAF loop only animates the twinkle on top.
      paintFrame();
      if (reduced) return;

      const draw = (t: number) => {
        if (!document.hidden) paintFrame(t);
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    };

    // The globe disc grows with zoom and with latitude (the projection matches
    // mercator scale at the centre); repaint the mask even when the rAF loop
    // is paused (reduced motion or a backgrounded tab).
    const onZoom = () => repaint?.();
    map?.on("zoom", onZoom);
    map?.on("move", onZoom);

    // ResizeObserver fires once the element has layout dimensions (and again
    // on window resize, rebuilding the sky at the new size).
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) build(Math.round(width), Math.round(height));
    });
    ro.observe(canvas);

    // Immediate path for normal browsers where dimensions are already known.
    // Fall back to screen size (divided by DPR for logical pixels) for embedded
    // preview environments where offsetWidth and window.innerWidth are both 0.
    const W =
      canvas.offsetWidth ||
      window.innerWidth ||
      Math.round(screen.width / dpr) ||
      1280;
    const H =
      canvas.offsetHeight ||
      window.innerHeight ||
      Math.round(screen.height / dpr) ||
      800;
    if (W > 0 && H > 0) build(W, H);

    return () => {
      map?.off("zoom", onZoom);
      map?.off("move", onZoom);
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [map, globeOn]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
      // On the flat projection the map fills the viewport, so the sky is
      // simply hidden rather than masked
      style={{ mixBlendMode: "screen", display: globeOn ? undefined : "none" }}
    />
  );
}

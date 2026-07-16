"use client";
import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";
import { globePixelRadius } from "./GlobeAtmosphere";
import {
  dot,
  fetchStars,
  gmstHours,
  kelvinToRgb,
  milkyWayBlobs,
  raDecToVec,
  skyBasis,
  type Vec3,
} from "@/lib/celestial";

/**
 * The real night sky behind the globe. Every star is a genuine catalogue
 * star (Yale Bright Star Catalogue) and the Milky Way follows the real
 * galactic plane, so the background is the actual patch of celestial sphere
 * behind the Earth for the current view: pan the globe and the true sky
 * slides past with it.
 *
 * Geometry: a viewer above the map centre looking down sees, behind the
 * planet, the sky around the antipodal zenith (RA = sidereal time at the
 * centre longitude + 12h, Dec = -latitude). Stars are projected
 * stereographically around that point with celestial north up. The globe's
 * disc is masked out each frame so stars never show through the dark side,
 * and the canvas screen-blends over the WebGL map.
 */

type ProjStar = {
  x: number;
  y: number;
  r: number;
  a: number;
  colour: string;
  twinkle: boolean;
  phase: number;
  speed: number;
};

type CatStar = { mag: number; k: number; v: Vec3; ra: number; dec: number };

const DIAG_HALF_FOV = 62; // degrees of sky from screen centre to corner

export function Starfield({
  map,
  globeOn,
}: {
  /** When set (globe projection on), the planet's disc is masked out of the
   *  sky so stars never show through the dark night side. */
  map: maplibregl.Map | null;
  globeOn: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const gmst = gmstHours(Date.now());
    let raf = 0;
    let W = 0;
    let H = 0;
    let stars: CatStar[] = [];
    const blobs = milkyWayBlobs().map((b) => ({ ...b, v: raDecToVec(b.ra, b.dec) }));
    let projected: ProjStar[] = [];
    let mwLayer: HTMLCanvasElement | null = null;
    let viewKey = "";
    let disposed = false;

    const centre = () => {
      const c = map?.getCenter();
      const lon = c?.lng ?? 0;
      const lat = c?.lat ?? 20;
      return {
        ra: ((gmst * 15 + lon + 180) % 360 + 360) % 360,
        dec: Math.min(85, Math.max(-85, -lat)),
      };
    };

    /** Recompute the projected sky for the current view centre. */
    const project = () => {
      if (!W || !H) return;
      const { ra, dec } = centre();
      const { f, e, n } = skyBasis(ra, dec);
      const fl = Math.hypot(W, H) / 2 / (2 * Math.tan(((DIAG_HALF_FOV / 2) * Math.PI) / 180));
      const cx = W / 2;
      const cy = H / 2;
      const cull = Math.cos(((DIAG_HALF_FOV + 8) * Math.PI) / 180);

      projected = [];
      for (const st of stars) {
        const d = dot(f, st.v);
        if (d < cull) continue;
        const k = (2 * fl) / (1 + d);
        const x = cx + k * dot(e, st.v);
        const y = cy - k * dot(n, st.v);
        if (x < -24 || x > W + 24 || y < -24 || y > H + 24) continue;
        const b = Math.min(Math.max((6.7 - st.mag) / 7, 0), 1);
        projected.push({
          x,
          y,
          r: (0.35 + 2.3 * b * b) * (dpr / 2 + 0.5),
          a: 0.15 + 0.85 * b,
          colour: kelvinToRgb(st.k),
          // Deterministic per star so panning does not reshuffle the sky
          twinkle: st.mag < 3.6 && (st.ra * 100) % 7 < 3,
          phase: ((st.ra * 13.7) % 6.28) + st.dec / 90,
          speed: 0.3 + (((st.dec * 7.31 + st.ra) % 1) + 1) % 1 * 0.5,
        });
      }

      // The Milky Way band, projected the same way onto its own layer
      mwLayer ??= document.createElement("canvas");
      if (mwLayer.width !== W || mwLayer.height !== H) {
        mwLayer.width = W;
        mwLayer.height = H;
      }
      const mctx = mwLayer.getContext("2d")!;
      mctx.clearRect(0, 0, W, H);
      const degPx = (2 * fl * Math.PI) / 360; // px per degree near centre
      for (const pass of [false, true]) {
        mctx.globalCompositeOperation = pass ? "destination-out" : "source-over";
        for (const bl of blobs) {
          if (bl.dark !== pass) continue;
          const d = dot(f, bl.v);
          if (d < cull) continue;
          const k = (2 * fl) / (1 + d);
          const x = cx + k * dot(e, bl.v);
          const y = cy - k * dot(n, bl.v);
          const radius = bl.size * degPx;
          if (x < -radius || x > W + radius || y < -radius || y > H + radius) continue;
          const g = mctx.createRadialGradient(x, y, 0, x, y, radius);
          const tint = bl.dark ? "0,0,0" : bl.warm ? "228,212,196" : "198,210,236";
          g.addColorStop(0, `rgba(${tint},${bl.alpha.toFixed(3)})`);
          g.addColorStop(1, `rgba(${tint},0)`);
          mctx.fillStyle = g;
          mctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
      }
      mctx.globalCompositeOperation = "source-over";
    };

    const maskGlobe = (ctx: CanvasRenderingContext2D) => {
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

    const paint = (time?: number) => {
      const ctx = canvas.getContext("2d");
      if (!ctx || !W || !H) return;
      ctx.clearRect(0, 0, W, H);
      if (mwLayer) ctx.drawImage(mwLayer, 0, 0);
      for (const st of projected) {
        let a = st.a;
        if (st.twinkle && time !== undefined)
          a *= 0.72 + 0.28 * Math.sin(time * 0.0011 * st.speed + st.phase);
        if (st.r > 1.7) {
          // Bright star: soft halo plus a crisp core
          const g = ctx.createRadialGradient(st.x, st.y, 0, st.x, st.y, st.r * 4.5);
          g.addColorStop(0, `rgba(${st.colour},${(a * 0.5).toFixed(3)})`);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.fillRect(st.x - st.r * 4.5, st.y - st.r * 4.5, st.r * 9, st.r * 9);
          ctx.beginPath();
          ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${st.colour},${a.toFixed(3)})`;
          ctx.fill();
        } else {
          // Fast path for the thousands of faint stars
          const s = Math.max(1, st.r * 1.6);
          ctx.fillStyle = `rgba(${st.colour},${a.toFixed(3)})`;
          ctx.fillRect(st.x - s / 2, st.y - s / 2, s, s);
        }
      }
      maskGlobe(ctx);
    };

    const refresh = () => {
      const c = map?.getCenter();
      const key = `${c?.lng.toFixed(2)},${c?.lat.toFixed(2)},${W}x${H},${map ? globePixelRadius(map).toFixed(0) : 0}`;
      if (key !== viewKey) {
        viewKey = key;
        project();
      }
      paint();
    };

    const build = (cssW: number, cssH: number) => {
      W = Math.round(cssW * dpr);
      H = Math.round(cssH * dpr);
      canvas.width = W;
      canvas.height = H;
      viewKey = "";
      refresh();
    };

    fetchStars().then((catalogue) => {
      if (disposed) return;
      stars = catalogue.map((s) => ({
        mag: s.mag,
        k: s.k,
        ra: s.ra,
        dec: s.dec,
        v: raDecToVec(s.ra, s.dec),
      }));
      viewKey = "";
      refresh();
    });

    // The sky slides with the globe: reproject on pan/zoom, repaint on both
    const onMove = () => refresh();
    map?.on("move", onMove);
    map?.on("zoom", onMove);

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) build(Math.round(width), Math.round(height));
    });
    ro.observe(canvas);

    // Immediate path for normal browsers; screen-size fallback for embedded
    // panes where layout reports zero
    const cssW = canvas.offsetWidth || window.innerWidth || Math.round(screen.width / dpr) || 1280;
    const cssH = canvas.offsetHeight || window.innerHeight || Math.round(screen.height / dpr) || 800;
    if (cssW > 0 && cssH > 0) build(cssW, cssH);

    if (!reduced) {
      const tick = (time: number) => {
        paint(time);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      map?.off("move", onMove);
      map?.off("zoom", onMove);
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

"use client";
import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";
import { globePixelRadius } from "./GlobeAtmosphere";

/**
 * Humanity's hardware in orbit, drawn as a living swarm around the globe and
 * driven by the map's year slider: two dots in 1957, a blizzard of tens of
 * thousands today. Counts are real (CelesTrak's SATCAT, objects in Earth
 * orbit at the end of each year, payloads vs rocket bodies and debris); the
 * orbits are stylised. Each dot follows a genuine 3D circular orbit around
 * the globe's screen position (orthographic projection): satellites slip
 * behind the planet and re-emerge, and the geostationary belt rings the
 * equator, tilting with the view. One dot stands for several objects and
 * altitudes are compressed to stay on screen.
 */

type SatCounts = { years: number[]; payloads: number[]; debris: number[] };

let countsPromise: Promise<SatCounts> | null = null;
export function fetchSatCounts(): Promise<SatCounts> {
  countsPromise ??= fetch("/data/satellites.json")
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .catch(() => ({ years: [], payloads: [], debris: [] }));
  return countsPromise;
}

/** Objects represented by one dot (keeps the 2020s renderable) */
export const OBJECTS_PER_DOT = 6;
const MAX_DOTS = 7000;

/** Deterministic pseudo-random stream per dot index */
function h(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

type Dot = {
  /** Orbit basis vectors (u, v) and angular speed; pos = R(cos a u + sin a v) */
  ux: number; uy: number; uz: number;
  vx: number; vy: number; vz: number;
  theta0: number;
  omega: number;
  shell: number;
  geo: boolean;
  payload: boolean;
};

function makeDot(i: number, payloadFraction: number): Dot {
  const geo = h(i, 1) > 0.9;
  const shell = geo ? 1.95 : 1.06 + h(i, 2) * 0.28 + (h(i, 3) > 0.9 ? h(i, 4) * 0.35 : 0);
  // Orbit normal: geostationary dots share the Earth's axis (set at draw
  // time); others get a random inclination
  const az = h(i, 5) * Math.PI * 2;
  const zz = h(i, 6) * 2 - 1;
  const rr = Math.sqrt(Math.max(0, 1 - zz * zz));
  const nx = rr * Math.cos(az);
  const ny = rr * Math.sin(az);
  const nz = zz;
  // Basis perpendicular to the normal
  const ax = Math.abs(nz) < 0.9 ? 0 : 1;
  const ay = Math.abs(nz) < 0.9 ? 0 : 0;
  const azz = Math.abs(nz) < 0.9 ? 1 : 0;
  let ux = ny * azz - nz * ay;
  let uy = nz * ax - nx * azz;
  let uz = nx * ay - ny * ax;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  const vxx = ny * uz - nz * uy;
  const vy = nz * ux - nx * uz;
  const vz = nx * uy - ny * ux;
  return {
    ux, uy, uz,
    vx: vxx, vy, vz,
    theta0: h(i, 7) * Math.PI * 2,
    omega: geo ? 0.008 : 0.03 + h(i, 8) * 0.05,
    shell,
    geo,
    payload: h(i, 9) < payloadFraction,
  };
}

export function SatelliteSwarm({
  map,
  on,
  year,
}: {
  map: maplibregl.Map | null;
  on: boolean;
  year: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const yearRef = useRef(year);
  yearRef.current = year;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map || !on) {
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let counts: SatCounts | null = null;
    let dots: Dot[] = [];
    let dotYear = -1;
    let disposed = false;

    const rebuildDots = () => {
      if (!counts || !counts.years.length) return;
      const yi = Math.min(
        Math.max(yearRef.current - counts.years[0], 0),
        counts.years.length - 1
      );
      if (counts.years[yi] === dotYear) return;
      dotYear = counts.years[yi];
      const total = counts.payloads[yi] + counts.debris[yi];
      const n = Math.min(MAX_DOTS, Math.ceil(total / OBJECTS_PER_DOT));
      const payloadFraction = total ? counts.payloads[yi] / total : 0;
      dots = [];
      for (let i = 0; i < n; i++) dots.push(makeDot(i, payloadFraction));
    };

    const paint = (time: number) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const cssW = map.getCanvas().clientWidth || canvas.offsetWidth;
      const cssH = map.getCanvas().clientHeight || canvas.offsetHeight;
      if (!cssW || !cssH) return;
      const W = Math.round(cssW * dpr);
      const H = Math.round(cssH * dpr);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      ctx.clearRect(0, 0, W, H);
      rebuildDots();
      if (!dots.length) return;

      const rg = globePixelRadius(map) * dpr;
      const cx = W / 2;
      const cy = H / 2;
      if (rg > Math.hypot(cx, cy) * 2.2) return; // zoomed right in: skip

      // Earth's axis on screen (north up, tilted towards the viewer by the
      // view latitude) for the geostationary belt
      const lat = (map.getCenter().lat * Math.PI) / 180;
      const axX = 0;
      const axY = -Math.cos(lat);
      const axZ = Math.sin(lat);
      // Belt basis: axis x world-x
      const buX = 1, buY = 0, buZ = 0;
      const bvX = axY * buZ - axZ * buY;
      const bvY = axZ * buX - axX * buZ;
      const bvZ = axX * buY - axY * buX;

      const tSec = time / 1000;
      for (const d of dots) {
        const a = d.theta0 + d.omega * tSec;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const R = rg * d.shell;
        let px: number, py: number, pz: number;
        if (d.geo) {
          px = R * (ca * buX + sa * bvX);
          py = R * (ca * buY + sa * bvY);
          pz = R * (ca * buZ + sa * bvZ);
        } else {
          px = R * (ca * d.ux + sa * d.vx);
          py = R * (ca * d.uy + sa * d.vy);
          pz = R * (ca * d.uz + sa * d.vz);
        }
        const x = cx + px;
        const y = cy + py;
        if (x < 0 || x > W || y < 0 || y > H) continue;
        const overDisc = px * px + py * py < rg * rg;
        if (overDisc && pz < 0) continue; // behind the planet
        let alpha = d.payload ? 0.85 : 0.5;
        if (overDisc) alpha *= 0.3; // passing in front of the bright globe
        const s = (d.payload ? 1.5 : 1.1) * (dpr / 2 + 0.5);
        ctx.fillStyle = d.payload
          ? `rgba(170,205,255,${alpha.toFixed(2)})`
          : `rgba(200,180,165,${alpha.toFixed(2)})`;
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
    };

    fetchSatCounts().then((c) => {
      if (disposed) return;
      counts = c;
      paint(performance.now());
    });

    const onMove = () => paint(performance.now());
    map.on("move", onMove);
    map.on("zoom", onMove);
    canvas.addEventListener("swarm-year", onMove);

    if (!reduced) {
      const tick = (time: number) => {
        paint(time);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      map.off("move", onMove);
      map.off("zoom", onMove);
      canvas.removeEventListener("swarm-year", onMove);
      cancelAnimationFrame(raf);
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [map, on]);

  // Repaint promptly when the year changes under reduced motion or stalled rAF
  useEffect(() => {
    canvasRef.current?.dispatchEvent(new Event("swarm-year"));
  }, [year]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
      style={{ display: on ? undefined : "none" }}
    />
  );
}

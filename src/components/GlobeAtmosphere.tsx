"use client";
import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";

/**
 * The globe's on-screen pixel radius. MapLibre's globe projection keeps the
 * sphere centred in the viewport and matches the mercator scale at the centre
 * latitude, so the radius is worldSize / 2 pi scaled by sec(latitude).
 */
export function globePixelRadius(map: maplibregl.Map): number {
  const worldSize = 512 * Math.pow(2, map.getZoom());
  const lat = (map.getCenter().lat * Math.PI) / 180;
  return worldSize / (2 * Math.PI) / Math.max(Math.cos(lat), 0.05);
}

/**
 * Atmospheric limb glow around the globe: a thin bright blue rim hugging the
 * planet's edge plus a wide faint halo fading into space, drawn on a canvas
 * that screen-blends over the WebGL map. Redrawn on zoom, pan and resize;
 * fades out as the limb leaves the viewport and hides on the flat projection.
 */
export function GlobeAtmosphere({
  map,
  on,
}: {
  map: maplibregl.Map | null;
  on: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const draw = () => {
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
      if (!on) return;

      const r = globePixelRadius(map) * dpr;
      const cx = W / 2;
      const cy = H / 2;
      // Fade the glow as the limb approaches the far corners of the viewport;
      // once the globe fills the screen there is no edge left to light.
      const maxDist = Math.hypot(cx, cy);
      const fade = Math.max(0, Math.min(1, (maxDist * 1.08 - r) / (maxDist * 0.4)));
      if (fade === 0) return;

      // Thin bright rim right at the limb: the airglow line
      const rim = ctx.createRadialGradient(cx, cy, r * 0.965, cx, cy, r * 1.075);
      rim.addColorStop(0, "rgba(70,130,220,0)");
      rim.addColorStop(0.33, `rgba(105,165,240,${(0.5 * fade).toFixed(3)})`);
      rim.addColorStop(0.52, `rgba(140,190,250,${(0.34 * fade).toFixed(3)})`);
      rim.addColorStop(1, "rgba(70,130,220,0)");
      ctx.fillStyle = rim;
      ctx.fillRect(0, 0, W, H);

      // Wide soft halo scattering into space
      const halo = ctx.createRadialGradient(cx, cy, r * 1.0, cx, cy, r * 1.32);
      halo.addColorStop(0, `rgba(70,125,215,${(0.22 * fade).toFixed(3)})`);
      halo.addColorStop(0.45, `rgba(45,90,175,${(0.08 * fade).toFixed(3)})`);
      halo.addColorStop(1, "rgba(20,50,120,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, W, H);
    };

    draw();
    map.on("zoom", draw);
    map.on("move", draw);
    map.on("resize", draw);
    return () => {
      map.off("zoom", draw);
      map.off("move", draw);
      map.off("resize", draw);
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [map, on]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
      style={{ mixBlendMode: "screen" }}
    />
  );
}

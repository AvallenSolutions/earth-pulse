"use client";
import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  r: number;
  alpha: number;
  twinkle: boolean;
  phase: number;
  speed: number;
}

function buildStars(W: number, H: number): Star[] {
  // Deterministic PRNG so stars are stable across re-draws
  let seed = 0x2f6e2b1a;
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0x100000000;
  };
  const stars: Star[] = [];
  for (let i = 0; i < 220; i++) {
    const bright = i >= 212;
    const medium = i >= 185 && i < 212;
    stars.push({
      x: rand() * W,
      y: rand() * H,
      r: bright
        ? rand() * 0.65 + 0.85
        : medium
          ? rand() * 0.35 + 0.45
          : rand() * 0.3 + 0.15,
      alpha: bright
        ? rand() * 0.28 + 0.52
        : medium
          ? rand() * 0.22 + 0.22
          : rand() * 0.18 + 0.08,
      twinkle: bright,
      phase: rand() * Math.PI * 2,
      speed: rand() * 0.55 + 0.2,
    });
  }
  return stars;
}

export function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let started = false;

    const start = (W: number, H: number) => {
      if (started) return;
      started = true;
      canvas.width = W;
      canvas.height = H;

      const stars = buildStars(W, H);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (reduced) {
        for (const st of stars) {
          ctx.beginPath();
          ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${st.alpha.toFixed(2)})`;
          ctx.fill();
        }
        return;
      }

      const draw = (t: number) => {
        if (!document.hidden) {
          ctx.clearRect(0, 0, W, H);
          for (const st of stars) {
            const a = st.twinkle
              ? st.alpha * (0.5 + 0.5 * Math.sin(t * 0.001 * st.speed + st.phase))
              : st.alpha;
            ctx.beginPath();
            ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
            ctx.fill();
          }
        }
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    };

    // ResizeObserver fires once the element has layout dimensions.
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) start(Math.round(width), Math.round(height));
    });
    ro.observe(canvas);

    // Immediate path for normal browsers where dimensions are already known.
    // Fall back to screen size (divided by DPR for logical pixels) for embedded
    // preview environments where offsetWidth and window.innerWidth are both 0.
    const dpr = window.devicePixelRatio || 1;
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
    if (W > 0 && H > 0) start(W, H);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
      style={{ mixBlendMode: "screen" }}
    />
  );
}

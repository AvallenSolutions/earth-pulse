/**
 * Iconic landmark silhouettes for the night sky simulator's skyline.
 *
 * Every drawing is a pure-black silhouette (the caller sets fillStyle and
 * strokeStyle) rendered with (ctx, cx, baseY, h): centred on cx, standing on
 * baseY, h pixels tall. Shapes are parametric caricatures tuned to read at
 * 100-300 px tall against the skyglow, the way a real skyline reads at dusk.
 *
 * A handful of generators (needle towers, stepped skyscrapers, gothic
 * spires, mosques, arches, pagodas, obelisks...) cover most of the world's
 * famous buildings; the truly one-off shapes (Eiffel, Opera House, Atomium,
 * Golden Gate...) are bespoke.
 */

type Ctx = CanvasRenderingContext2D;
type Draw = (ctx: Ctx, cx: number, baseY: number, h: number) => void;

export type Landmark = {
  draw: Draw;
  /** Height as a fraction of the canvas height */
  h: number;
  /** Wide scene drawn behind the treeline rather than a building on it */
  backdrop?: boolean;
};

const r = (ctx: Ctx, x: number, y: number, w: number, hh: number) =>
  ctx.fillRect(x, y - hh, w, hh);

const circle = (ctx: Ctx, x: number, y: number, rad: number) => {
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.fill();
};

const line = (ctx: Ctx, x1: number, y1: number, x2: number, y2: number, w: number) => {
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
};

/** Tapering triangle spire with a pointed tip. */
const spire = (ctx: Ctx, x: number, yBase: number, w: number, hh: number) => {
  ctx.beginPath();
  ctx.moveTo(x - w / 2, yBase);
  ctx.lineTo(x, yBase - hh);
  ctx.lineTo(x + w / 2, yBase);
  ctx.closePath();
  ctx.fill();
};

/** Onion dome (Russian style): bulb pinched to a point. */
const onion = (ctx: Ctx, x: number, y: number, rad: number) => {
  ctx.beginPath();
  ctx.moveTo(x - rad, y);
  ctx.quadraticCurveTo(x - rad * 1.15, y - rad * 1.2, x, y - rad * 2.1);
  ctx.quadraticCurveTo(x + rad * 1.15, y - rad * 1.2, x + rad, y);
  ctx.closePath();
  ctx.fill();
  line(ctx, x, y - rad * 2.05, x, y - rad * 2.5, rad * 0.14);
};

/* ------------------------- generators ------------------------- */

type Pod = { y: number; w: number; kind: "disc" | "sphere" | "deck" | "saucer" };

/** Observation/TV towers: a tapering shaft, pods, an antenna. */
function needle(pods: Pod[], opts: { legs?: "splay"; shaftW?: number; antennaFrom?: number } = {}): Draw {
  return (ctx, cx, baseY, h) => {
    const sw = (opts.shaftW ?? 0.05) * h;
    const top = (opts.antennaFrom ?? 0.8) * h;
    // Shaft
    ctx.beginPath();
    ctx.moveTo(cx - sw / 2, baseY);
    ctx.lineTo(cx - sw * 0.28, baseY - top);
    ctx.lineTo(cx + sw * 0.28, baseY - top);
    ctx.lineTo(cx + sw / 2, baseY);
    ctx.closePath();
    ctx.fill();
    if (opts.legs === "splay") {
      ctx.beginPath();
      ctx.moveTo(cx - sw * 2.4, baseY);
      ctx.quadraticCurveTo(cx - sw * 0.5, baseY - h * 0.46, cx, baseY - h * 0.62);
      ctx.quadraticCurveTo(cx + sw * 0.5, baseY - h * 0.46, cx + sw * 2.4, baseY);
      ctx.closePath();
      ctx.fill();
    }
    for (const p of pods) {
      const y = baseY - p.y * h;
      const w = p.w * h;
      if (p.kind === "sphere") circle(ctx, cx, y, w / 2);
      else if (p.kind === "saucer") {
        ctx.beginPath();
        ctx.ellipse(cx, y, w / 2, w * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
        r(ctx, cx - w * 0.18, y + w * 0.14, w * 0.36, w * 0.1);
      } else if (p.kind === "deck") {
        // A chunky truncated-cone observation block
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.38, y + w * 0.24);
        ctx.lineTo(cx - w / 2, y - w * 0.2);
        ctx.lineTo(cx + w / 2, y - w * 0.2);
        ctx.lineTo(cx + w * 0.38, y + w * 0.24);
        ctx.closePath();
        ctx.fill();
      } else {
        // disc: lens-shaped observation level
        ctx.beginPath();
        ctx.ellipse(cx, y, w / 2, w * 0.24, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    line(ctx, cx, baseY - top, cx, baseY - h, sw * 0.16);
  };
}

/** Setback skyscrapers: stacked symmetric tiers plus antennae. */
function stepped(
  tiers: [number, number][], // [halfWidth, topY] as fractions of h, base first
  opts: { antennae?: [number, number][]; spire?: number } = {}
): Draw {
  return (ctx, cx, baseY, h) => {
    let prevTop = 0;
    for (const [hw, topY] of tiers) {
      r(ctx, cx - hw * h, baseY - prevTop * h, hw * 2 * h, (topY - prevTop) * h);
      prevTop = topY;
    }
    if (opts.spire) spire(ctx, cx, baseY - prevTop * h, 0.05 * h, (opts.spire - prevTop) * h);
    for (const [dx, ah] of opts.antennae ?? [])
      line(ctx, cx + dx * h, baseY - prevTop * h, cx + dx * h, baseY - ah * h, 0.012 * h);
  };
}

/** Great domed sanctuaries: central dome, half-domes, pencil minarets. */
function mosque(minaretX: number[], sideDomes = true): Draw {
  return (ctx, cx, baseY, h) => {
    r(ctx, cx - 0.42 * h, baseY, 0.84 * h, 0.2 * h);
    ctx.beginPath();
    ctx.arc(cx, baseY - 0.2 * h, 0.3 * h, Math.PI, 0);
    ctx.fill();
    if (sideDomes)
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(cx + s * 0.3 * h, baseY - 0.14 * h, 0.17 * h, Math.PI, 0);
        ctx.fill();
      }
    line(ctx, cx, baseY - 0.5 * h, cx, baseY - 0.56 * h, 0.015 * h);
    for (const mx of minaretX) {
      const x = cx + mx * h;
      r(ctx, x - 0.02 * h, baseY, 0.04 * h, 0.82 * h);
      r(ctx, x - 0.035 * h, baseY - 0.5 * h, 0.07 * h, 0.02 * h);
      spire(ctx, x, baseY - 0.82 * h, 0.06 * h, 0.14 * h);
    }
  };
}

/** Gothic cathedrals: tapering spires with cross finials over a nave. */
function gothic(spires: [number, number, number][], naveW = 0.7, naveH = 0.3): Draw {
  return (ctx, cx, baseY, h) => {
    r(ctx, cx - (naveW / 2) * h, baseY, naveW * h, naveH * h);
    for (const [dx, sh, sw] of spires) {
      const x = cx + dx * h;
      r(ctx, x - (sw / 2) * h, baseY, sw * h, sh * 0.55 * h);
      spire(ctx, x, baseY - sh * 0.55 * h, sw * 1.15 * h, sh * 0.45 * h);
      line(ctx, x, baseY - sh * h, x, baseY - sh * h - 0.04 * h, 0.012 * h);
    }
  };
}

/** Triumphal arches and gateways: a block with carved openings. */
function archway(openings: number, opts: { turrets?: boolean; attic?: number } = {}): Draw {
  return (ctx, cx, baseY, h) => {
    const w = 0.78 * h;
    r(ctx, cx - w / 2, baseY, w, 0.8 * h);
    r(ctx, cx - w * 0.42, baseY - 0.8 * h, w * 0.84, (opts.attic ?? 0.16) * h);
    // Carve the openings out of the block
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    const span = w * 0.72;
    for (let i = 0; i < openings; i++) {
      const ox = cx - span / 2 + (span / (openings * 2)) * (2 * i + 1);
      const ow = (span / openings) * 0.52;
      ctx.beginPath();
      ctx.moveTo(ox - ow / 2, baseY);
      ctx.lineTo(ox - ow / 2, baseY - 0.42 * h);
      ctx.arc(ox, baseY - 0.42 * h, ow / 2, Math.PI, 0);
      ctx.lineTo(ox + ow / 2, baseY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    if (opts.turrets)
      for (const s of [-1, 1]) {
        circle(ctx, cx + s * w * 0.38, baseY - 0.93 * h, 0.035 * h);
        circle(ctx, cx + s * w * 0.18, baseY - 0.99 * h, 0.03 * h);
      }
  };
}

/** East Asian pagodas: stacked winged roofs on a shrinking body. */
function pagoda(tiers: number, round = false): Draw {
  return (ctx, cx, baseY, h) => {
    const tierH = 0.85 / tiers;
    for (let i = 0; i < tiers; i++) {
      const y = baseY - i * tierH * h;
      const w = (0.62 - i * (0.34 / tiers)) * h;
      r(ctx, cx - w * 0.3, y, w * 0.6, tierH * 0.62 * h);
      // Roof with upturned eaves
      const ry = y - tierH * 0.62 * h;
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, ry);
      ctx.quadraticCurveTo(cx - w * 0.42, ry - tierH * 0.1 * h, cx - w * 0.34, ry - tierH * 0.34 * h);
      if (round) ctx.quadraticCurveTo(cx, ry - tierH * 0.5 * h, cx + w * 0.34, ry - tierH * 0.34 * h);
      else ctx.lineTo(cx + w * 0.34, ry - tierH * 0.34 * h);
      ctx.quadraticCurveTo(cx + w * 0.42, ry - tierH * 0.1 * h, cx + w / 2, ry);
      ctx.closePath();
      ctx.fill();
    }
    line(ctx, cx, baseY - 0.85 * h, cx, baseY - h, 0.014 * h);
  };
}

function obelisk(flame = false): Draw {
  return (ctx, cx, baseY, h) => {
    ctx.beginPath();
    ctx.moveTo(cx - 0.07 * h, baseY);
    ctx.lineTo(cx - 0.04 * h, baseY - 0.88 * h);
    ctx.lineTo(cx + 0.04 * h, baseY - 0.88 * h);
    ctx.lineTo(cx + 0.07 * h, baseY);
    ctx.closePath();
    ctx.fill();
    spire(ctx, cx, baseY - 0.88 * h, 0.09 * h, 0.1 * h);
    if (flame) {
      circle(ctx, cx, baseY - 0.99 * h, 0.035 * h);
      spire(ctx, cx, baseY - h * 0.99, 0.05 * h, 0.06 * h);
    }
  };
}

/* -------------------------- bespoke -------------------------- */

const eiffel: Draw = (ctx, cx, baseY, h) => {
  ctx.beginPath();
  ctx.moveTo(cx - 0.24 * h, baseY);
  ctx.quadraticCurveTo(cx - 0.055 * h, baseY - 0.42 * h, cx - 0.018 * h, baseY - 0.95 * h);
  ctx.lineTo(cx + 0.018 * h, baseY - 0.95 * h);
  ctx.quadraticCurveTo(cx + 0.055 * h, baseY - 0.42 * h, cx + 0.24 * h, baseY);
  ctx.lineTo(cx + 0.11 * h, baseY);
  ctx.quadraticCurveTo(cx, baseY - 0.2 * h, cx - 0.11 * h, baseY);
  ctx.closePath();
  ctx.fill();
  r(ctx, cx - 0.1 * h, baseY - 0.3 * h, 0.2 * h, 0.022 * h);
  r(ctx, cx - 0.055 * h, baseY - 0.57 * h, 0.11 * h, 0.018 * h);
  line(ctx, cx, baseY - 0.95 * h, cx, baseY - h, 0.012 * h);
};

const bigBenEye: Draw = (ctx, cx, baseY, h) => {
  // Elizabeth Tower on the left
  const bx = cx - 0.42 * h;
  r(ctx, bx - 0.055 * h, baseY, 0.11 * h, 0.52 * h);
  r(ctx, bx - 0.07 * h, baseY - 0.52 * h, 0.14 * h, 0.14 * h); // clock stage
  spire(ctx, bx, baseY - 0.66 * h, 0.14 * h, 0.2 * h);
  // The London Eye
  const ex = cx + 0.24 * h;
  const ey = baseY - 0.46 * h;
  const R = 0.42 * h;
  ctx.lineWidth = 0.018 * h;
  ctx.beginPath();
  ctx.arc(ex, ey, R, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    line(ctx, ex, ey, ex + Math.cos(a) * R, ey + Math.sin(a) * R, 0.007 * h);
    circle(ctx, ex + Math.cos(a) * R, ey + Math.sin(a) * R, 0.018 * h);
  }
  circle(ctx, ex, ey, 0.03 * h);
  line(ctx, ex, ey, ex - 0.2 * h, baseY, 0.02 * h);
  line(ctx, ex, ey, ex + 0.2 * h, baseY, 0.02 * h);
};

const operaHouse: Draw = (ctx, cx, baseY, h) => {
  r(ctx, cx - 0.95 * h, baseY, 1.9 * h, 0.14 * h);
  // Each shell: a long curved back rising to a sharp crest, then a steep face
  const sail = (x0: number, x1: number, peakX: number, peak: number) => {
    ctx.beginPath();
    ctx.moveTo(cx + x0 * h, baseY - 0.14 * h);
    ctx.quadraticCurveTo(cx + (x0 * 0.3 + peakX * 0.7) * h, baseY - peak * 0.96 * h, cx + peakX * h, baseY - peak * h);
    ctx.lineTo(cx + x1 * h, baseY - 0.14 * h);
    ctx.closePath();
    ctx.fill();
  };
  sail(-0.9, -0.25, -0.32, 0.5);
  sail(-0.6, 0.02, -0.05, 0.72);
  sail(-0.25, 0.38, 0.3, 0.9);
  sail(0.9, 0.42, 0.52, 0.42);
};

const burj: Draw = (ctx, cx, baseY, h) => {
  const tiers: [number, number][] = [
    [0.16, 0.1], [0.14, 0.2], [0.12, 0.3], [0.1, 0.4], [0.085, 0.5],
    [0.068, 0.58], [0.052, 0.66], [0.038, 0.73], [0.026, 0.79], [0.016, 0.84],
  ];
  stepped(tiers, {})(ctx, cx, baseY, h);
  line(ctx, cx, baseY - 0.84 * h, cx, baseY - h, 0.012 * h);
};

const petronas: Draw = (ctx, cx, baseY, h) => {
  for (const s of [-1, 1]) {
    const x = cx + s * 0.17 * h;
    r(ctx, x - 0.085 * h, baseY, 0.17 * h, 0.55 * h);
    r(ctx, x - 0.065 * h, baseY - 0.55 * h, 0.13 * h, 0.18 * h);
    r(ctx, x - 0.045 * h, baseY - 0.73 * h, 0.09 * h, 0.1 * h);
    spire(ctx, x, baseY - 0.83 * h, 0.05 * h, 0.17 * h);
  }
  r(ctx, cx - 0.1 * h, baseY - 0.42 * h, 0.2 * h, 0.025 * h); // skybridge
  line(ctx, cx - 0.08 * h, baseY - 0.42 * h, cx, baseY - 0.32 * h, 0.014 * h);
  line(ctx, cx + 0.08 * h, baseY - 0.42 * h, cx, baseY - 0.32 * h, 0.014 * h);
};

const marinaBay: Draw = (ctx, cx, baseY, h) => {
  for (const dx of [-0.34, 0, 0.34]) {
    ctx.beginPath();
    ctx.moveTo(cx + (dx - 0.11) * h, baseY);
    ctx.lineTo(cx + (dx - 0.07) * h, baseY - 0.72 * h);
    ctx.lineTo(cx + (dx + 0.07) * h, baseY - 0.72 * h);
    ctx.lineTo(cx + (dx + 0.11) * h, baseY);
    ctx.closePath();
    ctx.fill();
  }
  // The SkyPark surfboard rests on the tower tops, prow overhanging left
  ctx.beginPath();
  ctx.moveTo(cx - 0.62 * h, baseY - 0.76 * h);
  ctx.quadraticCurveTo(cx, baseY - 0.85 * h, cx + 0.5 * h, baseY - 0.8 * h);
  ctx.lineTo(cx + 0.48 * h, baseY - 0.7 * h);
  ctx.lineTo(cx - 0.5 * h, baseY - 0.68 * h);
  ctx.closePath();
  ctx.fill();
};

const giza: Draw = (ctx, cx, baseY, h) => {
  spire(ctx, cx - 0.35 * h, baseY, 1.7 * h, 0.95 * h);
  spire(ctx, cx + 0.75 * h, baseY, 1.25 * h, 0.72 * h);
  spire(ctx, cx + 1.35 * h, baseY, 0.7 * h, 0.4 * h);
};

const ryugyong: Draw = (ctx, cx, baseY, h) => {
  ctx.beginPath();
  ctx.moveTo(cx - 0.34 * h, baseY);
  ctx.quadraticCurveTo(cx - 0.1 * h, baseY - 0.55 * h, cx - 0.015 * h, baseY - 0.97 * h);
  ctx.lineTo(cx + 0.015 * h, baseY - 0.97 * h);
  ctx.quadraticCurveTo(cx + 0.1 * h, baseY - 0.55 * h, cx + 0.34 * h, baseY);
  ctx.closePath();
  ctx.fill();
  line(ctx, cx, baseY - 0.97 * h, cx, baseY - h, 0.01 * h);
};

const goldenGate: Draw = (ctx, cx, baseY, h) => {
  const deckY = baseY - 0.3 * h;
  const towers = [cx - 0.62 * h, cx + 0.62 * h];
  for (const tx of towers) {
    for (const s of [-1, 1]) r(ctx, tx + s * 0.05 * h - 0.02 * h, baseY, 0.04 * h, 0.88 * h);
    for (const braceY of [0.36, 0.55, 0.74, 0.86])
      r(ctx, tx - 0.07 * h, baseY - braceY * h + 0.02 * h, 0.14 * h, 0.035 * h);
  }
  r(ctx, cx - 1.15 * h, deckY, 2.3 * h, 0.035 * h);
  // Main cables
  ctx.lineWidth = 0.014 * h;
  ctx.beginPath();
  ctx.moveTo(cx - 1.15 * h, deckY - 0.28 * h);
  ctx.quadraticCurveTo(cx - 0.95 * h, deckY - 0.02 * h, towers[0], baseY - 0.86 * h);
  ctx.quadraticCurveTo(cx, deckY + 0.02 * h - 0.0 * h, towers[1], baseY - 0.86 * h);
  ctx.quadraticCurveTo(cx + 0.95 * h, deckY - 0.02 * h, cx + 1.15 * h, deckY - 0.28 * h);
  ctx.stroke();
  for (let i = 1; i < 8; i++) {
    const x = towers[0] + ((towers[1] - towers[0]) * i) / 8;
    const t = i / 8;
    const sag = 4 * t * (1 - t);
    const cableY = baseY - 0.86 * h + (0.86 * h - 0.32 * h) * sag * 0.92;
    line(ctx, x, cableY, x, deckY, 0.006 * h);
  }
};

const christRedeemer: Draw = (ctx, cx, baseY, h) => {
  // Corcovado
  ctx.beginPath();
  ctx.moveTo(cx - 0.85 * h, baseY);
  ctx.quadraticCurveTo(cx - 0.25 * h, baseY - 0.68 * h, cx, baseY - 0.66 * h);
  ctx.quadraticCurveTo(cx + 0.3 * h, baseY - 0.6 * h, cx + 0.85 * h, baseY);
  ctx.closePath();
  ctx.fill();
  // The statue, arms outstretched
  r(ctx, cx - 0.045 * h, baseY - 0.66 * h, 0.09 * h, 0.045 * h);
  r(ctx, cx - 0.028 * h, baseY - 0.7 * h, 0.056 * h, 0.2 * h);
  r(ctx, cx - 0.16 * h, baseY - 0.85 * h, 0.32 * h, 0.032 * h);
  circle(ctx, cx, baseY - 0.93 * h, 0.026 * h);
};

const stBasils: Draw = (ctx, cx, baseY, h) => {
  // Central tent tower
  r(ctx, cx - 0.05 * h, baseY, 0.1 * h, 0.5 * h);
  spire(ctx, cx, baseY - 0.5 * h, 0.16 * h, 0.34 * h);
  onion(ctx, cx, baseY - 0.84 * h, 0.035 * h);
  // Flanking onion-domed towers
  const flank: [number, number, number][] = [
    [-0.36, 0.34, 0.055], [-0.18, 0.46, 0.05], [0.18, 0.42, 0.05], [0.36, 0.3, 0.055],
  ];
  for (const [dx, th, rad] of flank) {
    const x = cx + dx * h;
    r(ctx, x - rad * h * 0.9, baseY, rad * 1.8 * h, th * h);
    onion(ctx, x, baseY - th * h, rad * h);
  }
};

const sagrada: Draw = (ctx, cx, baseY, h) => {
  const sp: [number, number, number][] = [
    [-0.3, 0.72, 0.11], [-0.11, 0.9, 0.12], [0.11, 0.84, 0.12], [0.3, 0.66, 0.11],
  ];
  for (const [dx, sh, sw] of sp) {
    const x = cx + dx * h;
    ctx.beginPath();
    ctx.moveTo(x - (sw / 2) * h, baseY);
    ctx.quadraticCurveTo(x - sw * 0.28 * h, baseY - sh * 0.72 * h, x, baseY - sh * h);
    ctx.quadraticCurveTo(x + sw * 0.28 * h, baseY - sh * 0.72 * h, x + (sw / 2) * h, baseY);
    ctx.closePath();
    ctx.fill();
    circle(ctx, x, baseY - sh * h, 0.018 * h);
  }
  r(ctx, cx - 0.4 * h, baseY, 0.8 * h, 0.2 * h);
};

const stPeters: Draw = (ctx, cx, baseY, h) => {
  r(ctx, cx - 0.55 * h, baseY, 1.1 * h, 0.24 * h); // facade and colonnade
  r(ctx, cx - 0.26 * h, baseY - 0.24 * h, 0.52 * h, 0.1 * h); // drum
  ctx.beginPath();
  ctx.arc(cx, baseY - 0.34 * h, 0.26 * h, Math.PI, 0);
  ctx.fill();
  r(ctx, cx - 0.035 * h, baseY - 0.6 * h, 0.07 * h, 0.08 * h); // lantern
  line(ctx, cx, baseY - 0.68 * h, cx, baseY - 0.76 * h, 0.014 * h);
};

const capitolDC: Draw = (ctx, cx, baseY, h) => {
  const bx = cx - 0.3 * h;
  r(ctx, bx - 0.5 * h, baseY, 1.0 * h, 0.16 * h);
  r(ctx, bx - 0.16 * h, baseY - 0.16 * h, 0.32 * h, 0.1 * h);
  ctx.beginPath();
  ctx.arc(bx, baseY - 0.26 * h, 0.17 * h, Math.PI, 0);
  ctx.fill();
  r(ctx, bx - 0.02 * h, baseY - 0.43 * h, 0.04 * h, 0.05 * h);
  // Washington Monument
  obelisk()(ctx, cx + 0.55 * h, baseY, 0.95 * h);
};

const parthenon: Draw = (ctx, cx, baseY, h) => {
  // The Acropolis
  ctx.beginPath();
  ctx.moveTo(cx - 1.05 * h, baseY);
  ctx.lineTo(cx - 0.75 * h, baseY - 0.42 * h);
  ctx.lineTo(cx + 0.72 * h, baseY - 0.42 * h);
  ctx.lineTo(cx + 1.0 * h, baseY);
  ctx.closePath();
  ctx.fill();
  const top = baseY - 0.42 * h;
  r(ctx, cx - 0.52 * h, top, 1.04 * h, 0.05 * h); // stylobate
  for (let i = 0; i < 8; i++)
    r(ctx, cx - 0.46 * h + i * 0.126 * h, top - 0.05 * h, 0.05 * h, 0.3 * h);
  r(ctx, cx - 0.52 * h, top - 0.35 * h, 1.04 * h, 0.07 * h); // entablature
  spire(ctx, cx, top - 0.42 * h, 1.08 * h, 0.16 * h); // pediment
};

const edinburghCastle: Draw = (ctx, cx, baseY, h) => {
  // Castle Rock
  ctx.beginPath();
  ctx.moveTo(cx - 1.0 * h, baseY);
  ctx.lineTo(cx - 0.85 * h, baseY - 0.28 * h);
  ctx.lineTo(cx - 0.45 * h, baseY - 0.46 * h);
  ctx.lineTo(cx + 0.55 * h, baseY - 0.46 * h);
  ctx.quadraticCurveTo(cx + 0.75 * h, baseY - 0.2 * h, cx + 0.95 * h, baseY);
  ctx.closePath();
  ctx.fill();
  const top = baseY - 0.46 * h;
  const crenellated = (x: number, w: number, hh: number) => {
    r(ctx, x, top, w, hh);
    const teeth = Math.max(3, Math.round(w / (0.055 * h)));
    for (let i = 0; i < teeth; i++)
      if (i % 2 === 0) r(ctx, x + (i * w) / teeth, top - hh, w / teeth, 0.035 * h);
  };
  crenellated(cx - 0.55 * h, 0.4 * h, 0.18 * h);
  crenellated(cx - 0.1 * h, 0.3 * h, 0.3 * h);
  crenellated(cx + 0.25 * h, 0.28 * h, 0.22 * h);
  line(ctx, cx + 0.05 * h, top - 0.3 * h, cx + 0.05 * h, top - 0.42 * h, 0.012 * h);
};

const atomium: Draw = (ctx, cx, baseY, h) => {
  const cy = baseY - 0.5 * h;
  const R = 0.11 * h;
  const nodes: [number, number][] = [
    [0, 0], [-0.3, -0.28], [0.3, -0.28], [-0.3, 0.28], [0.3, 0.28], [0, -0.48],
  ];
  ctx.lineWidth = 0.03 * h;
  for (const [dx, dy] of nodes.slice(1))
    line(ctx, cx, cy, cx + dx * h, cy + dy * h, 0.03 * h);
  line(ctx, cx, cy + 0.28 * h + 0.1 * h, cx, baseY, 0.035 * h);
  for (const [dx, dy] of nodes) circle(ctx, cx + dx * h, cy + dy * h, R);
};

const windmill: Draw = (ctx, cx, baseY, h) => {
  ctx.beginPath();
  ctx.moveTo(cx - 0.17 * h, baseY);
  ctx.lineTo(cx - 0.1 * h, baseY - 0.52 * h);
  ctx.lineTo(cx + 0.1 * h, baseY - 0.52 * h);
  ctx.lineTo(cx + 0.17 * h, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, baseY - 0.52 * h, 0.1 * h, Math.PI, 0);
  ctx.fill();
  const hub = baseY - 0.56 * h;
  for (const a of [0.6, 2.17, 3.74, 5.31]) {
    const bx = cx + Math.cos(a) * 0.42 * h;
    const by = hub + Math.sin(a) * 0.42 * h;
    line(ctx, cx, hub, bx, by, 0.02 * h);
    // Blade frame
    ctx.save();
    ctx.translate(cx, hub);
    ctx.rotate(a);
    ctx.fillRect(0.08 * h, -0.055 * h, 0.32 * h, 0.055 * h);
    ctx.restore();
  }
};

const tableMountain: Draw = (ctx, cx, baseY, h) => {
  ctx.beginPath();
  ctx.moveTo(cx - 1.6 * h, baseY);
  ctx.lineTo(cx - 0.95 * h, baseY - 0.56 * h);
  ctx.lineTo(cx + 0.6 * h, baseY - 0.58 * h); // the famous flat top
  ctx.lineTo(cx + 1.0 * h, baseY - 0.16 * h);
  ctx.lineTo(cx + 1.25 * h, baseY - 0.42 * h); // Lion's Head
  ctx.lineTo(cx + 1.6 * h, baseY);
  ctx.closePath();
  ctx.fill();
};

const kingdomCentre: Draw = (ctx, cx, baseY, h) => {
  ctx.beginPath();
  ctx.moveTo(cx - 0.24 * h, baseY);
  ctx.lineTo(cx - 0.17 * h, baseY - 0.94 * h);
  ctx.quadraticCurveTo(cx, baseY - 1.02 * h, cx + 0.17 * h, baseY - 0.94 * h);
  ctx.lineTo(cx + 0.24 * h, baseY);
  ctx.closePath();
  ctx.fill();
  // The inverted-arch opening
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.moveTo(cx - 0.13 * h, baseY - 0.92 * h);
  ctx.quadraticCurveTo(cx, baseY - 0.52 * h, cx + 0.13 * h, baseY - 0.92 * h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const makkahClock: Draw = (ctx, cx, baseY, h) => {
  stepped(
    [[0.3, 0.18], [0.2, 0.34], [0.13, 0.6]],
    {}
  )(ctx, cx, baseY, h);
  r(ctx, cx - 0.17 * h, baseY - 0.6 * h, 0.34 * h, 0.16 * h); // clock stage
  spire(ctx, cx, baseY - 0.76 * h, 0.22 * h, 0.14 * h);
  line(ctx, cx, baseY - 0.9 * h, cx, baseY - 0.97 * h, 0.014 * h);
  // Crescent
  ctx.lineWidth = 0.016 * h;
  ctx.beginPath();
  ctx.arc(cx, baseY - 0.98 * h, 0.028 * h, Math.PI * 0.85, Math.PI * 2.15);
  ctx.stroke();
};

const cantonTower: Draw = (ctx, cx, baseY, h) => {
  ctx.beginPath();
  ctx.moveTo(cx - 0.14 * h, baseY);
  ctx.quadraticCurveTo(cx - 0.045 * h, baseY - 0.5 * h, cx - 0.1 * h, baseY - 0.84 * h);
  ctx.lineTo(cx + 0.1 * h, baseY - 0.84 * h);
  ctx.quadraticCurveTo(cx + 0.045 * h, baseY - 0.5 * h, cx + 0.14 * h, baseY);
  ctx.closePath();
  ctx.fill();
  line(ctx, cx + 0.02 * h, baseY - 0.84 * h, cx + 0.02 * h, baseY - h, 0.01 * h);
};

const taipei101: Draw = (ctx, cx, baseY, h) => {
  r(ctx, cx - 0.16 * h, baseY, 0.32 * h, 0.12 * h);
  let y = 0.12;
  for (let i = 0; i < 8; i++) {
    const hh = 0.085;
    // Each tier flares outward towards its top
    ctx.beginPath();
    ctx.moveTo(cx - 0.1 * h, baseY - y * h);
    ctx.lineTo(cx - 0.13 * h, baseY - (y + hh) * h);
    ctx.lineTo(cx + 0.13 * h, baseY - (y + hh) * h);
    ctx.lineTo(cx + 0.1 * h, baseY - y * h);
    ctx.closePath();
    ctx.fill();
    y += hh;
  }
  r(ctx, cx - 0.05 * h, baseY - y * h, 0.1 * h, 0.06 * h);
  spire(ctx, cx, baseY - (y + 0.06) * h, 0.04 * h, h * (1 - y - 0.06));
};

const stPetersburgSpire: Draw = (ctx, cx, baseY, h) => {
  r(ctx, cx - 0.42 * h, baseY, 0.84 * h, 0.2 * h);
  r(ctx, cx - 0.07 * h, baseY - 0.2 * h, 0.14 * h, 0.22 * h);
  spire(ctx, cx, baseY - 0.42 * h, 0.11 * h, 0.52 * h); // the golden needle
  line(ctx, cx, baseY - 0.94 * h, cx, baseY - h, 0.01 * h);
  ctx.beginPath();
  ctx.arc(cx + 0.28 * h, baseY - 0.2 * h, 0.09 * h, Math.PI, 0);
  ctx.fill();
};

const griffith: Draw = (ctx, cx, baseY, h) => {
  ctx.beginPath();
  ctx.moveTo(cx - 1.1 * h, baseY);
  ctx.quadraticCurveTo(cx, baseY - 0.55 * h, cx + 1.1 * h, baseY);
  ctx.closePath();
  ctx.fill();
  const top = baseY - 0.42 * h;
  r(ctx, cx - 0.28 * h, top, 0.56 * h, 0.12 * h);
  ctx.beginPath();
  ctx.arc(cx, top - 0.12 * h, 0.12 * h, Math.PI, 0);
  ctx.fill();
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + s * 0.21 * h, top - 0.1 * h, 0.07 * h, Math.PI, 0);
    ctx.fill();
  }
};

const angelColumn: Draw = (ctx, cx, baseY, h) => {
  r(ctx, cx - 0.14 * h, baseY, 0.28 * h, 0.08 * h);
  r(ctx, cx - 0.035 * h, baseY - 0.08 * h, 0.07 * h, 0.68 * h);
  r(ctx, cx - 0.06 * h, baseY - 0.76 * h, 0.12 * h, 0.04 * h);
  // El Ángel: body and swept-back wings
  circle(ctx, cx, baseY - 0.9 * h, 0.022 * h);
  r(ctx, cx - 0.02 * h, baseY - 0.8 * h, 0.04 * h, 0.09 * h);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.01 * h, baseY - 0.87 * h);
    ctx.lineTo(cx + s * 0.11 * h, baseY - 0.97 * h);
    ctx.lineTo(cx + s * 0.05 * h, baseY - 0.85 * h);
    ctx.closePath();
    ctx.fill();
  }
};

/* --------------------------- catalogue --------------------------- */

const L = (draw: Draw, h: number, backdrop = false): Landmark => ({ draw, h, backdrop });

const LANDMARKS: Record<string, Landmark> = {
  // Bespoke icons
  paris: L(eiffel, 0.34),
  london: L(bigBenEye, 0.26),
  sydney: L(operaHouse, 0.13),
  dubai: L(burj, 0.42),
  "kuala lumpur": L(petronas, 0.32),
  singapore: L(marinaBay, 0.24),
  cairo: L(giza, 0.15, true),
  pyongyang: L(ryugyong, 0.3),
  "san francisco": L(goldenGate, 0.26, true),
  "rio de janeiro": L(christRedeemer, 0.28, true),
  moscow: L(stBasils, 0.26),
  barcelona: L(sagrada, 0.28),
  rome: L(stPeters, 0.24),
  "washington, d.c.": L(capitolDC, 0.24),
  athens: L(parthenon, 0.22, true),
  edinburgh: L(edinburghCastle, 0.24, true),
  brussels: L(atomium, 0.22),
  amsterdam: L(windmill, 0.22),
  "cape town": L(tableMountain, 0.3, true),
  riyadh: L(kingdomCentre, 0.32),
  makkah: L(makkahClock, 0.34),
  guangzhou: L(cantonTower, 0.36),
  taipei: L(taipei101, 0.36),
  "st. petersburg": L(stPetersburgSpire, 0.26),
  "los angeles": L(griffith, 0.2, true),
  "mexico city": L(angelColumn, 0.26),

  // Needle towers, each with its own pods and stance
  auckland: L(needle([{ y: 0.6, w: 0.16, kind: "disc" }, { y: 0.68, w: 0.11, kind: "disc" }], { antennaFrom: 0.72 }), 0.34),
  toronto: L(needle([{ y: 0.6, w: 0.2, kind: "disc" }, { y: 0.66, w: 0.12, kind: "deck" }, { y: 0.79, w: 0.07, kind: "disc" }], { antennaFrom: 0.8 }), 0.36),
  seattle: L(needle([{ y: 0.72, w: 0.3, kind: "saucer" }], { legs: "splay", antennaFrom: 0.76, shaftW: 0.04 }), 0.28),
  berlin: L(needle([{ y: 0.68, w: 0.14, kind: "sphere" }], { antennaFrom: 0.74 }), 0.32),
  tokyo: L(needle([{ y: 0.5, w: 0.14, kind: "deck" }, { y: 0.7, w: 0.1, kind: "deck" }], { antennaFrom: 0.78, shaftW: 0.07 }), 0.38),
  shanghai: L(needle([{ y: 0.32, w: 0.2, kind: "sphere" }, { y: 0.64, w: 0.13, kind: "sphere" }, { y: 0.82, w: 0.06, kind: "sphere" }], { legs: "splay", antennaFrom: 0.85 }), 0.36),
  seoul: L(needle([{ y: 0.72, w: 0.14, kind: "deck" }], { antennaFrom: 0.8, shaftW: 0.045 }), 0.3),
  tehran: L(needle([{ y: 0.62, w: 0.13, kind: "deck" }, { y: 0.7, w: 0.09, kind: "deck" }], { antennaFrom: 0.74, shaftW: 0.06 }), 0.32),
  dublin: L(needle([], { antennaFrom: 0.02, shaftW: 0.05 }), 0.3),
  "kuwait city": L(needle([{ y: 0.5, w: 0.17, kind: "sphere" }, { y: 0.74, w: 0.1, kind: "sphere" }], { antennaFrom: 0.82, shaftW: 0.04 }), 0.3),

  // Stepped skyscrapers
  "new york": L(stepped([[0.17, 0.3], [0.12, 0.62], [0.08, 0.78], [0.05, 0.84]], { spire: 0.94, antennae: [[0, 1]] }), 0.34),
  chicago: L(stepped([[0.16, 0.4], [0.12, 0.62], [0.09, 0.78], [0.06, 0.9]], { antennae: [[-0.035, 1], [0.035, 0.98]] }), 0.34),
  warsaw: L(stepped([[0.3, 0.16], [0.17, 0.42], [0.1, 0.66], [0.06, 0.76]], { spire: 1 }), 0.3),

  // Sacred skylines
  istanbul: L(mosque([-0.62, 0.62]), 0.26),
  "abu dhabi": L(mosque([-0.7, 0.7], true), 0.24),
  delhi: L(archway(1, { attic: 0.12 }), 0.2),
  "new delhi": L(archway(1, { attic: 0.12 }), 0.2),
  mumbai: L(archway(3, { turrets: true }), 0.2),
  madrid: L(archway(3, { attic: 0.14 }), 0.18),
  vienna: L(gothic([[0.18, 1, 0.16]], 0.75, 0.34), 0.28),
  prague: L(gothic([[-0.12, 0.95, 0.15], [0.12, 1, 0.15]], 0.5, 0.3), 0.26),
  milan: L(gothic([[-0.32, 0.6, 0.08], [-0.16, 0.72, 0.08], [0, 1, 0.1], [0.16, 0.72, 0.08], [0.32, 0.6, 0.08]], 0.85, 0.3), 0.24),
  munich: L(gothic([[-0.16, 0.9, 0.2], [0.16, 0.92, 0.2]], 0.55, 0.3), 0.26),

  // East and South East Asia
  beijing: L(pagoda(3, true), 0.24),
  kyoto: L(pagoda(5), 0.28),
  bangkok: L(pagoda(4), 0.28),

  // Monuments
  "buenos aires": L(obelisk(), 0.3),
  jakarta: L(obelisk(true), 0.3),
};

/** Landmark for a city name (Natural Earth spelling), if we know one. */
export function landmarkFor(cityName?: string): Landmark | null {
  if (!cityName) return null;
  return LANDMARKS[cityName.toLowerCase().replace(/\s+/g, " ").trim()] ?? null;
}

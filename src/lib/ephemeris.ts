/**
 * Low-precision ephemerides: where the Sun, Moon and bright planets are.
 *
 * Planets use JPL's approximate Keplerian elements (Standish, valid
 * 1800-2050, accuracy well under a degree); the Moon uses the leading terms
 * of Meeus' series (accuracy ~0.3 degrees, plenty at simulator scale); the
 * Sun uses the standard truncated solar theory. All positions are geocentric
 * RA/Dec in degrees, J2000-ish (precession is ignored, fine at this scale).
 */

const DEG = Math.PI / 180;

function centuriesSinceJ2000(timeMs: number): number {
  return (timeMs - Date.UTC(2000, 0, 1, 12)) / 86_400_000 / 36525;
}

const OBLIQUITY = 23.4393;

function eclipticToRaDec(lonDeg: number, latDeg: number): { ra: number; dec: number } {
  const l = lonDeg * DEG;
  const b = latDeg * DEG;
  const e = OBLIQUITY * DEG;
  const ra = Math.atan2(
    Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e),
    Math.cos(l)
  );
  const dec = Math.asin(
    Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l)
  );
  return { ra: ((ra / DEG) % 360 + 360) % 360, dec: dec / DEG };
}

/* ------------------------------- Sun ------------------------------- */

export function sunPosition(timeMs: number): { ra: number; dec: number; eclLon: number } {
  const T = centuriesSinceJ2000(timeMs);
  const L0 = 280.46646 + 36000.76983 * T;
  const M = (357.52911 + 35999.05029 * T) * DEG;
  const C =
    (1.914602 - 0.004817 * T) * Math.sin(M) +
    0.019993 * Math.sin(2 * M) +
    0.000289 * Math.sin(3 * M);
  const lon = ((L0 + C) % 360 + 360) % 360;
  return { ...eclipticToRaDec(lon, 0), eclLon: lon };
}

/* ------------------------------- Moon ------------------------------- */

export type MoonState = {
  ra: number;
  dec: number;
  /** 0 new .. 1 full */
  illuminated: number;
  waxing: boolean;
  phaseName: string;
};

export function moonPosition(timeMs: number): MoonState {
  const T = centuriesSinceJ2000(timeMs);
  const Lp = (218.3164477 + 481267.88123421 * T) % 360;
  const D = (297.8501921 + 445267.1114034 * T) * DEG;
  const M = (357.5291092 + 35999.0502909 * T) * DEG;
  const Mp = (134.9633964 + 477198.8675055 * T) * DEG;
  const F = (93.272095 + 483202.0175233 * T) * DEG;

  const lon =
    Lp +
    6.288774 * Math.sin(Mp) +
    1.274027 * Math.sin(2 * D - Mp) +
    0.658314 * Math.sin(2 * D) +
    0.213618 * Math.sin(2 * Mp) -
    0.185116 * Math.sin(M) -
    0.114332 * Math.sin(2 * F) +
    0.058793 * Math.sin(2 * D - 2 * Mp) +
    0.057066 * Math.sin(2 * D - M - Mp) +
    0.053322 * Math.sin(2 * D + Mp) +
    0.045758 * Math.sin(2 * D - M);
  const lat =
    5.128122 * Math.sin(F) +
    0.280602 * Math.sin(Mp + F) +
    0.277693 * Math.sin(Mp - F) +
    0.173237 * Math.sin(2 * D - F);

  const sun = sunPosition(timeMs);
  const elong = ((lon - sun.eclLon) % 360 + 360) % 360;
  const phaseAngle = 180 - Math.abs(180 - elong); // 0 new, 180 full? inverted below
  const illuminated = (1 - Math.cos(elong * DEG)) / 2;
  const waxing = elong < 180;
  const names = [
    "new moon", "waxing crescent", "first quarter", "waxing gibbous",
    "full moon", "waning gibbous", "last quarter", "waning crescent",
  ];
  const idx = Math.round(elong / 45) % 8;
  void phaseAngle;
  return { ...eclipticToRaDec(lon, lat), illuminated, waxing, phaseName: names[idx] };
}

/* ------------------------------ Planets ------------------------------ */

type Elements = [number, number, number, number, number, number];
// a(AU), e, I, L, long.peri, long.node at J2000 + rates per century
const PLANETS: Record<string, { el: Elements; rate: Elements; mag: (r: number, d: number, a: number) => number; colour: string }> = {
  Venus: {
    el: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    rate: [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
    mag: (r, d, a) => -4.4 + 5 * Math.log10(r * d) + 0.0009 * a + 0.000239 * a * a - 6.5e-7 * a * a * a,
    colour: "255,246,225",
  },
  Mars: {
    el: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
    mag: (r, d, a) => -1.52 + 5 * Math.log10(r * d) + 0.016 * a,
    colour: "255,190,150",
  },
  Jupiter: {
    el: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
    mag: (r, d, a) => -9.4 + 5 * Math.log10(r * d) + 0.005 * a,
    colour: "255,240,215",
  },
  Saturn: {
    el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    rate: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
    mag: (r, d, a) => -8.88 + 5 * Math.log10(r * d) + 0.044 * a,
    colour: "255,235,190",
  },
};

const EARTH: { el: Elements; rate: Elements } = {
  el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0],
  rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
};

function heliocentric(elements: { el: Elements; rate: Elements }, T: number): [number, number, number] {
  const [a0, e0, I0, L0, w0, O0] = elements.el;
  const [ar, er, Ir, Lr, wr, Or] = elements.rate;
  const a = a0 + ar * T;
  const e = e0 + er * T;
  const I = (I0 + Ir * T) * DEG;
  const L = L0 + Lr * T;
  const wBar = w0 + wr * T;
  const O = (O0 + Or * T) * DEG;
  const w = (wBar - (O0 + Or * T)) * DEG;
  const M = (((L - wBar) % 360 + 360) % 360) * DEG;
  // Kepler's equation, a few Newton steps
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 5; i++)
    E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  // Rotate to the ecliptic frame
  const cw = Math.cos(w), sw = Math.sin(w);
  const cO = Math.cos(O), sO = Math.sin(O);
  const cI = Math.cos(I), sI = Math.sin(I);
  const x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
  const y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
  const z = sw * sI * xp + cw * sI * yp;
  return [x, y, z];
}

export type PlanetState = {
  name: string;
  ra: number;
  dec: number;
  mag: number;
  colour: string;
};

export function planetPositions(timeMs: number): PlanetState[] {
  const T = centuriesSinceJ2000(timeMs);
  const [ex, ey, ez] = heliocentric(EARTH, T);
  const out: PlanetState[] = [];
  for (const [name, p] of Object.entries(PLANETS)) {
    const [px, py, pz] = heliocentric(p, T);
    const gx = px - ex, gy = py - ey, gz = pz - ez;
    const delta = Math.hypot(gx, gy, gz); // Earth-planet AU
    const r = Math.hypot(px, py, pz); // Sun-planet AU
    const rE = Math.hypot(ex, ey, ez);
    const lon = Math.atan2(gy, gx) / DEG;
    const lat = Math.asin(gz / delta) / DEG;
    // Phase angle (Sun-planet-Earth)
    const cosA = (r * r + delta * delta - rE * rE) / (2 * r * delta);
    const alpha = Math.acos(Math.min(1, Math.max(-1, cosA))) / DEG;
    out.push({
      name,
      ...eclipticToRaDec(lon, lat),
      mag: p.mag(r, delta, alpha),
      colour: p.colour,
    });
  }
  return out;
}

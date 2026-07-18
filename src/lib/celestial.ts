/**
 * The real celestial sphere: star catalogue loading, coordinate transforms,
 * star colours and an astronomically placed Milky Way. Shared by the globe's
 * background sky (Starfield) and the night sky simulator.
 *
 * Conventions: RA/Dec in degrees (J2000), latitude in degrees, local
 * sidereal time in hours, altitude/azimuth in degrees with azimuth measured
 * from north through east.
 */

export type Star = {
  ra: number;
  dec: number;
  mag: number;
  /** Colour temperature in Kelvin */
  k: number;
  name?: string;
};

const DEG = Math.PI / 180;

/* ------------------------------ catalogue ------------------------------ */

let starsPromise: Promise<Star[]> | null = null;

/** The Yale Bright Star Catalogue (baked to /data/stars.json), brightest
 *  first. ~8,400 stars: every star a human eye can see. */
export function fetchStars(): Promise<Star[]> {
  starsPromise ??= fetch("/data/stars.json")
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((j: { s: number[][]; names: Record<number, string> }) =>
      j.s.map(([ra, dec, v, k], i) => ({
        ra: ra / 100,
        dec: dec / 100,
        mag: v / 100,
        k,
        name: j.names[i],
      }))
    )
    .catch(() => []);
  return starsPromise;
}

let constellationsPromise: Promise<Record<string, number[][][]>> | null = null;

/** Constellation line figures keyed by IAU abbreviation; vertices are
 *  [ra*100, dec*100]. */
export function fetchConstellations(): Promise<Record<string, number[][][]>> {
  constellationsPromise ??= fetch("/data/constellations.json")
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .catch(() => ({}));
  return constellationsPromise;
}

/* ------------------------------ time ------------------------------ */

/** Greenwich mean sidereal time in hours for a JS timestamp. */
export function gmstHours(timeMs: number): number {
  const d = (timeMs - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
  return ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
}

/* --------------------------- transforms --------------------------- */

/** Altitude/azimuth of an RA/Dec seen from a latitude at a sidereal time. */
export function altAz(
  raDeg: number,
  decDeg: number,
  latDeg: number,
  lstHours: number
): { alt: number; az: number } {
  const H = ((lstHours * 15 - raDeg + 540) % 360 - 180) * DEG;
  const dec = decDeg * DEG;
  const lat = latDeg * DEG;
  const sinAlt =
    Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(H);
  const alt = Math.asin(Math.min(1, Math.max(-1, sinAlt)));
  // Azimuth from north through east
  const az = Math.atan2(
    Math.sin(H),
    Math.cos(H) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)
  );
  return { alt: alt / DEG, az: ((az / DEG + 180) % 360 + 360) % 360 };
}

export type Vec3 = [number, number, number];

export function raDecToVec(raDeg: number, decDeg: number): Vec3 {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  return [
    Math.cos(dec) * Math.cos(ra),
    Math.cos(dec) * Math.sin(ra),
    Math.sin(dec),
  ];
}

/** Orthonormal camera basis looking at an RA/Dec with celestial north up:
 *  returns { f: forward, e: east(screen right), n: north(screen up) }. */
export function skyBasis(centreRa: number, centreDec: number) {
  const ra = centreRa * DEG;
  const dec = centreDec * DEG;
  const f: Vec3 = raDecToVec(centreRa, centreDec);
  const e: Vec3 = [-Math.sin(ra), Math.cos(ra), 0];
  const n: Vec3 = [
    -Math.cos(ra) * Math.sin(dec),
    -Math.sin(ra) * Math.sin(dec),
    Math.cos(dec),
  ];
  return { f, e, n };
}

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/* ------------------------- star appearance ------------------------- */

/** Blackbody colour temperature to an "r,g,b" string (Tanner Helland's
 *  approximation, clamped to plausible star colours). */
export function kelvinToRgb(kelvin: number): string {
  const t = Math.min(Math.max(kelvin, 2000), 30000) / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
    b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    g = 288.12 * Math.pow(t - 60, -0.0755);
    b = 255;
  }
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v)));
  return `${c(r)},${c(g)},${c(b)}`;
}

/* ---------------------------- Milky Way ---------------------------- */

export type MwBlob = {
  ra: number;
  dec: number;
  /** Blob radius in degrees */
  size: number;
  alpha: number;
  warm: boolean;
  /** Dark dust lane blob (drawn with destination-out) */
  dark: boolean;
};

// J2000 galactic-to-equatorial rotation (transpose of the standard
// equatorial-to-galactic matrix)
const GAL: [Vec3, Vec3, Vec3] = [
  [-0.0548755604, 0.4941094279, -0.867666149],
  [-0.8734370902, -0.44482963, -0.1980763734],
  [-0.4838350155, 0.7469822445, 0.4559837762],
];

function galacticToRaDec(lDeg: number, bDeg: number): { ra: number; dec: number } {
  const l = lDeg * DEG;
  const b = bDeg * DEG;
  const g: Vec3 = [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
  const x = GAL[0][0] * g[0] + GAL[0][1] * g[1] + GAL[0][2] * g[2];
  const y = GAL[1][0] * g[0] + GAL[1][1] * g[1] + GAL[1][2] * g[2];
  const z = GAL[2][0] * g[0] + GAL[2][1] * g[1] + GAL[2][2] * g[2];
  return {
    ra: ((Math.atan2(y, x) / DEG) % 360 + 360) % 360,
    dec: Math.asin(Math.min(1, Math.max(-1, z))) / DEG,
  };
}

function makeRand(seed: number) {
  return () => {
    seed ^= seed << 13;
    seed ^= seed >> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0x100000000;
  };
}

let mwCache: MwBlob[] | null = null;

/** Soft luminous blobs along the real galactic plane: brighter and wider
 *  towards the galactic centre (in Sagittarius), with the Great Rift dust
 *  lane cut through it. Positions are genuine equatorial coordinates. */
export function milkyWayBlobs(): MwBlob[] {
  if (mwCache) return mwCache;
  const rand = makeRand(0x5eed5711);
  const blobs: MwBlob[] = [];
  for (let i = 0; i < 1400; i++) {
    const l = rand() * 360;
    // Angular distance from the galactic centre along the plane (0..180)
    const fromCentre = Math.abs(((l + 180) % 360) - 180);
    const centreBoost = 1 - fromCentre / 220; // bulge towards Sagittarius
    const spread = 3.5 + 4.5 * centreBoost;
    const b = (rand() + rand() - 1) * spread;
    const { ra, dec } = galacticToRaDec(l, b);
    blobs.push({
      ra,
      dec,
      size: 2.5 + rand() * 4.5 + 2.5 * centreBoost,
      alpha: (0.015 + rand() * 0.02) * (0.55 + 0.9 * centreBoost),
      warm: fromCentre < 55 && rand() < 0.45,
      dark: false,
    });
  }
  // Great Rift: dark dust from Cygnus (l~80) down through Aquila to the
  // centre, hugging the plane
  for (let i = 0; i < 160; i++) {
    const l = 15 + rand() * 65;
    const b = (rand() + rand() - 1) * 2.2 + 1.2;
    const { ra, dec } = galacticToRaDec(l, b);
    blobs.push({
      ra,
      dec,
      size: 1.8 + rand() * 3.2,
      alpha: 0.25 + rand() * 0.3,
      warm: false,
      dark: true,
    });
  }
  mwCache = blobs;
  return mwCache;
}

/* ------------------------- notable objects ------------------------- */

export type SkyObject = {
  id: string;
  label: string;
  ra: number;
  dec: number;
  /** Sky brightness (mpsas) needed to see it with the naked eye */
  minMpsas: number;
  kind: "galaxy" | "nebula" | "cluster" | "asterism" | "cloud";
  /** How iconic it is, lowest first: picks what a place's checklist shows */
  rank: number;
  /** Longer name for the checklist, where there is room to explain */
  checklistLabel?: string;
};

/** The showpieces the simulator draws and labels, north and south. The
 *  Plough, Southern Cross and galactic core sit on the star field or the
 *  Milky Way band, so they carry a label rather than a drawn glow. */
export const SKY_OBJECTS: SkyObject[] = [
  {
    id: "core",
    label: "Milky Way core",
    checklistLabel: "The bright heart of the Milky Way",
    ra: 266.4, dec: -29.0, minMpsas: 20.3, kind: "asterism", rank: 1,
  },
  { id: "crux", label: "Southern Cross", ra: 186.6, dec: -60.2, minMpsas: 17.0, kind: "asterism", rank: 2 },
  {
    id: "plough", label: "The Plough",
    checklistLabel: "All seven stars of the Plough",
    ra: 183.0, dec: 57.03, minMpsas: 17.4, kind: "asterism", rank: 2,
  },
  {
    id: "m42", label: "Orion Nebula",
    checklistLabel: "The Orion Nebula as a fuzzy glow",
    ra: 83.822, dec: -5.391, minMpsas: 18.0, kind: "nebula", rank: 3,
  },
  {
    id: "m31", label: "Andromeda galaxy",
    checklistLabel: "The Andromeda galaxy with the naked eye",
    ra: 10.685, dec: 41.269, minMpsas: 19.5, kind: "galaxy", rank: 3,
  },
  {
    id: "lmc", label: "Large Magellanic Cloud",
    ra: 80.894, dec: -69.756, minMpsas: 20.0, kind: "cloud", rank: 4,
  },
  { id: "carina", label: "Carina Nebula", ra: 161.265, dec: -59.868, minMpsas: 19.0, kind: "nebula", rank: 5 },
  { id: "m45", label: "Pleiades", ra: 56.75, dec: 24.117, minMpsas: 17.0, kind: "cluster", rank: 5 },
  {
    id: "smc", label: "Small Magellanic Cloud",
    ra: 13.187, dec: -72.829, minMpsas: 20.5, kind: "cloud", rank: 6,
  },
];

/** Compass word for an azimuth: "south-east" etc. */
export function compassWord(az: number): string {
  const words = [
    "north", "north-east", "east", "south-east",
    "south", "south-west", "west", "north-west",
  ];
  return words[Math.round(((az % 360) + 360) % 360 / 45) % 8];
}

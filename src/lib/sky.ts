/**
 * Night sky quality: light pollution atlas decoding and the science that
 * turns a sky brightness number into things people can picture.
 *
 * Data: Light Pollution Atlas 2016-2024 by David J. Lorenz
 * (https://djlorenz.github.io/astronomy/lp2024/), an update of the World
 * Atlas of Artificial Night Sky Brightness method (Falchi et al. 2016),
 * computed from VIIRS satellite radiances. The atlas is published as 5x5
 * degree gzipped binary tiles at 1/120 degree resolution covering latitudes
 * -65 to +75. Decoding below follows the reference implementation in the
 * atlas's own map viewer.
 *
 * Shared by the build script (Node), the map's click lookup (browser) and
 * the sky simulator.
 */

export const ATLAS_YEARS = [2016, 2020, 2022, 2023, 2024] as const;

export function atlasTileUrl(year: number, tilex: number, tiley: number): string {
  return `https://djlorenz.github.io/astronomy/binary_tiles/${year}/binary_tile_${tilex}_${tiley}.dat.gz`;
}

export type AtlasIndex = { tilex: number; tiley: number; ix: number; iy: number };

/** Which atlas tile and grid point covers a lon/lat; null outside coverage. */
export function atlasIndexFor(lon: number, lat: number): AtlasIndex | null {
  const lonFromDateLine = ((lon + 180) % 360 + 360) % 360;
  const latFromStart = lat + 65;
  const tilex = Math.floor(lonFromDateLine / 5) + 1;
  const tiley = Math.floor(latFromStart / 5) + 1;
  if (tiley < 1 || tiley > 28) return null; // atlas covers lat -65..+75
  const ix = Math.round(120 * (lonFromDateLine - 5 * (tilex - 1) + 1 / 240));
  const iy = Math.round(120 * (latFromStart - 5 * (tiley - 1) + 1 / 240));
  return { tilex, tiley, ix, iy };
}

/**
 * Decode one grid point from an ungzipped atlas tile (600x600 points).
 * The first value is 2 bytes (128*b0 + b1); every other byte is a delta:
 * column 0 of each row is the delta from the row below, the rest are deltas
 * along the row. Returns the artificial/natural brightness ratio.
 */
export function decodeAtlasPoint(bytes: Int8Array, ix: number, iy: number): number {
  let value = 128 * bytes[0] + bytes[1];
  for (let i = 1; i < iy; i++) value += bytes[600 * i + 1];
  for (let i = 1; i < ix; i++) value += bytes[600 * (iy - 1) + 1 + i];
  return (5.0 / 195.0) * (Math.exp(0.0195 * value) - 1.0);
}

/** Zenith sky brightness in mag/arcsec^2 from the artificial/natural ratio. */
export function mpsasFromRatio(ratio: number): number {
  return 22.0 - (5.0 * Math.log(1.0 + ratio)) / Math.log(100.0);
}

/** Browser-side point lookup: fetches the tile straight from the atlas host
 *  (GitHub Pages sends open CORS headers) and gunzips natively. */
export async function fetchSkyQuality(
  lon: number,
  lat: number,
  year: number = ATLAS_YEARS[ATLAS_YEARS.length - 1]
): Promise<{ ratio: number; mpsas: number } | null> {
  const idx = atlasIndexFor(lon, lat);
  if (!idx) return null;
  const res = await fetch(atlasTileUrl(year, idx.tilex, idx.tiley));
  if (!res.ok || !res.body) return null;
  const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
  const bytes = new Int8Array(await new Response(stream).arrayBuffer());
  const ratio = decodeAtlasPoint(bytes, idx.ix, idx.iy);
  return { ratio, mpsas: mpsasFromRatio(ratio) };
}

/** Point sampler that caches decoded tiles, for searches probing many
 *  nearby points (the find-my-sky dark-sky search). */
export function makeSkySampler(
  year: number = ATLAS_YEARS[ATLAS_YEARS.length - 1]
): (lon: number, lat: number) => Promise<number | null> {
  const tiles = new Map<string, Promise<Int8Array | null>>();
  return async (lon, lat) => {
    const idx = atlasIndexFor(lon, lat);
    if (!idx) return null;
    const key = `${idx.tilex}_${idx.tiley}`;
    if (!tiles.has(key)) {
      tiles.set(
        key,
        fetch(atlasTileUrl(year, idx.tilex, idx.tiley))
          .then(async (res) => {
            if (!res.ok || !res.body) return null;
            const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
            return new Int8Array(await new Response(stream).arrayBuffer());
          })
          .catch(() => null)
      );
    }
    const bytes = await tiles.get(key)!;
    if (!bytes) return null;
    return mpsasFromRatio(decodeAtlasPoint(bytes, idx.ix, idx.iy));
  };
}

/* ------------------------------------------------------------------ */
/* What a sky brightness number means for a person looking up          */
/* ------------------------------------------------------------------ */

/**
 * Naked-eye limiting magnitude from zenith sky brightness: the inverse of
 * Schaefer's NELM to sky brightness relation (Schaefer 1990, PASP 102, 212)
 * in the form tabulated by the Unihedron SQM documentation.
 * Anchors: 22.0 -> 6.6, 20.0 -> 5.5, 18.0 -> 4.0, 16.5 -> 2.6.
 */
export function nelm(mpsas: number): number {
  return 7.93 - 5 * Math.log10(Math.pow(10, 4.316 - mpsas / 5) + 1);
}

/** Whole-sky cumulative star counts brighter than a magnitude (Hipparcos). */
const STAR_COUNTS: [number, number][] = [
  [0, 4], [1, 15], [2, 48], [3, 171], [4, 513], [5, 1602], [6, 4800], [6.5, 9096], [7, 14000],
];

/** Approximate stars visible above the horizon at a limiting magnitude
 *  (half the whole-sky count, log-linear interpolation between anchors). */
export function starsAboveHorizon(limit: number): number {
  const rows = STAR_COUNTS;
  if (limit <= rows[0][0]) return Math.round(rows[0][1] / 2);
  if (limit >= rows[rows.length - 1][0]) return Math.round(rows[rows.length - 1][1] / 2);
  for (let i = 1; i < rows.length; i++) {
    if (limit <= rows[i][0]) {
      const [m0, n0] = rows[i - 1];
      const [m1, n1] = rows[i];
      const f = (limit - m0) / (m1 - m0);
      const logN = Math.log10(n0) + f * (Math.log10(n1) - Math.log10(n0));
      return Math.round(Math.pow(10, logN) / 2);
    }
  }
  return 0;
}

/** "about 4,400" style rounding: 2 significant figures, localised. */
export function formatStarCount(n: number): string {
  if (n <= 0) return "0";
  const digits = Math.floor(Math.log10(n)) + 1;
  const rounded = digits <= 2 ? n : Math.round(n / Math.pow(10, digits - 2)) * Math.pow(10, digits - 2);
  return rounded.toLocaleString("en-GB");
}

export type SkyBand = { min: number; label: string; blurb: string };

/** Plain-English sky quality bands, best first. */
export const SKY_BANDS: SkyBand[] = [
  { min: 21.75, label: "Pristine dark sky", blurb: "The Milky Way is bright enough to cast faint shadows." },
  { min: 21.0, label: "Rural", blurb: "Thousands of stars; the Milky Way arcs overhead." },
  { min: 20.0, label: "Suburban", blurb: "The Milky Way fades to a faint smudge; still a good starry sky." },
  { min: 19.0, label: "Bright suburban", blurb: "The Milky Way is gone; a few hundred stars remain." },
  { min: 17.5, label: "City", blurb: "A few dozen stars, plus the Moon and planets." },
  { min: -Infinity, label: "Inner city", blurb: "Only the Moon, planets and a handful of the brightest stars." },
];

export function bandFor(mpsas: number): SkyBand {
  return SKY_BANDS.find((b) => mpsas >= b.min) ?? SKY_BANDS[SKY_BANDS.length - 1];
}

/** Sights that vanish as the sky brightens, with the level they need. */
export const SKY_FEATURES: { label: string; minMpsas: number }[] = [
  { label: "The Milky Way", minMpsas: 20.3 },
  { label: "The Andromeda galaxy with the naked eye", minMpsas: 19.5 },
  { label: "The Orion Nebula as a fuzzy glow", minMpsas: 18.0 },
  { label: "All seven stars of the Plough", minMpsas: 17.4 },
];

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * Bake the real night sky into static JSON.
 *
 * Sources (downloaded to data/raw/stars/, documented for re-fetch):
 * - Yale Bright Star Catalogue (public domain), JSON conversion by
 *   Bretton Wade: https://github.com/brettonw/YaleBrightStarCatalog
 *     curl -sL https://raw.githubusercontent.com/brettonw/YaleBrightStarCatalog/master/bsc5-short.json \
 *       -o data/raw/stars/bsc5-short.json
 *   All ~9,100 naked-eye stars: RA/Dec, V magnitude, colour temperature K,
 *   Bayer letter, proper name, constellation.
 * - Constellation lines from d3-celestial (BSD-3, Olaf Frohn), derived from
 *   Stellarium: https://github.com/ofrohn/d3-celestial
 *     curl -sL https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json \
 *       -o data/raw/stars/constellations.lines.json
 *
 * Output:
 * - public/data/stars.json: { s: [[ra100, dec100, v100, k], ...], names: { idx: name } }
 *   (RA/Dec in centi-degrees, V in centi-mag, K in Kelvin; ~9k stars)
 * - public/data/constellations.json: { abbr: [[[ra100, dec100], ...], ...] }
 *
 * Run: npx tsx scripts/build-stars.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type BscStar = {
  RA: string; // "05h 55m 10.3s"
  Dec: string; // "+07° 24′ 25″"
  V: string;
  K?: string;
  N?: string;
  B?: string;
  C?: string;
};

function raDeg(ra: string): number {
  const m = /(\d+)h (\d+)m ([\d.]+)s/.exec(ra);
  if (!m) throw new Error(`bad RA: ${ra}`);
  return (Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600) * 15;
}

function decDeg(dec: string): number {
  const m = /([+-])(\d+)° (\d+)′ (\d+)″/.exec(dec);
  if (!m) throw new Error(`bad Dec: ${dec}`);
  const v = Number(m[2]) + Number(m[3]) / 60 + Number(m[4]) / 3600;
  return m[1] === "-" ? -v : v;
}

const raw = JSON.parse(
  readFileSync(resolve("data/raw/stars/bsc5-short.json"), "utf8")
) as BscStar[];

const stars: number[][] = [];
const names: Record<number, string> = {};
let skipped = 0;
for (const s of raw) {
  const v = Number(s.V);
  if (!s.RA || !s.Dec || !Number.isFinite(v) || v > 6.5) {
    skipped++;
    continue;
  }
  const idx = stars.length;
  stars.push([
    Math.round(raDeg(s.RA) * 100),
    Math.round(decDeg(s.Dec) * 100),
    Math.round(v * 100),
    Math.round(Number(s.K) || 5500),
  ]);
  if (s.N) names[idx] = s.N;
}
// Brightest first so renderers can draw halos before the mass of faint stars
const order = stars
  .map((st, i) => ({ st, i }))
  .sort((a, b) => a.st[2] - b.st[2]);
const remap = new Map(order.map((o, newIdx) => [o.i, newIdx]));
const sortedStars = order.map((o) => o.st);
const sortedNames: Record<number, string> = {};
for (const [oldIdx, name] of Object.entries(names))
  sortedNames[remap.get(Number(oldIdx))!] = name;

writeFileSync(
  resolve("public/data/stars.json"),
  JSON.stringify({ s: sortedStars, names: sortedNames })
);
console.log(`stars.json: ${sortedStars.length} stars (skipped ${skipped}), ${Object.keys(sortedNames).length} named`);

// Constellation lines: GeoJSON with RA mapped to [-180, 180]; convert back
// to plain RA degrees [0, 360)
const geo = JSON.parse(
  readFileSync(resolve("data/raw/stars/constellations.lines.json"), "utf8")
) as {
  features: {
    id: string;
    geometry: { type: string; coordinates: number[][][] };
  }[];
};

const constellations: Record<string, number[][][]> = {};
for (const f of geo.features) {
  constellations[f.id] = f.geometry.coordinates.map((line) =>
    line.map(([lon, dec]) => [
      Math.round(((lon + 360) % 360) * 100),
      Math.round(dec * 100),
    ])
  );
}
writeFileSync(
  resolve("public/data/constellations.json"),
  JSON.stringify(constellations)
);
console.log(`constellations.json: ${Object.keys(constellations).length} constellations`);

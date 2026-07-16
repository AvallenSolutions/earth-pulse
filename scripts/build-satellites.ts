/**
 * Objects in orbit per year, from CelesTrak's SATCAT (the catalogue of every
 * tracked object since Sputnik). Download first:
 *   curl -sL https://celestrak.org/pub/satcat.csv -o data/raw/satcat.csv
 *
 * For each year an object counts as in orbit if it launched on or before
 * 31 December and had not decayed by then. Earth orbit only (ORBIT_CENTER
 * EA), payloads counted separately from rocket bodies and debris.
 *
 * Output: public/data/satellites.json
 *   { years: [1957..], payloads: [...], debris: [...], attribution }
 *
 * Run: npx tsx scripts/build-satellites.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const csv = readFileSync(resolve("data/raw/satcat.csv"), "utf8").split("\n");
const header = csv[0].split(",");
const col = (name: string) => header.indexOf(name);
const TYPE = col("OBJECT_TYPE");
const LAUNCH = col("LAUNCH_DATE");
const DECAY = col("DECAY_DATE");
const CENTER = col("ORBIT_CENTER");

type Obj = { launch: number; decay: number | null; payload: boolean };
const objects: Obj[] = [];
for (let i = 1; i < csv.length; i++) {
  // SATCAT fields never contain commas, so a plain split is safe
  const row = csv[i].split(",");
  if (row.length < header.length) continue;
  if (row[CENTER] !== "EA") continue; // Earth orbit only
  const launch = row[LAUNCH]?.slice(0, 4);
  if (!launch || !/^\d{4}$/.test(launch)) continue;
  const decay = row[DECAY]?.slice(0, 4);
  objects.push({
    launch: Number(launch),
    decay: decay && /^\d{4}$/.test(decay) ? Number(decay) : null,
    payload: row[TYPE] === "PAY",
  });
}

const thisYear = new Date().getUTCFullYear();
const years: number[] = [];
const payloads: number[] = [];
const debris: number[] = [];
for (let y = 1957; y <= thisYear; y++) {
  let p = 0;
  let d = 0;
  for (const o of objects) {
    // In orbit at the end of year y: launched by then, not yet decayed
    if (o.launch > y) continue;
    if (o.decay !== null && o.decay <= y) continue;
    if (o.payload) p++;
    else d++;
  }
  years.push(y);
  payloads.push(p);
  debris.push(d);
}

writeFileSync(
  resolve("public/data/satellites.json"),
  JSON.stringify({
    years,
    payloads,
    debris,
    attribution: "CelesTrak SATCAT (tracked objects in Earth orbit)",
  })
);

const last = years.length - 1;
console.log(
  `satellites.json: ${years[0]}-${years[last]}; ` +
    `1960: ${payloads[3] + debris[3]}, 1990: ${payloads[33] + debris[33]}, ` +
    `2010: ${payloads[53] + debris[53]}, ${years[last]}: ${payloads[last] + debris[last]} ` +
    `(${payloads[last]} payloads, ${debris[last]} rocket bodies and debris)`
);

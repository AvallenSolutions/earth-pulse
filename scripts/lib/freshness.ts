/**
 * Freshness stamps: each ingest records when it last completed, so the UI
 * can honestly say "data updated N days ago". One JSON file, one key per
 * dataset family.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const PATH = "public/data/freshness.json";

export function markFresh(dataset: string): void {
  let stamps: Record<string, string> = {};
  if (existsSync(PATH)) {
    try {
      stamps = JSON.parse(readFileSync(PATH, "utf8"));
    } catch {
      stamps = {};
    }
  }
  stamps[dataset] = new Date().toISOString();
  mkdirSync("public/data", { recursive: true });
  writeFileSync(PATH, JSON.stringify(stamps, null, 2));
  console.log(`freshness: ${dataset} -> ${stamps[dataset]}`);
}

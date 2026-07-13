import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { MetadataRoute } from "next";
import type { Country } from "@/lib/types";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://earth-pulse.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const countries = JSON.parse(
    readFileSync(join(process.cwd(), "public", "data", "countries.json"), "utf8")
  ) as Country[];
  return [
    { url: BASE, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/planet`, changeFrequency: "weekly", priority: 0.9 },
    ...countries
      .filter((c) => c.iso3 !== "WLD")
      .map((c) => ({
        url: `${BASE}/country/${c.iso3}`,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
  ];
}

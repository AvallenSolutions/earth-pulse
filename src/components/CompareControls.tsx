"use client";

import { CountrySearch } from "./CountrySearch";
import type { Country } from "@/lib/types";

export function CompareControls({
  countries,
  a,
  b,
}: {
  countries: Country[];
  a: string;
  b: string;
}) {
  const go = (nextA: string, nextB: string) => {
    window.location.href = `/compare?a=${nextA}&b=${nextB}`;
  };
  const nameOf = (iso3: string) =>
    countries.find((c) => c.iso3 === iso3)?.name ?? iso3;

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div>
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[#898781]">
          Country A · {nameOf(a)}
        </div>
        <CountrySearch countries={countries} onSelect={(c) => go(c.iso3, b)} />
      </div>
      <div>
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[#898781]">
          Country B · {nameOf(b)}
        </div>
        <CountrySearch countries={countries} onSelect={(c) => go(a, c.iso3)} />
      </div>
    </div>
  );
}

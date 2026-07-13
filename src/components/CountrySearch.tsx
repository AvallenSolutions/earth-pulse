"use client";

import { useEffect, useRef, useState } from "react";
import type { Country } from "@/lib/types";

export function CountrySearch({
  countries,
  onSelect,
}: {
  countries: Country[];
  onSelect: (c: Country) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const matches = q.trim()
    ? countries
        .filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()))
        .slice(0, 8)
    : [];

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && matches[active]) {
            onSelect(matches[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Search a country…"
        aria-label="Search a country"
        className="w-full rounded-lg border border-white/10 bg-[#1a1a19]/90 px-3 py-2 text-sm text-white placeholder-[#898781] backdrop-blur outline-none focus:border-white/30"
      />
      {open && matches.length > 0 && (
        <ul className="absolute mt-1 w-full overflow-hidden rounded-lg border border-white/10 bg-[#1a1a19] shadow-xl">
          {matches.map((c, i) => (
            <li key={c.iso3}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => onSelect(c)}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  i === active ? "bg-white/10 text-white" : "text-[#c3c2b7]"
                }`}
              >
                {c.name}
                {!c.on_map && (
                  <span className="ml-1.5 text-[10px] text-[#898781]">
                    data only
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

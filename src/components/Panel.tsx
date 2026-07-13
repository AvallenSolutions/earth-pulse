"use client";

import { useState, type ReactNode } from "react";

/**
 * Collapsible floating panel used for the map's metric picker and live
 * layers. The header is always visible; `summary` renders in place of the
 * body while collapsed (e.g. the active metric's legend).
 */
export function Panel({
  title,
  badge,
  children,
  summary,
  defaultOpen = true,
  className = "",
}: {
  title: string;
  badge?: string;
  children: ReactNode;
  summary?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={`rounded-xl border border-white/10 bg-[#161615]/95 shadow-xl backdrop-blur ${className}`}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[#c3c2b7]">
          {title}
          {badge && (
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-[#c3c2b7]">
              {badge}
            </span>
          )}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"
          className={`shrink-0 text-[#898781] transition-transform ${open ? "" : "-rotate-90"}`}
        >
          <path
            d="M1.5 3.5 L5 7 L8.5 3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {open ? (
        <div className="px-3 pb-3">{children}</div>
      ) : summary ? (
        <div className="px-3 pb-3">{summary}</div>
      ) : null}
    </div>
  );
}

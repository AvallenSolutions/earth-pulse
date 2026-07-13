"use client";

import { useEffect, useState } from "react";
import { LineChart } from "./LineChart";

const ACCENTS: Record<string, string> = {
  co2: "#fb9a3c",
  temperature: "#e66767",
  seaice: "#4eb3d3",
};

type History = {
  label: string;
  unit: string;
  source: string;
  sourceUrl: string;
  points: [number, number][];
};

/** Full-history chart behind a vitals card, as a modal over the map. */
export function VitalsModal({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<History | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/vitals-history/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => alive && setData(j))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={data?.label ?? "History"}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-white/15 bg-[#141413] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">
              {data?.label ?? "Loading…"}
            </h2>
            {data && (
              <p className="mt-0.5 text-xs tabular-nums text-[#898781]">
                {Math.floor(data.points[0][0])} to{" "}
                {Math.floor(data.points[data.points.length - 1][0])}
                {" · "}latest {data.points[data.points.length - 1][1]} {data.unit}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[#898781] hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>
        <div className="mt-4 min-h-[200px]">
          {data && (
            <LineChart
              points={data.points}
              unit={data.unit}
              colour={ACCENTS[id] ?? "#3987e5"}
              baseline={id === "temperature" ? "zero" : "data"}
              height={220}
            />
          )}
          {failed && (
            <p className="pt-16 text-center text-sm text-[#898781]">
              The data feed is unavailable right now. Try again shortly.
            </p>
          )}
        </div>
        {data && (
          <p className="mt-3 text-xs text-[#898781]">
            Source:{" "}
            <a
              href={data.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[#6da7ec] hover:underline"
            >
              {data.source}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

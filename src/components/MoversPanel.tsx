import { formatValue, type Country, type Metric, type SeriesFile } from "@/lib/types";

/**
 * Biggest movers: which countries rose and fell most over the last decade of
 * data for one metric. Deliberately neutral wording (a rise in meat supply
 * and a rise in renewables mean very different things for the planet), so the
 * data speaks and the explainer carries the judgement.
 *
 * Pure component: works server-side (/planet) and inside the map's client
 * tree, where the series file is already loaded for sparklines.
 */

type Mover = { iso3: string; name: string; delta: number; from: number; to: number };

export function computeMovers(
  series: SeriesFile,
  countries: Country[],
  span = 10
): { rises: Mover[]; falls: Mover[] } {
  const names = new Map(countries.map((c) => [c.iso3, c.name]));
  const movers: Mover[] = [];
  for (const [iso3, points] of Object.entries(series)) {
    if (!names.has(iso3) || points.length < 2) continue;
    const [lastYear, lastValue] = points[points.length - 1];
    // the closest observation to `span` years before the latest one
    const target = lastYear - span;
    let base = points[0];
    for (const p of points) {
      if (Math.abs(p[0] - target) < Math.abs(base[0] - target)) base = p;
    }
    if (base[0] >= lastYear) continue;
    movers.push({
      iso3,
      name: names.get(iso3)!,
      delta: lastValue - base[1],
      from: base[0],
      to: lastYear,
    });
  }
  movers.sort((a, b) => b.delta - a.delta);
  return {
    rises: movers.filter((m) => m.delta > 0).slice(0, 5),
    falls: movers
      .filter((m) => m.delta < 0)
      .slice(-5)
      .reverse(),
  };
}

function MoverRow({ mover, unit }: { mover: Mover; unit: string }) {
  const sign = mover.delta > 0 ? "+" : "−";
  return (
    <a
      href={`/country/${mover.iso3}`}
      className="flex items-baseline justify-between gap-2 rounded px-1.5 py-1 text-sm transition-colors hover:bg-white/5"
    >
      <span className="truncate text-[#e8e6df]">{mover.name}</span>
      <span
        className="shrink-0 tabular-nums text-xs"
        style={{ color: mover.delta > 0 ? "#e0a355" : "#6da7ec" }}
        title={`${sign}${formatValue(Math.abs(mover.delta), unit)}`}
      >
        {sign}
        {formatValue(Math.abs(mover.delta), "").trim()}
      </span>
    </a>
  );
}

export function MoversPanel({
  series,
  countries,
  metric,
}: {
  series: SeriesFile;
  countries: Country[];
  metric: Metric;
}) {
  const { rises, falls } = computeMovers(series, countries);
  if (rises.length === 0 && falls.length === 0) return null;
  const spanLabel =
    rises[0] ?? falls[0]
      ? `${(rises[0] ?? falls[0]).from}-${(rises[0] ?? falls[0]).to}`
      : "";
  return (
    <div className="text-sm">
      <p className="mb-2 text-xs text-[#898781]">
        {metric.name} in {metric.unit}, change over roughly a decade ({spanLabel})
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#898781]">
            Biggest rises
          </div>
          {rises.map((m) => (
            <MoverRow key={m.iso3} mover={m} unit={metric.unit} />
          ))}
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#898781]">
            Biggest falls
          </div>
          {falls.map((m) => (
            <MoverRow key={m.iso3} mover={m} unit={metric.unit} />
          ))}
          {falls.length === 0 && (
            <p className="px-1.5 py-1 text-xs text-[#898781]">
              No countries fell over this period.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

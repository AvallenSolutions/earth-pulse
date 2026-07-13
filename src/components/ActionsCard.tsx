import type { SeriesFile } from "@/lib/types";

/**
 * "What can one person do" card for country pages. The core actions are the
 * consistently highest-impact personal choices in the research (Wynes &
 * Nicholas 2017; IPCC AR6 WGIII demand chapter). One line is contextualised
 * with the country's own energy data where we have it.
 */
export function ActionsCard({
  seriesByMetric,
  iso3,
}: {
  seriesByMetric: Record<string, SeriesFile>;
  iso3: string;
}) {
  const latest = (id: string): number | null => {
    const s = seriesByMetric[id]?.[iso3];
    return s?.length ? s[s.length - 1][1] : null;
  };

  const renewables = latest("renewables_share_energy");
  const fossil = latest("fossil_share_energy");

  // Phrased without the country name to sidestep "the United Kingdom" etc.
  const energyLine =
    renewables !== null && fossil !== null
      ? renewables >= 50
        ? `Renewables already supply ${renewables.toFixed(0)}% of the energy used here, so the biggest personal wins are usually transport and diet.`
        : `Fossil fuels still supply ${fossil.toFixed(0)}% of the energy used here, so switching your home to a genuinely renewable tariff matters.`
      : null;

  const actions = [
    {
      title: "Fly less",
      detail:
        "One long-haul return flight can outweigh a year of other savings. Swap one flight for a train trip or a call.",
    },
    {
      title: "Eat more plants",
      detail:
        "Shifting towards a plant-rich diet is one of the largest steady cuts a person can make, and it starts with single meals.",
    },
    {
      title: "Travel without a car where you can",
      detail:
        "Walking, cycling and public transport beat an electric car; an electric car beats petrol.",
    },
    {
      title: "Use your voice",
      detail:
        "Personal footprints matter, but system change matters more. Vote, ask your employer and bank what they are doing, and talk about it.",
    },
  ];

  return (
    <section className="mt-10">
      <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-[#898781]">
        What can one person do?
      </h2>
      <div className="rounded-xl border border-white/10 bg-[#1a1a19] p-5">
        {energyLine && (
          <p className="mb-4 text-sm leading-relaxed text-[#c3c2b7]">
            {energyLine}
          </p>
        )}
        <ul className="grid gap-3 sm:grid-cols-2">
          {actions.map((a) => (
            <li key={a.title}>
              <div className="text-sm font-medium text-white">{a.title}</div>
              <div className="mt-0.5 text-xs leading-snug text-[#898781]">
                {a.detail}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-white/10 pt-3 text-[10px] leading-snug text-[#898781]">
          Based on the highest-impact personal actions identified by{" "}
          <a
            href="https://iopscience.iop.org/article/10.1088/1748-9326/aa7541"
            target="_blank"
            rel="noreferrer"
            className="text-[#6da7ec] hover:underline"
          >
            Wynes &amp; Nicholas (2017)
          </a>{" "}
          and the IPCC&apos;s AR6 report on demand-side mitigation.
        </p>
      </div>
    </section>
  );
}

import { parseFindingStatement } from "@repo/schemas";

export function FindingStatement({ statement }: { statement: string }) {
  const { claim, options } = parseFindingStatement(statement);
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[17px] font-medium leading-relaxed text-pri whitespace-pre-line">{claim}</p>
      {options.length > 0 && (
        <section aria-labelledby="finding-options" className="flex flex-col gap-2.5">
          <h2 id="finding-options" className="text-[11px] font-semibold uppercase tracking-wide text-mut">
            Options
          </h2>
          <ul className="flex flex-col gap-2">
            {options.map((option, index) => (
              <li key={`${option.label}-${index}`} className="rounded-xl border border-base bg-surface p-3.5">
                <p className="text-[13px] font-semibold text-pri">{option.label}</p>
                {option.value && <p className="mt-0.5 text-[12.5px] text-sec">{option.value}</p>}
                {option.fits.length > 0 && (
                  <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-mut">
                    <span>Good for:</span>
                    {option.fits.map((fit) => (
                      <span key={fit} className="rounded-full bg-tertiary px-2 py-0.5 text-sec">
                        {fit}
                      </span>
                    ))}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

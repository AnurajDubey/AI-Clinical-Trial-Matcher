import type { Trial, TrialBucket, TrialVerdict } from "@/lib/types";
import { STATUS_STYLES } from "./CriteriaList";
import { TrialCard } from "./TrialCard";

export interface MatchResults {
  trials: Trial[]; // original search order
  verdicts: Record<string, TrialVerdict>;
  nearMissPaths: Record<string, string>;
  pendingIds: Set<string>;
  gapPendingIds: Set<string>;
  errors: Record<string, string>;
  unreviewed: Trial[]; // survivors beyond the per-run LLM budget
}

const SECTIONS: { bucket: TrialBucket; title: string; blurb: string }[] = [
  {
    bucket: "QUALIFIES",
    title: "Likely qualifies",
    blurb: "The profile appears to meet the published criteria — the trial site makes the final call.",
  },
  {
    bucket: "NEAR_MISS",
    title: "Near misses",
    blurb: "Close, but something specific stands in the way — often addressable.",
  },
  {
    bucket: "EXCLUDED",
    title: "Likely excluded",
    blurb: "A fundamental mismatch with the published criteria.",
  },
];

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-90"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function ResultsView({
  results,
  distanceLabels,
  onRetry,
}: {
  results: MatchResults;
  distanceLabels: Record<string, string>;
  onRetry: (nctId: string) => void;
}) {
  const byBucket: Record<TrialBucket, Trial[]> = { QUALIFIES: [], NEAR_MISS: [], EXCLUDED: [] };
  const inProgress: Trial[] = [];
  for (const t of results.trials) {
    const v = results.verdicts[t.nctId];
    if (v) byBucket[v.status].push(t);
    else inProgress.push(t);
  }

  const card = (t: Trial) => (
    <li key={t.nctId} className="animate-rise">
      <TrialCard
        trial={t}
        verdict={results.verdicts[t.nctId]}
        gapPath={results.nearMissPaths[t.nctId]}
        gapPending={results.gapPendingIds.has(t.nctId)}
        pending={results.pendingIds.has(t.nctId)}
        error={results.errors[t.nctId]}
        onRetry={() => onRetry(t.nctId)}
        distanceLabel={distanceLabels[t.nctId]}
      />
    </li>
  );

  return (
    <div className="space-y-7">
      {SECTIONS.map(({ bucket, title, blurb }) => {
        const items = byBucket[bucket];
        const style = STATUS_STYLES[bucket];
        const countBadge = (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
            {items.length}
          </span>
        );

        // Excluded list is long and low-value — keep it collapsed by default
        if (bucket === "EXCLUDED") {
          return (
            <details key={bucket} className="group">
              <summary className="flex cursor-pointer select-none items-center gap-2">
                <Chevron />
                <span className={`inline-block h-2 w-2 rounded-full ${style.dot}`} />
                <span className="text-sm font-semibold text-slate-900">Likely excluded</span>
                {countBadge}
                <span className="text-xs font-normal text-slate-400">expand</span>
              </summary>
              <div className="mt-3">
                {items.length > 0 ? (
                  <ul className="space-y-4">{items.map(card)}</ul>
                ) : (
                  <p className="text-xs text-slate-400">None.</p>
                )}
              </div>
            </details>
          );
        }

        return (
          <section key={bucket}>
            <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className={`inline-block h-2 w-2 self-center rounded-full ${style.dot}`} />
              <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
              {countBadge}
              <p className="w-full text-xs text-slate-400 sm:w-auto">{blurb}</p>
            </div>
            {items.length > 0 ? (
              <ul className="space-y-4">{items.map(card)}</ul>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-xs text-slate-400">
                None yet.
              </p>
            )}
          </section>
        );
      })}

      {inProgress.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
            Under review ({inProgress.length})
          </h2>
          <ul className="space-y-4">{inProgress.map(card)}</ul>
        </section>
      )}

      {results.unreviewed.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-slate-400 transition hover:text-slate-600">
            <Chevron />
            {results.unreviewed.length} more matching trials were not reviewed in this run (per-run
            reasoning budget) — expand to see them
          </summary>
          <ul className="mt-3 space-y-4">
            {results.unreviewed.map((t) => (
              <li key={t.nctId} className="animate-rise">
                <TrialCard trial={t} distanceLabel={distanceLabels[t.nctId]} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

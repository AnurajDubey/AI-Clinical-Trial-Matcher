import type { Trial, TrialVerdict } from "@/lib/types";
import { CriteriaList, STATUS_STYLES } from "./CriteriaList";

function formatPhase(phases: string[]): string | null {
  if (phases.length === 0) return null;
  const labels = phases
    .filter((p) => p !== "NA")
    .map((p) => p.replace("EARLY_PHASE1", "Early Phase 1").replace(/^PHASE(\d)$/, "Phase $1"));
  return labels.length > 0 ? labels.join(" / ") : null;
}

function formatAgeRange(t: Trial): string {
  const { minimumAgeYears: min, maximumAgeYears: max } = t.eligibility;
  if (min === undefined && max === undefined) return "All ages";
  if (max === undefined) return `${formatYears(min!)}+`;
  if (min === undefined) return `up to ${formatYears(max)}`;
  return `${formatYears(min)}–${formatYears(max)}`;
}

function formatYears(y: number): string {
  if (y >= 1) return `${Math.round(y)}`;
  const months = Math.round(y * 12);
  return months > 0 ? `${months} mo` : "birth";
}

function formatSex(sex?: string): string {
  if (sex === "MALE") return "Male";
  if (sex === "FEMALE") return "Female";
  return "All sexes";
}

export function TrialCard({
  trial,
  verdict,
  gapPath,
  pending,
  error,
  onRetry,
  distanceLabel,
}: {
  trial: Trial;
  verdict?: TrialVerdict;
  gapPath?: string;
  pending?: boolean;
  error?: string;
  onRetry?: () => void;
  distanceLabel?: string;
}) {
  const phase = formatPhase(trial.phases);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-sm font-semibold leading-snug text-slate-900">{trial.briefTitle}</h3>
        <a
          href={`https://clinicaltrials.gov/study/${trial.nctId}`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 font-mono text-xs text-sky-600 hover:underline"
        >
          {trial.nctId}
        </a>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-700">
          {trial.overallStatus === "RECRUITING" ? "Recruiting" : trial.overallStatus}
        </span>
        {phase && (
          <span className="rounded-full bg-violet-50 px-2.5 py-0.5 font-medium text-violet-700">
            {phase}
          </span>
        )}
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-600">
          {formatSex(trial.eligibility.sex)} · {formatAgeRange(trial)}
        </span>
        <span className="text-slate-400">
          {trial.locations.length} {trial.locations.length === 1 ? "site" : "sites"}
          {distanceLabel && ` · nearest ${distanceLabel}`}
        </span>
      </div>

      {pending && (
        <p className="mt-3 text-xs text-slate-500">
          <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-sky-500 border-t-transparent align-middle" />
          Reasoning over eligibility criteria…
        </p>
      )}

      {error && (
        <p className="mt-3 text-xs text-red-600">
          {error}{" "}
          {onRetry && (
            <button type="button" onClick={onRetry} className="font-medium underline">
              Retry
            </button>
          )}
        </p>
      )}

      {verdict && (
        <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${STATUS_STYLES[verdict.status].banner}`}
          >
            <p className="font-semibold">{STATUS_STYLES[verdict.status].label}</p>
            <p className="mt-1">{verdict.summary}</p>
          </div>

          {gapPath && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <p className="font-semibold">Path to eligibility</p>
              <p className="mt-1 whitespace-pre-line">{gapPath}</p>
            </div>
          )}

          <details className="group">
            <summary className="cursor-pointer select-none text-xs font-medium text-slate-500 hover:text-slate-700">
              Criterion-by-criterion reasoning ({verdict.criteria.length})
            </summary>
            <div className="mt-2">
              <CriteriaList criteria={verdict.criteria} />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

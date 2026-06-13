import type { Trial, TrialBucket, TrialVerdict } from "@/lib/types";
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

function StatusIcon({ status }: { status: TrialBucket }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-4 w-4 shrink-0",
  };
  if (status === "QUALIFIES") {
    return (
      <svg {...common}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  if (status === "NEAR_MISS") {
    return (
      <svg {...common}>
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function TrialCard({
  trial,
  verdict,
  gapPath,
  gapPending,
  pending,
  error,
  onRetry,
  distanceLabel,
}: {
  trial: Trial;
  verdict?: TrialVerdict;
  gapPath?: string;
  gapPending?: boolean;
  pending?: boolean;
  error?: string;
  onRetry?: () => void;
  distanceLabel?: string;
}) {
  const phase = formatPhase(trial.phases);
  const accent = verdict ? STATUS_STYLES[verdict.status].accent : "border-l-slate-200";

  return (
    <div
      className={`rounded-2xl border border-l-4 border-slate-200/80 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover ${accent}`}
    >
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-sm font-semibold leading-snug text-slate-900">{trial.briefTitle}</h3>
        <a
          href={`https://clinicaltrials.gov/study/${trial.nctId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-50 px-2 py-1 font-mono text-xs text-teal-600 transition hover:bg-teal-50 hover:text-teal-700"
        >
          {trial.nctId}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3"
          >
            <path d="M7 17 17 7" />
            <path d="M7 7h10v10" />
          </svg>
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
        <p className="mt-3 flex items-center text-xs text-slate-500">
          <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-teal-500 border-t-transparent align-middle" />
          Reasoning over eligibility criteria…
        </p>
      )}

      {error && (
        <p className="mt-3 text-xs text-rose-600">
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
            className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${STATUS_STYLES[verdict.status].banner}`}
          >
            <span className="mt-0.5">
              <StatusIcon status={verdict.status} />
            </span>
            <div className="min-w-0">
              <p className="font-semibold">{STATUS_STYLES[verdict.status].label}</p>
              <p className="mt-1">{verdict.summary}</p>
            </div>
          </div>

          {gapPath && (
            <div className="flex items-start gap-2.5 rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50 to-emerald-50 px-4 py-3 text-sm text-teal-900">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-0.5 h-4 w-4 shrink-0 text-teal-600"
              >
                <circle cx="6" cy="19" r="3" />
                <circle cx="18" cy="5" r="3" />
                <path d="M9 19h5a4 4 0 0 0 4-4V8" />
              </svg>
              <div className="min-w-0">
                <p className="font-semibold">Path to eligibility</p>
                <p className="mt-1 whitespace-pre-line">{gapPath}</p>
              </div>
            </div>
          )}
          {gapPending && (
            <p className="flex items-center text-xs text-slate-500">
              <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-teal-500 border-t-transparent align-middle" />
              Working out the path to eligibility…
            </p>
          )}

          <details className="group">
            <summary className="flex cursor-pointer select-none items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-700">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5 transition-transform group-open:rotate-90"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
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

import type { CriterionVerdict, TrialBucket, Verdict } from "@/lib/types";

const VERDICT_STYLES: Record<Verdict, { chip: string; label: string }> = {
  MET: { chip: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Met" },
  NOT_MET: { chip: "bg-rose-50 text-rose-700 border-rose-200", label: "Not met" },
  UNKNOWN: { chip: "bg-amber-50 text-amber-700 border-amber-200", label: "Unknown" },
};

export const STATUS_STYLES: Record<
  TrialBucket,
  { banner: string; dot: string; label: string; accent: string }
> = {
  QUALIFIES: {
    banner: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
    label: "Likely qualifies",
    accent: "border-l-emerald-400",
  },
  NEAR_MISS: {
    banner: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
    label: "Near miss",
    accent: "border-l-amber-400",
  },
  EXCLUDED: {
    banner: "border-rose-200 bg-rose-50 text-rose-800",
    dot: "bg-rose-400",
    label: "Likely excluded",
    accent: "border-l-rose-300",
  },
};

export function CriteriaList({ criteria }: { criteria: CriterionVerdict[] }) {
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {criteria.map((c, i) => {
        const v = VERDICT_STYLES[c.verdict];
        return (
          <li key={i} className="flex items-start gap-3 px-4 py-2.5">
            <span
              className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${v.chip}`}
            >
              {v.label}
            </span>
            <div className="min-w-0 text-xs">
              <p className="text-slate-700">
                <span className="mr-1.5 font-medium uppercase tracking-wide text-slate-400">
                  {c.kind === "INCLUSION" ? "Incl" : "Excl"}
                </span>
                {c.text}
              </p>
              <p className="mt-0.5 text-slate-500">{c.reason}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

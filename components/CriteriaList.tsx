import type { TrialVerdict, Verdict } from "@/lib/types";

const VERDICT_STYLES: Record<Verdict, { chip: string; label: string }> = {
  MET: { chip: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Met" },
  NOT_MET: { chip: "bg-red-50 text-red-700 border-red-200", label: "Not met" },
  UNKNOWN: { chip: "bg-amber-50 text-amber-700 border-amber-200", label: "Unknown" },
};

export const STATUS_STYLES = {
  QUALIFIES: {
    banner: "border-emerald-200 bg-emerald-50 text-emerald-800",
    label: "Likely qualifies",
  },
  NEAR_MISS: {
    banner: "border-amber-200 bg-amber-50 text-amber-800",
    label: "Near miss",
  },
  EXCLUDED: {
    banner: "border-red-200 bg-red-50 text-red-800",
    label: "Likely excluded",
  },
} as const;

export function CriteriaList({ verdict }: { verdict: TrialVerdict }) {
  const status = STATUS_STYLES[verdict.status];
  return (
    <div className="space-y-3">
      <div className={`rounded-lg border px-4 py-3 text-sm ${status.banner}`}>
        <p className="font-semibold">{status.label}</p>
        <p className="mt-1">{verdict.summary}</p>
      </div>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {verdict.criteria.map((c, i) => {
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
    </div>
  );
}

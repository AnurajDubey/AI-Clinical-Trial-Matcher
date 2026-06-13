import type { PatientProfile } from "@/lib/types";

export function ProfileCard({
  profile,
  unknowns,
}: {
  profile: PatientProfile;
  unknowns: string[];
}) {
  const facts: [string, string][] = [];
  if (profile.condition) facts.push(["Condition", profile.condition]);
  if (profile.age !== undefined) facts.push(["Age", String(profile.age)]);
  if (profile.sex) facts.push(["Sex", profile.sex.toLowerCase()]);
  if (profile.location?.city) facts.push(["Location", profile.location.city]);
  if (profile.stage) facts.push(["Stage", profile.stage]);
  for (const [name, value] of Object.entries(profile.biomarkers ?? {})) {
    facts.push([name, value]);
  }
  if (profile.priorTreatments?.length) {
    facts.push(["Prior treatment", profile.priorTreatments.join(", ")]);
  }
  if (profile.comorbidities?.length) {
    facts.push(["Comorbidities", profile.comorbidities.join(", ")]);
  }

  if (facts.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
      <h2 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5 text-sky-500"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
        </svg>
        What the navigator knows
      </h2>
      <div className="flex flex-wrap gap-1.5">
        {facts.map(([label, value]) => (
          <span
            key={`${label}:${value}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-xs"
          >
            <span className="font-medium text-slate-400">{label}</span>
            <span className="text-slate-700">{value}</span>
          </span>
        ))}
      </div>
      {unknowns.length > 0 && (
        <p className="mt-2.5 text-[11px] text-slate-400">
          <span className="font-medium text-slate-500">Still gathering:</span> {unknowns.join(" · ")}
        </p>
      )}
    </div>
  );
}

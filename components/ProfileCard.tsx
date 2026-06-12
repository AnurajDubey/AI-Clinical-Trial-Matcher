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
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        What the navigator knows
      </h2>
      <div className="flex flex-wrap gap-1.5">
        {facts.map(([label, value]) => (
          <span
            key={`${label}:${value}`}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
          >
            <span className="font-medium text-slate-500">{label}:</span> {value}
          </span>
        ))}
      </div>
      {unknowns.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-400">Still unknown: {unknowns.join(" · ")}</p>
      )}
    </div>
  );
}

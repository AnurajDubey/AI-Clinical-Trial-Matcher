"use client";

import type { PatientProfile } from "@/lib/types";
import { EXAMPLE_PATIENTS } from "@/lib/patients";

export interface PatientFormState {
  condition: string;
  age: string;
  sex: string;
  city: string;
  lat?: number;
  lon?: number;
  stage: string;
  biomarkers: string;
  priorTreatments: string;
  comorbidities: string;
}

export const EMPTY_FORM: PatientFormState = {
  condition: "",
  age: "",
  sex: "",
  city: "",
  stage: "",
  biomarkers: "",
  priorTreatments: "",
  comorbidities: "",
};

export function formStateFromProfile(p: PatientProfile): PatientFormState {
  return {
    condition: p.condition ?? "",
    age: p.age?.toString() ?? "",
    sex: p.sex ?? "",
    city: p.location?.city ?? "",
    lat: p.location?.lat,
    lon: p.location?.lon,
    stage: p.stage ?? "",
    biomarkers: Object.entries(p.biomarkers ?? {})
      .map(([k, v]) => `${k}: ${v}`)
      .join(", "),
    priorTreatments: (p.priorTreatments ?? []).join(", "),
    comorbidities: (p.comorbidities ?? []).join(", "),
  };
}

export function profileFromFormState(s: PatientFormState): PatientProfile {
  const biomarkers: Record<string, string> = {};
  for (const pair of s.biomarkers.split(",")) {
    const [key, ...rest] = pair.split(":");
    if (key?.trim() && rest.length > 0) biomarkers[key.trim()] = rest.join(":").trim();
  }
  const list = (v: string) =>
    v
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

  const age = parseInt(s.age, 10);
  return {
    condition: s.condition.trim() || undefined,
    age: Number.isNaN(age) ? undefined : age,
    sex: s.sex || undefined,
    location: s.city.trim() ? { city: s.city.trim(), lat: s.lat, lon: s.lon } : undefined,
    stage: s.stage.trim() || undefined,
    biomarkers: Object.keys(biomarkers).length > 0 ? biomarkers : undefined,
    priorTreatments: list(s.priorTreatments).length > 0 ? list(s.priorTreatments) : undefined,
    comorbidities: list(s.comorbidities).length > 0 ? list(s.comorbidities) : undefined,
  };
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";

export function PatientForm({
  state,
  onChange,
}: {
  state: PatientFormState;
  onChange: (next: PatientFormState) => void;
}) {
  const set = (patch: Partial<PatientFormState>) => onChange({ ...state, ...patch });
  // typing a new city invalidates coordinates carried over from an example patient
  const setCity = (city: string) => onChange({ ...state, city, lat: undefined, lon: undefined });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Patient profile</h2>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Load example:</span>
          {Object.entries(EXAMPLE_PATIENTS).map(([name, profile]) => (
            <button
              key={name}
              type="button"
              onClick={() => onChange(formStateFromProfile(profile))}
              className="rounded-full border border-slate-300 px-3 py-1 font-medium text-slate-600 transition hover:border-sky-400 hover:text-sky-700"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block lg:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-500">Condition</span>
          <input
            value={state.condition}
            onChange={(e) => set({ condition: e.target.value })}
            placeholder="e.g. metastatic breast cancer"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Age</span>
          <input
            value={state.age}
            onChange={(e) => set({ age: e.target.value })}
            placeholder="54"
            inputMode="numeric"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Sex</span>
          <select
            value={state.sex}
            onChange={(e) => set({ sex: e.target.value })}
            className={inputClass}
          >
            <option value="">—</option>
            <option value="FEMALE">Female</option>
            <option value="MALE">Male</option>
          </select>
        </label>
        <label className="block lg:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-500">Location</span>
          <input
            value={state.city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City, state"
            className={inputClass}
          />
        </label>
        <label className="block lg:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-500">Stage / severity</span>
          <input
            value={state.stage}
            onChange={(e) => set({ stage: e.target.value })}
            placeholder="e.g. IV (metastatic)"
            className={inputClass}
          />
        </label>
        <label className="block lg:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Biomarkers <span className="font-normal text-slate-400">(name: value, …)</span>
          </span>
          <input
            value={state.biomarkers}
            onChange={(e) => set({ biomarkers: e.target.value })}
            placeholder="HER2: positive, ER: positive"
            className={inputClass}
          />
        </label>
        <label className="block lg:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Prior treatments <span className="font-normal text-slate-400">(comma-separated)</span>
          </span>
          <input
            value={state.priorTreatments}
            onChange={(e) => set({ priorTreatments: e.target.value })}
            placeholder="trastuzumab, paclitaxel"
            className={inputClass}
          />
        </label>
        <label className="block lg:col-span-4">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Comorbidities <span className="font-normal text-slate-400">(comma-separated)</span>
          </span>
          <input
            value={state.comorbidities}
            onChange={(e) => set({ comorbidities: e.target.value })}
            placeholder="controlled hypertension"
            className={inputClass}
          />
        </label>
      </div>
    </div>
  );
}

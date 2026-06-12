// Core domain types for the Clinical Trial Navigator.

export type Verdict = "MET" | "NOT_MET" | "UNKNOWN";

export type TrialBucket = "QUALIFIES" | "NEAR_MISS" | "EXCLUDED";

export interface PatientProfile {
  condition?: string;
  age?: number;
  sex?: string;
  location?: { city?: string; lat?: number; lon?: number };
  stage?: string;
  biomarkers?: Record<string, string>; // e.g. { HER2: "positive" }
  priorTreatments?: string[];
  comorbidities?: string[];
}

export interface TrialLocation {
  facility?: string;
  city?: string;
  state?: string;
  country?: string;
  lat?: number;
  lon?: number;
}

export interface ArmGroup {
  label?: string;
  type?: string;
  description?: string;
  interventionNames: string[];
}

export interface TrialContact {
  name?: string;
  role?: string;
  phone?: string;
  email?: string;
}

// Simplified internal shape extracted from a CT.gov v2 study record.
export interface Trial {
  nctId: string;
  briefTitle: string;
  overallStatus: string;
  conditions: string[];
  phases: string[];
  enrollmentCount?: number;
  eligibility: {
    criteriaText: string;
    sex?: string; // "ALL" | "MALE" | "FEMALE"
    minimumAgeYears?: number;
    maximumAgeYears?: number; // often absent on CT.gov
    stdAges: string[];
    healthyVolunteers?: boolean;
  };
  armGroups: ArmGroup[];
  interventions: { type?: string; name?: string; description?: string }[];
  centralContacts: TrialContact[];
  locations: TrialLocation[];
}

export interface CriterionVerdict {
  text: string;
  kind: "INCLUSION" | "EXCLUSION";
  verdict: Verdict; // always relative to eligibility: MET is good for the patient
  reason: string;
}

export interface TrialVerdict {
  status: TrialBucket;
  summary: string;
  criteria: CriterionVerdict[];
}

export interface AgentState {
  profile: PatientProfile;
  unknowns: string[]; // high-value fields still missing
  candidates: Trial[]; // trials pulled from CT.gov
  verdicts: Record<string, TrialVerdict>; // keyed by nctId
  nearMissPaths: Record<string, string>; // nctId -> path to eligibility
  history: { tool: string; detail: string }[]; // running tool log
  done: boolean;
}

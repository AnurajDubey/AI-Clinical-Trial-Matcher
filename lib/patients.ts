import type { PatientProfile } from "./types";

// Synthetic example patients — no real PHI. The trials are real; these are not.
export const EXAMPLE_PATIENTS: Record<string, PatientProfile> = {
  Maria: {
    condition: "metastatic HER2-positive breast cancer",
    age: 54,
    sex: "FEMALE",
    location: { city: "San Diego, CA", lat: 32.7157, lon: -117.1611 },
    stage: "IV (metastatic)",
    biomarkers: { HER2: "positive", ER: "positive", PR: "negative" },
    priorTreatments: ["trastuzumab", "paclitaxel"],
    comorbidities: ["controlled hypertension"],
  },
  James: {
    condition: "Parkinson's disease",
    age: 67,
    sex: "MALE",
    location: { city: "Billings, MT", lat: 45.7833, lon: -108.5007 },
    stage: "moderate, Hoehn & Yahr stage 2",
    biomarkers: {},
    priorTreatments: ["levodopa/carbidopa (current)"],
    comorbidities: ["type 2 diabetes"],
  },
};

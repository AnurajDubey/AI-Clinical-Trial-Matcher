// Cheap, reliable structured-field checks that run BEFORE any LLM call.
// Trials that fail here go straight to the Excluded bucket with a code-built
// verdict — no tokens spent.

import type { CriterionVerdict, PatientProfile, Trial, TrialVerdict } from "./types";

export const MAX_SITE_DISTANCE_KM = 500;

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface NearestSite {
  km: number;
  label: string;
}

export function nearestSite(trial: Trial, profile: PatientProfile): NearestSite | null {
  const { lat, lon } = profile.location ?? {};
  if (lat === undefined || lon === undefined) return null;
  let best: NearestSite | null = null;
  for (const site of trial.locations) {
    if (site.lat === undefined || site.lon === undefined) continue;
    const km = haversineKm(lat, lon, site.lat, site.lon);
    if (!best || km < best.km) {
      const place = [site.city, site.state ?? site.country].filter(Boolean).join(", ");
      best = { km, label: place || site.facility || "unnamed site" };
    }
  }
  return best;
}

// Returns a code-built EXCLUDED verdict when structured fields rule the trial
// out, or null when the trial should proceed to LLM evaluation.
export function prefilterTrial(trial: Trial, profile: PatientProfile): TrialVerdict | null {
  const failures: CriterionVerdict[] = [];
  const { sex, minimumAgeYears, maximumAgeYears } = trial.eligibility;

  if (profile.sex && sex && sex !== "ALL" && sex !== profile.sex.toUpperCase()) {
    failures.push({
      text: `Enrolls ${sex.toLowerCase()} participants only`,
      kind: "INCLUSION",
      verdict: "NOT_MET",
      reason: `Patient sex is ${profile.sex.toLowerCase()}.`,
    });
  }

  if (profile.age !== undefined) {
    if (minimumAgeYears !== undefined && profile.age < minimumAgeYears) {
      failures.push({
        text: `Minimum age ${formatAge(minimumAgeYears)}`,
        kind: "INCLUSION",
        verdict: "NOT_MET",
        reason: `Patient is ${profile.age}.`,
      });
    }
    if (maximumAgeYears !== undefined && profile.age > maximumAgeYears) {
      failures.push({
        text: `Maximum age ${formatAge(maximumAgeYears)}`,
        kind: "INCLUSION",
        verdict: "NOT_MET",
        reason: `Patient is ${profile.age}.`,
      });
    }
  }

  const nearest = nearestSite(trial, profile);
  if (nearest && nearest.km > MAX_SITE_DISTANCE_KM) {
    failures.push({
      text: `Study site within practical reach (≤${MAX_SITE_DISTANCE_KM} km)`,
      kind: "INCLUSION",
      verdict: "NOT_MET",
      reason: `Nearest site is ~${Math.round(nearest.km).toLocaleString()} km away (${nearest.label}).`,
    });
  }

  if (failures.length === 0) return null;

  return {
    status: "EXCLUDED",
    summary: `Ruled out before detailed review: ${failures.map((f) => f.reason).join(" ")}`.trim(),
    criteria: failures,
  };
}

function formatAge(years: number): string {
  if (years >= 1) return `${Math.round(years)} years`;
  return `${Math.round(years * 12)} months`;
}

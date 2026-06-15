// ClinicalTrials.gov API v2 client. Free and open — no API key.

import type { ArmGroup, Trial, TrialContact, TrialLocation } from "./types";

const CTGOV_BASE = "https://clinicaltrials.gov/api/v2";

// Trim payloads to the modules the agent actually reasons over.
const STUDY_FIELDS = [
  "protocolSection.identificationModule",
  "protocolSection.statusModule.overallStatus",
  "protocolSection.conditionsModule.conditions",
  "protocolSection.designModule",
  "protocolSection.armsInterventionsModule",
  "protocolSection.eligibilityModule",
  "protocolSection.contactsLocationsModule",
].join(",");

export interface TrialSearchQuery {
  condition: string;
  intervention?: string;
  pageSize?: number;
}

export async function searchTrials(query: TrialSearchQuery): Promise<Trial[]> {
  const params = new URLSearchParams({
    "query.cond": query.condition,
    "filter.overallStatus": "RECRUITING",
    pageSize: String(query.pageSize ?? 25),
    fields: STUDY_FIELDS,
    format: "json",
  });
  if (query.intervention) params.set("query.intr", query.intervention);

  const res = await fetch(`${CTGOV_BASE}/studies?${params}`);
  if (!res.ok) {
    throw new Error(`ClinicalTrials.gov search failed: HTTP ${res.status}`);
  }
  const data: unknown = await res.json();
  const studies = isRecord(data) && Array.isArray(data.studies) ? data.studies : [];
  return studies.map(toTrial).filter((t): t is Trial => t !== null);
}

export async function getTrial(nctId: string): Promise<Trial | null> {
  const res = await fetch(`${CTGOV_BASE}/studies/${encodeURIComponent(nctId)}?format=json`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`ClinicalTrials.gov detail failed: HTTP ${res.status}`);
  }
  return toTrial(await res.json());
}

export interface TrialNarrative {
  briefSummary?: string;
  detailedDescription?: string;
}

// The prose modules the trimmed `Trial` omits — protocol summary and the full
// detailed description, where cohort splits and prior-therapy lines often live.
// The eligibility-analyst pulls this on demand when the bullet criteria are
// ambiguous.
export async function fetchTrialNarrative(nctId: string): Promise<TrialNarrative | null> {
  const res = await fetch(`${CTGOV_BASE}/studies/${encodeURIComponent(nctId)}?format=json`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`ClinicalTrials.gov detail failed: HTTP ${res.status}`);
  }
  const data: unknown = await res.json();
  const proto = isRecord(data) ? data.protocolSection : undefined;
  const desc = isRecord(proto) ? proto.descriptionModule : undefined;
  if (!isRecord(desc)) return {};
  return {
    briefSummary: stringOrUndefined(desc.briefSummary),
    detailedDescription: stringOrUndefined(desc.detailedDescription),
  };
}

// CT.gov ages are unit-strings like "18 Years", "6 Months" — convert to years.
export function parseAgeYears(age: unknown): number | undefined {
  if (typeof age !== "string") return undefined;
  const m = age.trim().match(/^([\d.]+)\s*(year|month|week|day|hour|minute)s?$/i);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return undefined;
  switch (m[2].toLowerCase()) {
    case "year":
      return n;
    case "month":
      return n / 12;
    case "week":
      return n / 52;
    case "day":
      return n / 365;
    default:
      return 0; // hours/minutes — effectively newborn
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// Raw CT.gov JSON is deeply nested with most fields optional; we narrow it to
// `Trial` in one place so the rest of the app never touches `any`.
function toTrial(study: any): Trial | null {
  const proto = study?.protocolSection;
  const nctId = proto?.identificationModule?.nctId;
  if (typeof nctId !== "string" || nctId.length === 0) return null;

  const elig = proto?.eligibilityModule ?? {};
  const arms = proto?.armsInterventionsModule ?? {};
  const contacts = proto?.contactsLocationsModule ?? {};

  return {
    nctId,
    briefTitle: proto?.identificationModule?.briefTitle ?? "(untitled study)",
    overallStatus: proto?.statusModule?.overallStatus ?? "UNKNOWN",
    conditions: asStringArray(proto?.conditionsModule?.conditions),
    phases: asStringArray(proto?.designModule?.phases),
    enrollmentCount: numberOrUndefined(proto?.designModule?.enrollmentInfo?.count),
    eligibility: {
      criteriaText: typeof elig.eligibilityCriteria === "string" ? elig.eligibilityCriteria : "",
      sex: typeof elig.sex === "string" ? elig.sex : undefined,
      minimumAgeYears: parseAgeYears(elig.minimumAge),
      maximumAgeYears: parseAgeYears(elig.maximumAge), // often absent — stays undefined
      stdAges: asStringArray(elig.stdAges),
      healthyVolunteers: typeof elig.healthyVolunteers === "boolean" ? elig.healthyVolunteers : undefined,
    },
    armGroups: asArray(arms.armGroups).map(
      (g: any): ArmGroup => ({
        label: stringOrUndefined(g?.label),
        type: stringOrUndefined(g?.type),
        description: stringOrUndefined(g?.description),
        interventionNames: asStringArray(g?.interventionNames),
      }),
    ),
    interventions: asArray(arms.interventions).map((i: any) => ({
      type: stringOrUndefined(i?.type),
      name: stringOrUndefined(i?.name),
      description: stringOrUndefined(i?.description),
    })),
    centralContacts: asArray(contacts.centralContacts).map(
      (c: any): TrialContact => ({
        name: stringOrUndefined(c?.name),
        role: stringOrUndefined(c?.role),
        phone: stringOrUndefined(c?.phone),
        email: stringOrUndefined(c?.email),
      }),
    ),
    locations: asArray(contacts.locations).map(
      (l: any): TrialLocation => ({
        facility: stringOrUndefined(l?.facility),
        city: stringOrUndefined(l?.city),
        state: stringOrUndefined(l?.state),
        country: stringOrUndefined(l?.country),
        lat: numberOrUndefined(l?.geoPoint?.lat),
        lon: numberOrUndefined(l?.geoPoint?.lon),
      }),
    ),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asStringArray(v: unknown): string[] {
  return asArray(v).filter((x): x is string => typeof x === "string");
}

function stringOrUndefined(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function numberOrUndefined(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

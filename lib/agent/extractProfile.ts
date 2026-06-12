// Structured extraction that turns a free-text patient answer into a profile
// patch — this is how `askPatient` "updates the profile" (spec §4) without an
// extra tool surface.

import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic, MODEL } from "@/lib/anthropic";
import { lookupCityCoords } from "@/lib/cities";
import type { PatientProfile } from "@/lib/types";

const PatchSchema = z.object({
  condition: z.string().nullable(),
  age: z.number().int().nullable(),
  sex: z.enum(["FEMALE", "MALE"]).nullable(),
  city: z.string().nullable().describe('Like "San Diego, CA" when the state is known'),
  stage: z.string().nullable(),
  biomarkers: z
    .array(z.object({ name: z.string(), value: z.string() }))
    .nullable()
    .describe('e.g. [{"name": "HER2", "value": "positive"}]'),
  priorTreatments: z.array(z.string()).nullable(),
  comorbidities: z.array(z.string()).nullable(),
});

const SYSTEM_PROMPT = `You extract patient facts from one intake exchange for a clinical trial navigator.
Return ONLY facts stated or clearly implied about THE PATIENT (the person seeking trials — the speaker may be a caregiver). Use null for anything not mentioned. Never guess or carry over information that is not in this exchange. Normalize: sex to FEMALE/MALE; age to a whole number; condition to a concise clinical phrase (e.g. "metastatic HER2-positive breast cancer").`;

export async function extractProfilePatch(
  question: string,
  answer: string,
): Promise<Partial<ReturnType<typeof PatchSchema.parse>>> {
  const client = getAnthropic();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Question asked: ${question}\n\nPatient/caregiver reply: """${answer}"""`,
      },
    ],
    output_config: { format: zodOutputFormat(PatchSchema) },
  });
  return response.parsed_output ?? {};
}

export function mergePatch(
  profile: PatientProfile,
  patch: z.infer<typeof PatchSchema>,
): PatientProfile {
  const next: PatientProfile = structuredClone(profile);
  if (patch.condition) next.condition = patch.condition;
  if (patch.age !== null && patch.age !== undefined) next.age = patch.age;
  if (patch.sex) next.sex = patch.sex;
  if (patch.city) {
    const coords = lookupCityCoords(patch.city);
    next.location = { city: patch.city, lat: coords?.lat, lon: coords?.lon };
  }
  if (patch.stage) next.stage = patch.stage;
  if (patch.biomarkers) {
    next.biomarkers = { ...next.biomarkers };
    for (const { name, value } of patch.biomarkers) next.biomarkers[name] = value;
  }
  if (patch.priorTreatments) {
    next.priorTreatments = dedupe([...(next.priorTreatments ?? []), ...patch.priorTreatments]);
  }
  if (patch.comorbidities) {
    next.comorbidities = dedupe([...(next.comorbidities ?? []), ...patch.comorbidities]);
  }
  return next;
}

export function deriveUnknowns(p: PatientProfile): string[] {
  const unknowns: string[] = [];
  if (!p.condition) unknowns.push("condition");
  if (p.age === undefined) unknowns.push("age");
  if (!p.sex) unknowns.push("sex");
  if (!p.location?.city) unknowns.push("location");
  if (!p.stage) unknowns.push("stage / severity");
  if (!p.biomarkers || Object.keys(p.biomarkers).length === 0) {
    unknowns.push("biomarkers (receptor / mutation status)");
  }
  if (!p.priorTreatments || p.priorTreatments.length === 0) unknowns.push("prior treatments");
  if (!p.comorbidities || p.comorbidities.length === 0) unknowns.push("comorbidities");
  return unknowns;
}

export async function applyAnswer(
  profile: PatientProfile,
  question: string,
  answer: string,
): Promise<{ profile: PatientProfile; unknowns: string[] }> {
  const patch = await extractProfilePatch(question, answer);
  const merged = mergePatch(profile, patch as z.infer<typeof PatchSchema>);
  return { profile: merged, unknowns: deriveUnknowns(merged) };
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((x) => {
    const key = x.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

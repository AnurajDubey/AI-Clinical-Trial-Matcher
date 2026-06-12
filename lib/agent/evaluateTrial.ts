import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic, MODEL } from "@/lib/anthropic";
import { splitEligibilityCriteria } from "@/lib/criteria";
import type { PatientProfile, Trial, TrialVerdict } from "@/lib/types";

const ItemVerdictSchema = z.object({
  kind: z.enum(["INCLUSION", "EXCLUSION"]),
  index: z.number().int().describe("1-based index of the criterion in its list"),
  verdict: z.enum(["MET", "NOT_MET", "UNKNOWN"]),
  reason: z.string().describe("Short plain-language reason, under 25 words"),
});

const EvaluationSchema = z.object({
  items: z.array(ItemVerdictSchema),
  status: z.enum(["QUALIFIES", "NEAR_MISS", "EXCLUDED"]),
  summary: z
    .string()
    .describe("2-3 plain-language sentences for the patient explaining the overall verdict"),
});

const SYSTEM_PROMPT = `You are the eligibility-reasoning step of a clinical trial navigator. You compare one patient's profile against one trial's eligibility criteria, criterion by criterion.

Verdict semantics — every verdict is relative to ELIGIBILITY:
- For an INCLUSION criterion: MET = the patient satisfies it; NOT_MET = the patient fails it; UNKNOWN = the profile lacks the information to tell.
- For an EXCLUSION criterion: MET = the exclusion does NOT apply (good for eligibility); NOT_MET = the exclusion applies and disqualifies the patient; UNKNOWN = cannot tell from the profile.
Evaluate every listed criterion exactly once. Read the study arm descriptions too — they often carry prior-therapy requirements and cohort splits that override or refine the criteria.

Overall status:
- QUALIFIES: all inclusion criteria MET and no exclusion applies. Purely administrative items (e.g. ability to consent) may stay UNKNOWN.
- NEAR_MISS: the patient fails or is UNKNOWN on a small number of criteria that are plausibly addressable — a washout/timing window, a biomarker or lab test not yet done, a prior-therapy requirement, a cohort restriction where a different cohort could fit, or missing information that could flip the verdict.
- EXCLUDED: a fundamental, non-addressable mismatch — wrong disease, sex or age out of range, a disqualifying comorbidity, or a stage/treatment history that directly contradicts the trial's requirements.

This is decision support, not medical advice. Never promise eligibility — frame the summary as what the profile suggests, and note that the trial site confirms final eligibility. Be concise and concrete; cite the patient's actual values in reasons.`;

export async function evaluateTrial(trial: Trial, profile: PatientProfile): Promise<TrialVerdict> {
  const { inclusion, exclusion } = splitEligibilityCriteria(trial.eligibility.criteriaText);

  if (inclusion.length === 0 && exclusion.length === 0) {
    return {
      status: "NEAR_MISS",
      summary:
        "This trial has not published structured eligibility criteria, so it could not be assessed automatically. Contact the trial site to check eligibility.",
      criteria: [
        {
          text: "Eligibility criteria not published",
          kind: "INCLUSION",
          verdict: "UNKNOWN",
          reason: "No criteria text available from ClinicalTrials.gov.",
        },
      ],
    };
  }

  const arms = trial.armGroups
    .filter((g) => g.label || g.description)
    .map((g) => `- ${g.label ?? "(unnamed arm)"}${g.type ? ` [${g.type}]` : ""}: ${g.description ?? "no description"}`)
    .join("\n");

  const userContent = `PATIENT PROFILE
${JSON.stringify(profile, null, 2)}

TRIAL ${trial.nctId} — ${trial.briefTitle}
Conditions: ${trial.conditions.join(", ") || "not listed"}
Phases: ${trial.phases.join(", ") || "not listed"}

STUDY ARMS / COHORTS:
${arms || "none listed"}

INCLUSION CRITERIA:
${inclusion.map((c, i) => `[${i + 1}] ${c}`).join("\n") || "none listed"}

EXCLUSION CRITERIA:
${exclusion.map((c, i) => `[${i + 1}] ${c}`).join("\n") || "none listed"}

Evaluate each criterion against the patient profile.`;

  const client = getAnthropic();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    output_config: { format: zodOutputFormat(EvaluationSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error(`Evaluation of ${trial.nctId} returned no parseable output`);
  }

  // Join model verdicts back to the original criterion text by index, then
  // backfill anything the model skipped as UNKNOWN.
  const seen = { INCLUSION: new Set<number>(), EXCLUSION: new Set<number>() };
  const criteria: TrialVerdict["criteria"] = [];
  for (const item of parsed.items) {
    const list = item.kind === "INCLUSION" ? inclusion : exclusion;
    if (item.index < 1 || item.index > list.length || seen[item.kind].has(item.index)) continue;
    seen[item.kind].add(item.index);
    criteria.push({
      text: list[item.index - 1],
      kind: item.kind,
      verdict: item.verdict,
      reason: item.reason,
    });
  }
  for (const [kind, list] of [
    ["INCLUSION", inclusion],
    ["EXCLUSION", exclusion],
  ] as const) {
    list.forEach((text, i) => {
      if (!seen[kind].has(i + 1)) {
        criteria.push({ text, kind, verdict: "UNKNOWN", reason: "Not evaluated." });
      }
    });
  }

  return { status: parsed.status, summary: parsed.summary, criteria };
}

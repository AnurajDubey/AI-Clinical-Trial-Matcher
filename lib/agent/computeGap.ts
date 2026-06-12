import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic, MODEL } from "@/lib/anthropic";
import type { PatientProfile, Trial, TrialVerdict } from "@/lib/types";

const BlockerSchema = z.object({
  kind: z.enum([
    "WASHOUT_TIMING",
    "MISSING_TEST",
    "PRIOR_THERAPY",
    "COHORT",
    "INFO_NEEDED",
    "OTHER",
  ]),
  blocker: z.string().describe("The criterion standing in the way, in a few words"),
  action: z
    .string()
    .describe(
      "What would change the verdict, concretely — include the timeline or target result when one can be inferred",
    ),
});

const GapSchema = z.object({
  summary: z.string().describe("One plain-language sentence: the overall path to eligibility"),
  blockers: z.array(BlockerSchema),
});

const KIND_LABELS: Record<z.infer<typeof BlockerSchema>["kind"], string> = {
  WASHOUT_TIMING: "Timing / washout",
  MISSING_TEST: "Missing test",
  PRIOR_THERAPY: "Prior therapy",
  COHORT: "Different cohort",
  INFO_NEEDED: "Info needed",
  OTHER: "Other",
};

const SYSTEM_PROMPT = `You are the gap-analysis step of a clinical trial navigator. A patient is a NEAR MISS for a trial: close to qualifying, but blocked on specific criteria. Reason counterfactually about what would change the verdict.

Blocker kinds:
- WASHOUT_TIMING: a washout or timing window — estimate when the patient could become eligible (e.g. "eligible ~6 weeks after the last dose").
- MISSING_TEST: a biomarker, lab, or imaging result the patient doesn't have yet — name the test and the result that would open the trial.
- PRIOR_THERAPY: a required prior treatment or line-of-therapy mismatch — say what treatment history the trial expects.
- COHORT: the patient is excluded from one arm/cohort but may fit a different one — read the arm descriptions and name the cohort.
- INFO_NEEDED: the verdict is blocked only on missing information, not a real mismatch — say what to find out.
- OTHER: anything else concrete.

Rules:
- Only include genuine blockers (criteria that are NOT_MET, or UNKNOWN in a way that gates eligibility). Skip criteria already MET and administrative noise.
- Be concrete: name drugs, tests, cohorts, and timelines from the trial text — never vague advice like "talk to your doctor about options".
- These are suggested paths, not medical advice. Never advise starting, stopping, or changing a treatment — phrase treatment-dependent paths as something to discuss with the care team (e.g. "if your oncologist plans to stop X anyway, the 4-week washout would complete by ...").
- If nothing would realistically change the verdict, return an empty blockers list and say so in the summary.`;

export async function computeGap(
  trial: Trial,
  profile: PatientProfile,
  verdict: TrialVerdict,
): Promise<string> {
  const blocking = verdict.criteria.filter((c) => c.verdict !== "MET");
  const arms = trial.armGroups
    .filter((g) => g.label || g.description)
    .map((g) => `- ${g.label ?? "(unnamed arm)"}${g.type ? ` [${g.type}]` : ""}: ${g.description ?? "no description"}`)
    .join("\n");

  const userContent = `PATIENT PROFILE
${JSON.stringify(profile, null, 2)}

TRIAL ${trial.nctId} — ${trial.briefTitle}
Conditions: ${trial.conditions.join(", ") || "not listed"}

STUDY ARMS / COHORTS:
${arms || "none listed"}

NEAR-MISS VERDICT SUMMARY: ${verdict.summary}

BLOCKING CRITERIA (verdicts relative to eligibility):
${blocking.map((c) => `- [${c.kind}] [${c.verdict}] ${c.text}\n  reason: ${c.reason}`).join("\n") || "none — see summary"}

What is the path to eligibility?`;

  const client = getAnthropic();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    output_config: { format: zodOutputFormat(GapSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error(`Gap analysis of ${trial.nctId} returned no parseable output`);
  }
  return formatGap(parsed);
}

function formatGap(gap: z.infer<typeof GapSchema>): string {
  const lines = [gap.summary.trim()];
  for (const b of gap.blockers) {
    lines.push(`• ${KIND_LABELS[b.kind]} — ${b.blocker}: ${b.action}`);
  }
  return lines.join("\n");
}

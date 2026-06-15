// Eligibility-analyst sub-agent. The navigator hands it ONE trial; it runs its
// own small tool-use loop — optionally pulling the full protocol narrative when
// the bullet criteria are ambiguous — and returns a criterion-by-criterion
// verdict. This is the "depth" agent to the navigator's "breadth": isolated
// context (just this trial + the patient), its own tools, its own turn budget.

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getAnthropic, MODEL } from "@/lib/anthropic";
import { splitEligibilityCriteria } from "@/lib/criteria";
import { fetchTrialNarrative } from "@/lib/ctgov";
import type { AgentEvent } from "./events";
import type { PatientProfile, Trial, TrialVerdict } from "@/lib/types";

const MAX_ANALYST_TURNS = 4;
const ANALYST_SCOPE = "analyst";

const VerdictInput = z.object({
  items: z.array(
    z.object({
      kind: z.enum(["INCLUSION", "EXCLUSION"]),
      index: z.number().int(),
      verdict: z.enum(["MET", "NOT_MET", "UNKNOWN"]),
      reason: z.string(),
    }),
  ),
  status: z.enum(["QUALIFIES", "NEAR_MISS", "EXCLUDED"]),
  summary: z.string(),
});
type VerdictInput = z.infer<typeof VerdictInput>;

const ANALYST_TOOLS: Anthropic.Tool[] = [
  {
    name: "getTrialDetail",
    description:
      "Fetch the trial's full narrative (brief summary + detailed protocol description) from ClinicalTrials.gov. Use this once when the bullet criteria leave a cohort split, a prior-therapy line, or what the study actually does ambiguous. Skip it when the criteria are already clear.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "finalizeVerdict",
    description:
      "Submit your final criterion-by-criterion judgment for this trial. Call this exactly once, when you are confident — include one item per criterion you assessed.",
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "One entry per eligibility criterion.",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["INCLUSION", "EXCLUSION"] },
              index: { type: "number", description: "1-based index of the criterion within its list" },
              verdict: { type: "string", enum: ["MET", "NOT_MET", "UNKNOWN"] },
              reason: { type: "string", description: "Short plain-language reason, under 25 words" },
            },
            required: ["kind", "index", "verdict", "reason"],
          },
        },
        status: { type: "string", enum: ["QUALIFIES", "NEAR_MISS", "EXCLUDED"] },
        summary: {
          type: "string",
          description: "2-3 plain-language sentences for the patient explaining the overall verdict",
        },
      },
      required: ["items", "status", "summary"],
    },
  },
];

const SYSTEM_PROMPT = `You are an eligibility analyst — a focused sub-agent of a clinical trial navigator. You judge ONE trial against ONE patient, criterion by criterion, and nothing else. You never talk to the patient; if a fact is missing, you record the criterion as UNKNOWN.

Work in turns, ONE tool per turn:
- If the bullet criteria leave a cohort split, prior-therapy line, or what the study does ambiguous, call getTrialDetail once to read the full protocol narrative.
- When confident, call finalizeVerdict with a verdict for EVERY listed criterion.
Most trials need only finalizeVerdict; reach for getTrialDetail only when it would actually change a judgment.

Verdict semantics — every verdict is relative to ELIGIBILITY:
- INCLUSION criterion: MET = the patient satisfies it; NOT_MET = the patient fails it; UNKNOWN = the profile lacks the information to tell.
- EXCLUSION criterion: MET = the exclusion does NOT apply (good for eligibility); NOT_MET = the exclusion applies and disqualifies the patient; UNKNOWN = cannot tell from the profile.

Overall status:
- QUALIFIES: all inclusion criteria MET and no exclusion applies (purely administrative items may remain UNKNOWN).
- NEAR_MISS: fails or is UNKNOWN on a small number of plausibly addressable criteria — a washout/timing window, a test not yet done, a prior-therapy requirement, a cohort restriction where another cohort could fit, or missing info that could flip the verdict.
- EXCLUDED: a fundamental, non-addressable mismatch — wrong disease, sex or age out of range, a disqualifying comorbidity, or a treatment history that directly contradicts the trial.

This is decision support, not medical advice. Never promise eligibility — frame the summary as what the profile suggests and note the site confirms it. Be concise and concrete; cite the patient's actual values.`;

export async function runEligibilityAnalyst({
  trial,
  profile,
  emit,
}: {
  trial: Trial;
  profile: PatientProfile;
  emit: (e: AgentEvent) => void;
}): Promise<TrialVerdict> {
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

  emit({ type: "analystStart", nctId: trial.nctId, title: trial.briefTitle });

  const arms = trial.armGroups
    .filter((g) => g.label || g.description)
    .map(
      (g) =>
        `- ${g.label ?? "(unnamed arm)"}${g.type ? ` [${g.type}]` : ""}: ${g.description ?? "no description"}`,
    )
    .join("\n");

  const baseContext = `PATIENT PROFILE
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

Assess this trial. Pull the full detail only if the criteria are ambiguous, then finalize.`;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: baseContext }];
  const client = getAnthropic();
  let verdict: TrialVerdict | null = null;
  let detailFetched = false;

  for (let turn = 0; turn < MAX_ANALYST_TURNS && !verdict; turn++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive", display: "summarized" },
      system: SYSTEM_PROMPT,
      tools: ANALYST_TOOLS,
      messages,
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        if (event.delta.type === "thinking_delta" && event.delta.thinking) {
          emit({ type: "thinking", delta: event.delta.thinking, agent: ANALYST_SCOPE });
        } else if (event.delta.type === "text_delta" && event.delta.text) {
          emit({ type: "narration", delta: event.delta.text, agent: ANALYST_SCOPE });
        }
      }
    }
    const message = await stream.finalMessage();
    messages.push({ role: "assistant", content: message.content });

    const toolUses = message.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (toolUses.length === 0) {
      messages.push({
        role: "user",
        content: "Call finalizeVerdict now with your best judgment on every criterion.",
      });
      continue;
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      if (toolUse.name === "finalizeVerdict") {
        const parsed = VerdictInput.safeParse(toolUse.input);
        if (!parsed.success) {
          results.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: `Invalid verdict shape: ${parsed.error.message}. Try finalizeVerdict again.`,
          });
          continue;
        }
        verdict = assembleVerdict(parsed.data, inclusion, exclusion);
        results.push({ type: "tool_result", tool_use_id: toolUse.id, content: "Verdict recorded." });
        break;
      }
      if (toolUse.name === "getTrialDetail") {
        emit({
          type: "tool",
          name: "getTrialDetail",
          detail: `Reading full protocol detail for ${trial.nctId}`,
          agent: ANALYST_SCOPE,
        });
        let detailText = "No additional narrative is available for this trial.";
        if (!detailFetched) {
          detailFetched = true;
          const narrative = await fetchTrialNarrative(trial.nctId).catch(() => null);
          const parts = [
            narrative?.briefSummary && `BRIEF SUMMARY:\n${narrative.briefSummary}`,
            narrative?.detailedDescription && `DETAILED DESCRIPTION:\n${narrative.detailedDescription}`,
          ].filter(Boolean);
          if (parts.length) detailText = parts.join("\n\n").slice(0, 6000);
        }
        results.push({ type: "tool_result", tool_use_id: toolUse.id, content: detailText });
        continue;
      }
      results.push({ type: "tool_result", tool_use_id: toolUse.id, content: `Unknown tool: ${toolUse.name}` });
    }

    if (verdict) break;
    messages.push({ role: "user", content: results });
  }

  if (!verdict) {
    // Budget exhausted without a verdict — return a conservative UNKNOWN result
    // rather than throwing, so one stuck trial can't sink the whole run.
    verdict = {
      status: "NEAR_MISS",
      summary:
        "The analyst could not complete a full assessment within its step budget; treat this as unverified and confirm eligibility with the trial site.",
      criteria: [
        ...inclusion.map((text) => ({ text, kind: "INCLUSION" as const, verdict: "UNKNOWN" as const, reason: "Not assessed." })),
        ...exclusion.map((text) => ({ text, kind: "EXCLUSION" as const, verdict: "UNKNOWN" as const, reason: "Not assessed." })),
      ],
    };
  }

  emit({ type: "analystEnd", nctId: trial.nctId, status: verdict.status });
  return verdict;
}

// Join the model's indexed verdicts back to the exact criterion text, then
// backfill anything it skipped as UNKNOWN (same contract as the one-shot path).
function assembleVerdict(
  parsed: VerdictInput,
  inclusion: string[],
  exclusion: string[],
): TrialVerdict {
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

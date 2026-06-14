// The tools the agent can choose between, and the dispatcher that
// executes them against AgentState. The model decides WHICH tool to call;
// this file is the HOW.

import type Anthropic from "@anthropic-ai/sdk";
import { searchTrials as ctgovSearch, getTrial } from "@/lib/ctgov";
import { nearestSite, prefilterTrial } from "@/lib/prefilter";
import { evaluateTrial } from "./evaluateTrial";
import { computeGap } from "./computeGap";
import type { AgentEvent } from "./events";
import type { AgentState, Trial } from "@/lib/types";

export const MAX_EVALUATIONS_PER_RUN = 6;

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "askPatient",
    description:
      "Ask the patient ONE question and wait for their answer. Call this when a single missing fact would meaningfully change which trials are in or out (the highest-information-gain question). Do not ask for facts already in the profile, and do not bundle multiple questions.",
    input_schema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "One clear, warm, plain-language question. No medical jargon unless the patient used it first.",
        },
      },
      required: ["question"],
    },
  },
  {
    name: "searchTrials",
    description:
      "Search ClinicalTrials.gov for recruiting trials matching the patient's condition. Call this once the condition is known (refining the query and re-searching later is allowed). Structured pre-filters (sex, age, site distance) run automatically and exclude obvious mismatches before you see the list.",
    input_schema: {
      type: "object",
      properties: {
        condition: {
          type: "string",
          description: 'Condition query, e.g. "metastatic HER2-positive breast cancer"',
        },
        intervention: {
          type: "string",
          description: "Optional drug/intervention to narrow the search",
        },
      },
      required: ["condition"],
    },
  },
  {
    name: "evaluateTrial",
    description:
      "Reason over ONE candidate trial's full eligibility criteria against the patient profile, criterion by criterion. Call this for the most promising candidates after a search. Each call is expensive — prioritize, and respect the per-run budget the results report.",
    input_schema: {
      type: "object",
      properties: {
        nctId: { type: "string", description: "The trial's NCT identifier, e.g. NCT01234567" },
      },
      required: ["nctId"],
    },
  },
  {
    name: "computeGap",
    description:
      "For a trial already evaluated as NEAR_MISS: reason counterfactually about the concrete path to eligibility (washout timing, a missing test, a different cohort, required prior therapy). Call this for every near-miss before finishing.",
    input_schema: {
      type: "object",
      properties: {
        nctId: { type: "string", description: "The NCT id of a trial with a NEAR_MISS verdict" },
      },
      required: ["nctId"],
    },
  },
  {
    name: "reviewUnknowns",
    description:
      "Review the eligibility criteria that came back UNKNOWN across the trials evaluated so far that are still in play (qualifying or near-miss). Use this after a round of evaluateTrial to find the highest-information-gain question: the single missing patient fact that would resolve UNKNOWN criteria across the most trials. Call it before finishing whenever evaluations produced UNKNOWNs.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "finish",
    description:
      "End the navigation session and present final results. Call when the promising candidates are evaluated and near-misses have gap analyses — or when nothing more useful can be done.",
    input_schema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description:
            "Plain-language wrap-up for the patient: what was found per bucket, suggested next steps, and a reminder that trial sites confirm final eligibility.",
        },
      },
      required: ["message"],
    },
  },
];

export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  state: AgentState,
  emit: (e: AgentEvent) => void,
): Promise<string> {
  switch (name) {
    case "searchTrials":
      return runSearch(input, state, emit);
    case "evaluateTrial":
      return runEvaluate(input, state, emit);
    case "computeGap":
      return runComputeGap(input, state, emit);
    case "reviewUnknowns":
      return runReviewUnknowns(state, emit);
    case "finish": {
      const message = typeof input.message === "string" ? input.message : "Navigation complete.";
      state.done = true;
      state.history.push({ tool: "finish", detail: "" });
      emit({ type: "final", message });
      return "Session finished.";
    }
    default:
      return `Unknown tool: ${name}`;
  }
}

async function runSearch(
  input: Record<string, unknown>,
  state: AgentState,
  emit: (e: AgentEvent) => void,
): Promise<string> {
  const condition = String(input.condition ?? "").trim();
  const intervention =
    typeof input.intervention === "string" && input.intervention.trim()
      ? input.intervention.trim()
      : undefined;
  if (!condition) return "Error: searchTrials requires a condition.";

  emit({
    type: "tool",
    name: "searchTrials",
    detail: `Searching ClinicalTrials.gov for recruiting trials: “${condition}”${intervention ? ` + ${intervention}` : ""}`,
  });

  const found = await ctgovSearch({ condition, intervention, pageSize: 25 });

  const existingIds = new Set(state.candidates.map((t) => t.nctId));
  const newSurvivors: Trial[] = [];
  const excluded: { trial: Trial; verdict: NonNullable<ReturnType<typeof prefilterTrial>> }[] = [];
  const distanceLabels: Record<string, string> = {};
  for (const trial of found) {
    const near = nearestSite(trial, state.profile);
    if (near) distanceLabels[trial.nctId] = `${Math.round(near.km).toLocaleString()} km`;
    const pre = prefilterTrial(trial, state.profile);
    if (pre) {
      excluded.push({ trial, verdict: pre });
      state.verdicts[trial.nctId] = pre;
    } else if (!existingIds.has(trial.nctId)) {
      newSurvivors.push(trial);
      existingIds.add(trial.nctId);
    }
  }
  // Accumulate candidates across searches (dedup by nctId) instead of
  // overwriting — so a trial surfaced by an earlier query isn't lost (and its
  // verdict left unrenderable) when the agent re-searches with a new strategy.
  state.candidates = [...state.candidates, ...newSurvivors];
  state.history.push({
    tool: "searchTrials",
    detail: `${found.length} found, ${newSurvivors.length} new, ${excluded.length} pre-excluded`,
  });

  emit({ type: "candidates", trials: newSurvivors, excluded, distanceLabels });

  const shortlist = state.candidates.slice(0, 14).map((t) => {
    const near = nearestSite(t, state.profile);
    return {
      nctId: t.nctId,
      title: t.briefTitle.slice(0, 110),
      phases: t.phases,
      sex: t.eligibility.sex ?? "ALL",
      ageRange: `${t.eligibility.minimumAgeYears ?? "?"}–${t.eligibility.maximumAgeYears ?? "no max"}`,
      sites: t.locations.length,
      nearestSiteKm: near ? `${Math.round(near.km).toLocaleString()} km` : "unknown",
    };
  });

  return JSON.stringify({
    totalFound: found.length,
    newCandidatesThisSearch: newSurvivors.length,
    totalUniqueCandidates: state.candidates.length,
    preExcludedByCode: excluded.length,
    preExclusionExamples: excluded.slice(0, 3).map((e) => `${e.trial.nctId}: ${e.verdict.summary}`),
    candidates: shortlist,
    note: `${newSurvivors.length} new candidate(s) this search; ${state.candidates.length} unique candidate(s) accumulated across all searches so far (showing top ${shortlist.length}). Evaluate up to ${MAX_EVALUATIONS_PER_RUN} distinct trials — re-evaluating one after you learn a new fact is free.`,
  });
}

async function runEvaluate(
  input: Record<string, unknown>,
  state: AgentState,
  emit: (e: AgentEvent) => void,
): Promise<string> {
  const nctId = String(input.nctId ?? "").trim();
  // Budget is the number of DISTINCT trials reasoned about — re-evaluating a
  // trial you've already seen (e.g. after learning a new fact that resolves an
  // UNKNOWN) does not cost budget, which is what makes the post-search
  // information-gain loop viable.
  const evaluatedIds = new Set(
    state.history.filter((h) => h.tool === "evaluateTrial").map((h) => h.detail.split(" ")[0]),
  );
  const isReeval = evaluatedIds.has(nctId);
  if (!isReeval && evaluatedIds.size >= MAX_EVALUATIONS_PER_RUN) {
    return `Evaluation budget (${MAX_EVALUATIONS_PER_RUN} distinct trials) reached. You can still re-evaluate a trial you've already seen (free — e.g. after an answer resolves an UNKNOWN), call reviewUnknowns, compute gaps for near-misses, or finish.`;
  }
  const trial = state.candidates.find((t) => t.nctId === nctId) ?? (await getTrial(nctId));
  if (!trial) return `Error: trial ${nctId} not found.`;

  emit({ type: "tool", name: "evaluateTrial", detail: `Evaluating ${nctId} — ${trial.briefTitle.slice(0, 80)}` });
  emit({ type: "evaluating", nctId });

  const verdict = await evaluateTrial(trial, state.profile);
  state.verdicts[nctId] = verdict;
  state.history.push({ tool: "evaluateTrial", detail: `${nctId} → ${verdict.status}` });
  emit({ type: "verdict", nctId, verdict });

  const blocking = verdict.criteria
    .filter((c) => c.verdict !== "MET")
    .map((c) => `[${c.verdict}] ${c.text.slice(0, 100)} — ${c.reason}`);
  const unknownCount = verdict.criteria.filter((c) => c.verdict === "UNKNOWN").length;
  return JSON.stringify({
    nctId,
    status: verdict.status,
    summary: verdict.summary,
    blockingCriteria: blocking,
    unknownCriteria: unknownCount,
    distinctTrialsRemaining: MAX_EVALUATIONS_PER_RUN - evaluatedIds.size - (isReeval ? 0 : 1),
    ...(unknownCount > 0
      ? {
          tip: "Some criteria are UNKNOWN — they hinge on a patient fact not yet known. Once you've evaluated your shortlist, call reviewUnknowns to find the one question that resolves the most of these.",
        }
      : {}),
  });
}

async function runComputeGap(
  input: Record<string, unknown>,
  state: AgentState,
  emit: (e: AgentEvent) => void,
): Promise<string> {
  const nctId = String(input.nctId ?? "").trim();
  const verdict = state.verdicts[nctId];
  if (!verdict) return `Error: ${nctId} has not been evaluated yet.`;
  if (verdict.status !== "NEAR_MISS") {
    return `Error: computeGap is only for NEAR_MISS trials; ${nctId} is ${verdict.status}.`;
  }
  const trial = state.candidates.find((t) => t.nctId === nctId) ?? (await getTrial(nctId));
  if (!trial) return `Error: trial ${nctId} not found.`;

  emit({ type: "tool", name: "computeGap", detail: `Working out the path to eligibility for ${nctId}` });

  const path = await computeGap(trial, state.profile, verdict);
  state.nearMissPaths[nctId] = path;
  state.history.push({ tool: "computeGap", detail: nctId });
  emit({ type: "gap", nctId, path });

  return JSON.stringify({ nctId, pathToEligibility: path });
}

// Aggregates UNKNOWN criteria across every still-in-play trial (qualifying or
// near-miss) so the model can pick the single question with the most leverage —
// the post-search, evidence-grounded version of the intake info-gain choice.
// The clustering of varied criterion text into one "missing fact" is left to
// the model; this just hands it a clean, complete picture.
function runReviewUnknowns(state: AgentState, emit: (e: AgentEvent) => void): string {
  const trials = Object.entries(state.verdicts)
    .filter(([, v]) => v.status === "QUALIFIES" || v.status === "NEAR_MISS")
    .map(([nctId, v]) => {
      const title = state.candidates.find((t) => t.nctId === nctId)?.briefTitle.slice(0, 90) ?? nctId;
      const unknowns = v.criteria
        .filter((c) => c.verdict === "UNKNOWN")
        .map((c) => ({ requirement: c.text, missingFact: c.reason, kind: c.kind }));
      return { nctId, title, status: v.status, unknowns };
    })
    .filter((t) => t.unknowns.length > 0);

  const totalUnknownCriteria = trials.reduce((n, t) => n + t.unknowns.length, 0);

  emit({
    type: "tool",
    name: "reviewUnknowns",
    detail:
      trials.length > 0
        ? `Reviewing ${totalUnknownCriteria} open unknown${totalUnknownCriteria === 1 ? "" : "s"} across ${trials.length} in-play trial${trials.length === 1 ? "" : "s"}`
        : "Reviewing open unknowns — none remain in the in-play trials",
  });
  state.history.push({
    tool: "reviewUnknowns",
    detail: `${trials.length} trials, ${totalUnknownCriteria} unknowns`,
  });

  if (trials.length === 0) {
    return JSON.stringify({
      trialsWithUnknowns: 0,
      note: "No unresolved UNKNOWNs in the in-play (qualifying or near-miss) trials. Proceed to computeGap for the near-misses, then finish.",
    });
  }

  return JSON.stringify({
    trialsWithUnknowns: trials.length,
    totalUnknownCriteria,
    trials,
    instruction:
      "Find the SINGLE patient fact that, if known, would resolve UNKNOWN criteria across the most of these trials — that is the highest-information-gain question. If one clearly dominates and the patient could reasonably know it, ask it with askPatient, then re-evaluate the affected trials (re-evaluation is free) so their UNKNOWNs resolve to MET or NOT_MET. If the unknowns are scattered, unanswerable by the patient, or low-impact, skip ahead to gaps and finish instead.",
  });
}

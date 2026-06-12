// The five tools the agent can choose between, and the dispatcher that
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

  const survivors: Trial[] = [];
  const excluded: { trial: Trial; verdict: NonNullable<ReturnType<typeof prefilterTrial>> }[] = [];
  const distanceLabels: Record<string, string> = {};
  for (const trial of found) {
    const near = nearestSite(trial, state.profile);
    if (near) distanceLabels[trial.nctId] = `${Math.round(near.km).toLocaleString()} km`;
    const pre = prefilterTrial(trial, state.profile);
    if (pre) {
      excluded.push({ trial, verdict: pre });
      state.verdicts[trial.nctId] = pre;
    } else {
      survivors.push(trial);
    }
  }
  state.candidates = survivors;
  state.history.push({
    tool: "searchTrials",
    detail: `${found.length} found, ${excluded.length} pre-excluded`,
  });

  emit({ type: "candidates", trials: survivors, excluded, distanceLabels });

  const shortlist = survivors.slice(0, 12).map((t) => ({
    nctId: t.nctId,
    title: t.briefTitle.slice(0, 110),
    phases: t.phases,
    sex: t.eligibility.sex ?? "ALL",
    ageRange: `${t.eligibility.minimumAgeYears ?? "?"}–${t.eligibility.maximumAgeYears ?? "no max"}`,
    sites: t.locations.length,
    nearestSiteKm: distanceLabels[t.nctId] ?? "unknown",
  }));

  return JSON.stringify({
    totalFound: found.length,
    preExcludedByCode: excluded.length,
    preExclusionExamples: excluded.slice(0, 3).map((e) => `${e.trial.nctId}: ${e.verdict.summary}`),
    candidates: shortlist,
    note: `Top ${shortlist.length} of ${survivors.length} candidates shown, in relevance order. Evaluation budget: ${MAX_EVALUATIONS_PER_RUN} per run.`,
  });
}

async function runEvaluate(
  input: Record<string, unknown>,
  state: AgentState,
  emit: (e: AgentEvent) => void,
): Promise<string> {
  const nctId = String(input.nctId ?? "").trim();
  const used = state.history.filter((h) => h.tool === "evaluateTrial").length;
  if (used >= MAX_EVALUATIONS_PER_RUN) {
    return `Evaluation budget (${MAX_EVALUATIONS_PER_RUN}) reached for this run. Compute gaps for near-misses or finish.`;
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
  return JSON.stringify({
    nctId,
    status: verdict.status,
    summary: verdict.summary,
    blockingCriteria: blocking,
    evaluationsRemaining: MAX_EVALUATIONS_PER_RUN - used - 1,
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

// The agent controller loop — the model decides the next move each turn
// (this is what makes it an agent); this loop dispatches the chosen tool,
// records the observation, and repeats until finish() or a pause.

import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, MODEL } from "@/lib/anthropic";
import { AGENT_TOOLS, MAX_EVALUATIONS_PER_RUN, dispatchTool } from "./tools";
import type { AgentEvent } from "./events";
import type { AgentState } from "@/lib/types";

const MAX_TURNS = 24;
const MAX_NUDGES = 2;

export const SYSTEM_PROMPT = `You are a clinical trial navigator agent helping one patient (or their caregiver) find trials they might actually qualify for. You work in turns: each turn, choose exactly ONE tool — the single action with the highest expected value right now.

How to navigate:
1. INTAKE — build the profile through conversation, not a form. Each askPatient call should be THE question whose answer rules the most candidate trials in or out: the condition first (search is impossible without it), then the big discriminators for that condition (key biomarkers/mutation status, stage, prior treatments, age, location). Never re-ask known facts. Usually 1–3 questions before the first search is right; you can ask again after a search when one unknown gates several specific trials — that is often the best question of all.
2. SEARCH — searchTrials when the condition is known. Code pre-filters (sex, age, distance) handle the obvious exclusions for you.
3. EVALUATE — evaluateTrial on the most promising candidates, best first, within the budget of ${MAX_EVALUATIONS_PER_RUN} per run. Stop early if results converge.
4. GAPS — computeGap on every NEAR_MISS before finishing. This is the heart of the product: what specifically would open this trial up.
5. FINISH — one warm, plain-language wrap-up: what looks promising and why, each near-miss path in a sentence, and concrete next steps.

Hard rules:
- This is decision support, not medical advice. Never promise eligibility — trial sites confirm it. Never advise starting or stopping a treatment; frame washout-dependent paths as something to discuss with the care team.
- The profile is updated for you after each askPatient answer (you receive the merged profile and remaining unknowns in the tool result) — trust it; don't re-extract.
- One tool per turn. Keep any visible text brief — the patient sees the questions and the final message, not your working notes.`;

export interface LoopHandles {
  messages: Anthropic.MessageParam[];
  state: AgentState;
  emit: (e: AgentEvent) => void;
}

// Runs until the agent calls finish(), pauses on askPatient, or hits the turn
// budget. On askPatient the "ask" event carries everything needed to resume.
export async function runAgentLoop({ messages, state, emit }: LoopHandles): Promise<void> {
  const client = getAnthropic();
  let nudges = 0;

  for (let turn = 0; turn < MAX_TURNS && !state.done; turn++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive", display: "summarized" },
      system: SYSTEM_PROMPT,
      tools: AGENT_TOOLS,
      messages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        if (event.delta.type === "thinking_delta" && event.delta.thinking) {
          emit({ type: "thinking", delta: event.delta.thinking });
        } else if (event.delta.type === "text_delta" && event.delta.text) {
          emit({ type: "narration", delta: event.delta.text });
        }
      }
    }
    const message = await stream.finalMessage();

    // Echo the full content (thinking blocks included) back on the next turn.
    messages.push({ role: "assistant", content: message.content });

    const toolUses = message.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUses.length === 0) {
      if (++nudges > MAX_NUDGES) {
        emit({
          type: "final",
          message:
            "I wasn't able to take the session further automatically. The results gathered so far are shown — a trial site or your care team can pick it up from here.",
        });
        state.done = true;
        break;
      }
      messages.push({
        role: "user",
        content:
          "Continue by calling exactly one tool. If navigation is complete, call finish with your wrap-up.",
      });
      continue;
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    let paused = false;
    for (const toolUse of toolUses) {
      const input = (toolUse.input ?? {}) as Record<string, unknown>;

      if (toolUse.name === "askPatient") {
        const question = String(input.question ?? "Could you tell me more?");
        state.history.push({ tool: "askPatient", detail: question });
        emit({
          type: "ask",
          question,
          continuation: {
            messages,
            state,
            question,
            pendingToolUseId: toolUse.id,
            completedResults: results,
          },
        });
        paused = true;
        break;
      }

      const result = await dispatchTool(toolUse.name, input, state, emit);
      results.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
      if (state.done) break;
    }

    if (paused || state.done) return;
    messages.push({ role: "user", content: results });
  }

  if (!state.done) {
    emit({
      type: "final",
      message:
        "I reached the reasoning budget for this session. The results gathered so far are shown below.",
    });
    state.done = true;
  }
}

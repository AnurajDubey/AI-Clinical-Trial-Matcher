import type Anthropic from "@anthropic-ai/sdk";
import { runAgentLoop } from "@/lib/agent/controller";
import { applyAnswer } from "@/lib/agent/extractProfile";
import type { AgentEvent, Continuation } from "@/lib/agent/events";
import type { AgentState } from "@/lib/types";

export const maxDuration = 300; // a full navigation run chains several LLM calls

type AgentRequest =
  | { start: { text: string } }
  | { resume: { continuation: Continuation; answer: string } };

const emptyState = (): AgentState => ({
  profile: {},
  unknowns: [],
  candidates: [],
  verdicts: {},
  nearMissPaths: {},
  history: [],
  done: false,
});

export async function POST(req: Request) {
  let body: AgentRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));

      try {
        let messages: Anthropic.MessageParam[];
        let state: AgentState;

        if ("start" in body) {
          const text = body.start.text.trim();
          state = emptyState();
          const applied = await applyAnswer(state.profile, "Initial intake message", text);
          state.profile = applied.profile;
          state.unknowns = applied.unknowns;
          emit({ type: "profile", profile: state.profile, unknowns: state.unknowns });

          messages = [
            {
              role: "user",
              content: `The patient (or their caregiver) wrote:\n"""${text}"""\n\nProfile extracted so far:\n${JSON.stringify(state.profile, null, 2)}\n\nHigh-value fields still unknown: ${state.unknowns.join(", ") || "none"}\n\nBegin navigating — decide your next move.`,
            },
          ];
        } else {
          const { continuation, answer } = body.resume;
          state = continuation.state;
          messages = continuation.messages;

          const applied = await applyAnswer(state.profile, continuation.question, answer);
          state.profile = applied.profile;
          state.unknowns = applied.unknowns;
          emit({ type: "profile", profile: state.profile, unknowns: state.unknowns });

          messages.push({
            role: "user",
            content: [
              ...continuation.completedResults,
              {
                type: "tool_result",
                tool_use_id: continuation.pendingToolUseId,
                content: JSON.stringify({
                  answer,
                  updatedProfile: state.profile,
                  stillUnknown: state.unknowns,
                }),
              },
            ],
          });
        }

        await runAgentLoop({ messages, state, emit });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Agent run failed";
        emit({ type: "error", message });
      } finally {
        emit({ type: "done" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

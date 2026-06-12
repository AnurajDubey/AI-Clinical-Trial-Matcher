// The event stream contract between the agent (server) and the UI. Live runs
// and recorded replays both speak exactly this — that's what lets the UI not
// care which one it's listening to.

import type Anthropic from "@anthropic-ai/sdk";
import type { AgentState, PatientProfile, Trial, TrialVerdict } from "@/lib/types";

// Serialized mid-run snapshot handed to the client when the agent asks a
// question; echoed back verbatim to resume. (Demo trade-off: the client could
// tamper with it — fine here, nothing privileged lives in it.)
export interface Continuation {
  messages: Anthropic.MessageParam[];
  state: AgentState;
  question: string;
  pendingToolUseId: string;
  completedResults: Anthropic.ToolResultBlockParam[];
}

export type AgentEvent =
  | { type: "userMessage"; text: string } // recorded sessions only — the patient's side
  | { type: "thinking"; delta: string }
  | { type: "narration"; delta: string }
  | { type: "tool"; name: string; detail: string }
  | { type: "profile"; profile: PatientProfile; unknowns: string[] }
  | {
      type: "candidates";
      trials: Trial[]; // pre-filter survivors, in CT.gov relevance order
      excluded: { trial: Trial; verdict: TrialVerdict }[];
      distanceLabels: Record<string, string>;
    }
  | { type: "evaluating"; nctId: string }
  | { type: "verdict"; nctId: string; verdict: TrialVerdict }
  | { type: "gap"; nctId: string; path: string }
  | { type: "ask"; question: string; continuation?: Continuation } // continuation absent in recordings
  | { type: "final"; message: string }
  | { type: "error"; message: string }
  | { type: "done" };

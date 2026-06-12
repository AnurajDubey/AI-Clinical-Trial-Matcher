// Event recorder for capturing live runs into replayable session JSON.
// Coalesces streaming deltas and strips continuations (a replay never
// resumes a real agent, so serialized agent state must not leak into the
// committed file).

import type { AgentEvent } from "@/lib/agent/events";
import type { RecordedSession } from "./replay";

export class SessionRecorder {
  private events: AgentEvent[] = [];

  record(event: AgentEvent): void {
    switch (event.type) {
      case "thinking":
      case "narration": {
        const last = this.events[this.events.length - 1];
        if (last && last.type === event.type) {
          last.delta += event.delta;
        } else {
          this.events.push({ type: event.type, delta: event.delta });
        }
        return;
      }
      case "ask":
        // strip the continuation — replay only needs the question
        this.events.push({ type: "ask", question: event.question });
        return;
      case "done":
        return; // replay emits its own terminal event
      default:
        this.events.push(structuredClone(event));
    }
  }

  recordUserMessage(text: string): void {
    this.events.push({ type: "userMessage", text });
  }

  toSession(name: string, description: string): RecordedSession {
    return {
      name,
      description,
      recordedAt: new Date().toISOString(),
      events: [...this.events, { type: "done" }],
    };
  }
}

// LiveRunner — drives a real agent run through /api/agent (real Claude calls,
// real ClinicalTrials.gov). Emits the same AgentEvent stream a replay does,
// so the UI cannot tell the difference.

import type { AgentEvent, Continuation } from "@/lib/agent/events";

export class LiveRunner {
  private continuation: Continuation | null = null;

  constructor(private readonly onEvent: (e: AgentEvent) => void) {}

  async start(text: string): Promise<void> {
    await this.run({ start: { text } });
  }

  async answer(text: string): Promise<void> {
    if (!this.continuation) {
      this.onEvent({ type: "error", message: "No pending question to answer." });
      return;
    }
    const continuation = this.continuation;
    this.continuation = null;
    await this.run({ resume: { continuation, answer: text } });
  }

  private async run(payload: unknown): Promise<void> {
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.body) {
        let message = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          message = data.error ?? message;
        } catch {
          // not JSON — keep the status line
        }
        throw new Error(message);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith("data: ")) continue;
          const event = JSON.parse(line.slice(6)) as AgentEvent;
          if (event.type === "ask") this.continuation = event.continuation ?? null;
          this.onEvent(event);
        }
      }
    } catch (err) {
      this.onEvent({
        type: "error",
        message: err instanceof Error ? err.message : "Agent run failed",
      });
      this.onEvent({ type: "done" });
    }
  }
}

// ReplayRunner — re-emits a recorded session's events with streaming pacing.
// No API key, no server, no live calls; deterministic. The public demo runs
// on this.

import type { AgentEvent } from "@/lib/agent/events";

export interface RecordedSession {
  name: string;
  description: string;
  recordedAt: string;
  events: AgentEvent[];
}

export interface SessionManifestEntry {
  file: string;
  name: string;
  description: string;
}

export interface ReplayHandle {
  stop: () => void;
}

const THINKING_CHUNK = 24; // chars per tick — fast enough to feel live, slow enough to read

export function replaySession(
  session: RecordedSession,
  onEvent: (e: AgentEvent) => void,
): ReplayHandle {
  let cancelled = false;
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  void (async () => {
    for (const event of session.events) {
      if (cancelled) return;
      switch (event.type) {
        case "userMessage":
          await sleep(900); // the recorded patient "typing"
          break;
        case "thinking":
        case "narration": {
          // re-chunk the coalesced delta so the trace streams like a live run
          const { delta } = event;
          for (let i = 0; i < delta.length; i += THINKING_CHUNK) {
            if (cancelled) return;
            onEvent({ type: event.type, delta: delta.slice(i, i + THINKING_CHUNK) });
            await sleep(16);
          }
          continue;
        }
        case "tool":
          await sleep(500);
          break;
        case "ask":
        case "final":
          await sleep(400);
          break;
        case "candidates":
        case "verdict":
        case "gap":
          await sleep(250);
          break;
        default:
          break;
      }
      if (cancelled) return;
      onEvent(event);
    }
  })();

  return { stop: () => (cancelled = true) };
}

export async function fetchSessionManifest(): Promise<SessionManifestEntry[]> {
  try {
    const res = await fetch("/sessions/index.json");
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function fetchSession(file: string): Promise<RecordedSession> {
  const res = await fetch(`/sessions/${file}`);
  if (!res.ok) throw new Error(`Could not load recorded session: ${file}`);
  return res.json();
}

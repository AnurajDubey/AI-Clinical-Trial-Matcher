"use client";

import { useRef, useState } from "react";
import type { PatientProfile } from "@/lib/types";
import type { AgentEvent, Continuation } from "@/lib/agent/events";
import { ChatPanel, type ChatMessage } from "@/components/ChatPanel";
import { TracePanel, type TraceItem } from "@/components/TracePanel";
import { ProfileCard } from "@/components/ProfileCard";
import { ResultsView, type MatchResults } from "@/components/ResultsView";

const emptyResults = (): MatchResults => ({
  trials: [],
  verdicts: {},
  nearMissPaths: {},
  pendingIds: new Set(),
  gapPendingIds: new Set(),
  errors: {},
  unreviewed: [],
});

type Mode = "start" | "running" | "awaiting" | "done" | "error";

export default function Home() {
  const [mode, setMode] = useState<Mode>("start");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [trace, setTrace] = useState<TraceItem[]>([]);
  const [profile, setProfile] = useState<PatientProfile>({});
  const [unknowns, setUnknowns] = useState<string[]>([]);
  const [results, setResults] = useState<MatchResults | null>(null);
  const [distanceLabels, setDistanceLabels] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const continuationRef = useRef<Continuation | null>(null);

  function appendTrace(kind: TraceItem["kind"], text: string) {
    setTrace((prev) => {
      // streaming deltas accumulate into the trailing item of the same kind
      if (kind !== "tool" && prev.length > 0 && prev[prev.length - 1].kind === kind) {
        const next = [...prev];
        next[next.length - 1] = { kind, text: next[next.length - 1].text + text };
        return next;
      }
      return [...prev, { kind, text }];
    });
  }

  function mutateResults(mutate: (r: MatchResults) => void) {
    setResults((prev) => {
      const next: MatchResults = prev
        ? {
            ...prev,
            verdicts: { ...prev.verdicts },
            nearMissPaths: { ...prev.nearMissPaths },
            pendingIds: new Set(prev.pendingIds),
            gapPendingIds: new Set(prev.gapPendingIds),
            errors: { ...prev.errors },
          }
        : emptyResults();
      mutate(next);
      return next;
    });
  }

  function handleEvent(event: AgentEvent) {
    switch (event.type) {
      case "thinking":
        appendTrace("thinking", event.delta);
        break;
      case "narration":
        appendTrace("narration", event.delta);
        break;
      case "tool":
        appendTrace("tool", event.detail);
        break;
      case "profile":
        setProfile(event.profile);
        setUnknowns(event.unknowns);
        break;
      case "candidates": {
        const excludedTrials = event.excluded.map((e) => e.trial);
        setDistanceLabels(event.distanceLabels);
        mutateResults((r) => {
          r.trials = [...event.trials, ...excludedTrials];
          for (const { trial, verdict } of event.excluded) r.verdicts[trial.nctId] = verdict;
        });
        break;
      }
      case "evaluating":
        mutateResults((r) => r.pendingIds.add(event.nctId));
        break;
      case "verdict":
        mutateResults((r) => {
          r.pendingIds.delete(event.nctId);
          r.verdicts[event.nctId] = event.verdict;
        });
        break;
      case "gap":
        mutateResults((r) => {
          r.nearMissPaths[event.nctId] = event.path;
        });
        break;
      case "ask":
        continuationRef.current = event.continuation;
        setChat((prev) => [...prev, { role: "agent", text: event.question }]);
        setMode("awaiting");
        break;
      case "final":
        setChat((prev) => [...prev, { role: "agent", text: event.message }]);
        setMode("done");
        break;
      case "error":
        setError(event.message);
        setMode("error");
        break;
      case "done":
        setMode((m) => (m === "running" ? "done" : m));
        break;
    }
  }

  async function consumeStream(res: Response) {
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
        handleEvent(JSON.parse(line.slice(6)) as AgentEvent);
      }
    }
  }

  async function send(text: string) {
    const isStart = mode === "start";
    setChat((prev) => [...prev, { role: "user", text }]);
    setMode("running");
    setError(null);

    const payload = isStart
      ? { start: { text } }
      : { resume: { continuation: continuationRef.current, answer: text } };
    continuationRef.current = null;

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await consumeStream(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agent run failed");
      setMode("error");
    }
  }

  function reset() {
    setMode("start");
    setChat([]);
    setTrace([]);
    setProfile({});
    setUnknowns([]);
    setResults(null);
    setDistanceLabels({});
    setError(null);
    continuationRef.current = null;
  }

  const canSend = mode === "start" || mode === "awaiting";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-baseline justify-between px-6 py-4">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">
              Clinical Trial Navigator
            </h1>
            <p className="hidden text-sm text-slate-500 sm:block">
              An agent that reasons about eligibility — not a search box.
            </p>
          </div>
          {mode !== "start" && (
            <button
              type="button"
              onClick={reset}
              className="text-xs font-medium text-slate-400 transition hover:text-slate-600"
            >
              Start over
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px,1fr]">
          <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <ChatPanel
              messages={chat}
              onSend={send}
              canSend={canSend}
              running={mode === "running"}
            />
            <ProfileCard profile={profile} unknowns={unknowns} />
          </div>

          <div className="min-w-0 space-y-4">
            {error && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {error}
              </p>
            )}
            <TracePanel items={trace} live={mode === "running"} />
            {results && (
              <ResultsView
                results={results}
                distanceLabels={distanceLabels}
                onRetry={() => {}}
              />
            )}
            {!results && mode === "start" && (
              <div className="rounded-xl border border-dashed border-slate-200 px-6 py-16 text-center">
                <p className="text-sm font-medium text-slate-500">
                  Matched trials will appear here
                </p>
                <p className="mx-auto mt-2 max-w-md text-xs text-slate-400">
                  The navigator interviews you, searches live ClinicalTrials.gov data, reasons
                  through each trial&apos;s criteria, and — for near misses — works out what would
                  change the answer.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <p className="mx-auto w-full max-w-6xl px-6 py-3 text-xs text-slate-400">
          Decision-support only — not medical advice. Trial eligibility is always confirmed by
          the trial site and your care team.
        </p>
      </footer>
    </div>
  );
}

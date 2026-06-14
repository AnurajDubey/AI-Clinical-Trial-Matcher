"use client";

import { useEffect, useRef, useState } from "react";
import type { PatientProfile } from "@/lib/types";
import type { AgentEvent } from "@/lib/agent/events";
import { LiveRunner } from "@/lib/runner/live";
import {
  fetchSession,
  fetchSessionManifest,
  replaySession,
  type ReplayHandle,
  type SessionManifestEntry,
} from "@/lib/runner/replay";
import { ChatPanel, type ChatMessage } from "@/components/ChatPanel";
import { TracePanel, type TraceItem } from "@/components/TracePanel";
import { ProfileCard } from "@/components/ProfileCard";
import { ReplayPicker } from "@/components/ReplayPicker";
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
  const [replaying, setReplaying] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [trace, setTrace] = useState<TraceItem[]>([]);
  const [profile, setProfile] = useState<PatientProfile>({});
  const [unknowns, setUnknowns] = useState<string[]>([]);
  const [results, setResults] = useState<MatchResults | null>(null);
  const [distanceLabels, setDistanceLabels] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionManifestEntry[]>([]);
  const liveRef = useRef<LiveRunner | null>(null);
  const replayRef = useRef<ReplayHandle | null>(null);

  useEffect(() => {
    void fetchSessionManifest().then(setSessions);
  }, []);

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

  // Both runners emit the same events — the UI can't tell live from replay.
  function handleEvent(event: AgentEvent) {
    switch (event.type) {
      case "userMessage":
        setChat((prev) => [...prev, { role: "user", text: event.text }]);
        setMode("running");
        break;
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
        setDistanceLabels((prev) => ({ ...prev, ...event.distanceLabels }));
        mutateResults((r) => {
          // Merge across searches (dedup by nctId) so earlier results persist.
          const seen = new Set(r.trials.map((t) => t.nctId));
          const merged = [...r.trials];
          for (const t of [...event.trials, ...excludedTrials]) {
            if (!seen.has(t.nctId)) {
              merged.push(t);
              seen.add(t.nctId);
            }
          }
          r.trials = merged;
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

  function send(text: string) {
    setError(null);
    setChat((prev) => [...prev, { role: "user", text }]);
    if (mode === "start") {
      liveRef.current = new LiveRunner(handleEvent);
      setMode("running");
      void liveRef.current.start(text);
    } else if (mode === "awaiting" && liveRef.current) {
      setMode("running");
      void liveRef.current.answer(text);
    }
  }

  async function playSession(entry: SessionManifestEntry) {
    reset();
    try {
      const session = await fetchSession(entry.file);
      setReplaying(true);
      setMode("running");
      replayRef.current = replaySession(session, handleEvent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load session");
      setMode("error");
    }
  }

  function reset() {
    replayRef.current?.stop();
    replayRef.current = null;
    liveRef.current = null;
    setReplaying(false);
    setMode("start");
    setChat([]);
    setTrace([]);
    setProfile({});
    setUnknowns([]);
    setResults(null);
    setDistanceLabels({});
    setError(null);
  }

  const canSend = !replaying && (mode === "start" || mode === "awaiting");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-teal-500 via-emerald-500 to-emerald-600 text-white shadow-glow">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <circle cx="12" cy="12" r="10" />
                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88" fill="currentColor" stroke="none" />
              </svg>
            </span>
            <div className="leading-tight">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                Clinical Trial Navigator
              </h1>
              <p className="hidden text-sm text-slate-500 sm:block">
                An agent that reasons about eligibility — not a search box.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-[11px] font-medium text-slate-500 md:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live ClinicalTrials.gov data
            </span>
            {mode !== "start" && (
              <button
                type="button"
                onClick={reset}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
              >
                Start over
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
          <div className="min-w-0 space-y-4">
            {replaying && (
              <div className="flex items-center gap-2 rounded-xl border border-violet-200/70 bg-violet-50/80 px-4 py-2.5 text-xs font-medium text-violet-800 shadow-sm backdrop-blur-sm">
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span>Replaying a recorded session — deterministic, no live API calls.</span>
                <button
                  type="button"
                  onClick={reset}
                  className="ml-auto shrink-0 rounded-full bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-violet-700"
                >
                  Stop
                </button>
              </div>
            )}
            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-sm">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mt-0.5 h-4 w-4 shrink-0"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4" />
                  <path d="M12 16h.01" />
                </svg>
                <span>{error}</span>
              </div>
            )}
            <TracePanel items={trace} live={mode === "running"} />
            {results && (
              <ResultsView results={results} distanceLabels={distanceLabels} onRetry={() => {}} />
            )}
            {!results && mode === "start" && (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300/80 bg-white/50 px-6 py-20 text-center">
                <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-teal-100 to-emerald-100 text-teal-600">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-6 w-6"
                  >
                    <rect x="8" y="2" width="8" height="4" rx="1" />
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <path d="M9 12h6" />
                    <path d="M9 16h4" />
                  </svg>
                </span>
                <p className="text-sm font-semibold text-slate-700">Matched trials will appear here</p>
                <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-400">
                  The navigator interviews you, searches live ClinicalTrials.gov data, reasons
                  through each trial&apos;s criteria, and — for near misses — works out what would
                  change the answer.
                </p>
              </div>
            )}
          </div>

          <div className="scrollbar-slim min-w-0 space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6.5rem)] lg:self-start lg:overflow-y-auto lg:pr-0.5">
            <ChatPanel
              messages={chat}
              onSend={send}
              canSend={canSend}
              running={mode === "running" && !replaying}
            />
            <ProfileCard profile={profile} unknowns={unknowns} />
            {mode === "start" && (
              <ReplayPicker sessions={sessions} onPlay={playSession} disabled={false} />
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200/70 bg-white/60 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-[1600px] items-center gap-2 px-6 py-3 text-xs text-slate-400">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5 shrink-0"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          <p>
            Decision-support only — not medical advice. Trial eligibility is always confirmed by the
            trial site and your care team.
          </p>
        </div>
      </footer>
    </div>
  );
}

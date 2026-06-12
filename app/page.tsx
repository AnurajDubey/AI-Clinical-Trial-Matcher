"use client";

import { useRef, useState } from "react";
import type { PatientProfile, Trial, TrialVerdict } from "@/lib/types";
import { prefilterTrial, nearestSite } from "@/lib/prefilter";
import { ResultsView, type MatchResults } from "@/components/ResultsView";
import {
  EMPTY_FORM,
  PatientForm,
  profileFromFormState,
  type PatientFormState,
} from "@/components/PatientForm";

// Per-run LLM budget: only the top survivors of the code pre-filter get a
// full criterion-by-criterion evaluation.
const MAX_LLM_EVALUATIONS = 8;
const EVAL_CONCURRENCY = 3;

const emptyResults = (): MatchResults => ({
  trials: [],
  verdicts: {},
  nearMissPaths: {},
  pendingIds: new Set(),
  gapPendingIds: new Set(),
  errors: {},
  unreviewed: [],
});

export default function Home() {
  const [form, setForm] = useState<PatientFormState>(EMPTY_FORM);
  const [phase, setPhase] = useState<"idle" | "searching" | "evaluating" | "done">("idle");
  const [results, setResults] = useState<MatchResults | null>(null);
  const [distanceLabels, setDistanceLabels] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef(0);

  function update(run: number, mutate: (r: MatchResults) => void) {
    if (runRef.current !== run) return;
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

  async function evaluateOne(run: number, trial: Trial, profile: PatientProfile) {
    update(run, (r) => {
      r.pendingIds.add(trial.nctId);
      delete r.errors[trial.nctId];
    });
    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nctId: trial.nctId, profile }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const verdict: TrialVerdict = data.verdict;
      update(run, (r) => {
        r.pendingIds.delete(trial.nctId);
        r.verdicts[trial.nctId] = verdict;
      });
      // Differentiator #1: near-misses get counterfactual gap reasoning.
      if (verdict.status === "NEAR_MISS") {
        await computeGapFor(run, trial, profile, verdict);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Evaluation failed";
      update(run, (r) => {
        r.pendingIds.delete(trial.nctId);
        r.errors[trial.nctId] = message;
      });
      if (message.includes("ANTHROPIC_API_KEY")) throw err; // abort the pool — every call will fail
    }
  }

  async function computeGapFor(
    run: number,
    trial: Trial,
    profile: PatientProfile,
    verdict: TrialVerdict,
  ) {
    update(run, (r) => r.gapPendingIds.add(trial.nctId));
    try {
      const res = await fetch("/api/gap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nctId: trial.nctId, profile, verdict }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      update(run, (r) => {
        r.gapPendingIds.delete(trial.nctId);
        r.nearMissPaths[trial.nctId] = data.path;
      });
    } catch (err) {
      // Gap analysis is additive — the verdict still stands without it.
      console.error(`Gap analysis failed for ${trial.nctId}`, err);
      update(run, (r) => r.gapPendingIds.delete(trial.nctId));
    }
  }

  async function findTrials(e: React.FormEvent) {
    e.preventDefault();
    const condition = form.condition.trim();
    if (!condition || phase === "searching" || phase === "evaluating") return;
    const run = ++runRef.current;
    const profile = profileFromFormState(form);

    setPhase("searching");
    setError(null);
    setResults(null);

    let trials: Trial[];
    try {
      const res = await fetch(`/api/trials?cond=${encodeURIComponent(condition)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      trials = data.trials;
    } catch (err) {
      if (runRef.current === run) {
        setError(err instanceof Error ? err.message : "Search failed");
        setPhase("idle");
      }
      return;
    }
    if (runRef.current !== run) return;

    // Code pre-filter: structured fields rule trials out before any LLM call.
    const verdicts: Record<string, TrialVerdict> = {};
    const survivors: Trial[] = [];
    const labels: Record<string, string> = {};
    for (const t of trials) {
      const near = nearestSite(t, profile);
      if (near) labels[t.nctId] = `${Math.round(near.km).toLocaleString()} km`;
      const pre = prefilterTrial(t, profile);
      if (pre) verdicts[t.nctId] = pre;
      else survivors.push(t);
    }
    const toEvaluate = survivors.slice(0, MAX_LLM_EVALUATIONS);
    const unreviewed = survivors.slice(MAX_LLM_EVALUATIONS);

    setDistanceLabels(labels);
    setResults({
      trials: [...toEvaluate, ...trials.filter((t) => verdicts[t.nctId])],
      verdicts,
      nearMissPaths: {},
      pendingIds: new Set(),
      gapPendingIds: new Set(),
      errors: {},
      unreviewed,
    });
    setPhase("evaluating");

    // Bounded-concurrency evaluation pool; a missing-API-key error aborts the run.
    const queue = [...toEvaluate];
    let aborted = false;
    const workers = Array.from({ length: EVAL_CONCURRENCY }, async () => {
      while (queue.length > 0 && !aborted && runRef.current === run) {
        const trial = queue.shift()!;
        try {
          await evaluateOne(run, trial, profile);
        } catch {
          aborted = true;
          if (runRef.current === run) {
            setError(
              "Claude is not configured: add ANTHROPIC_API_KEY to .env.local to enable eligibility reasoning. Search and pre-filtering still work.",
            );
          }
        }
      }
    });
    await Promise.all(workers);
    if (runRef.current === run) setPhase("done");
  }

  function retry(nctId: string) {
    const trial = results?.trials.find((t) => t.nctId === nctId);
    if (!trial) return;
    void evaluateOne(runRef.current, trial, profileFromFormState(form)).catch(() => {});
  }

  const busy = phase === "searching" || phase === "evaluating";
  const evaluatedCount = results
    ? Object.keys(results.verdicts).length + Object.keys(results.errors).length
    : 0;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-4xl items-baseline gap-3 px-6 py-4">
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">
            Clinical Trial Navigator
          </h1>
          <p className="text-sm text-slate-500">
            Recruiting trials from ClinicalTrials.gov, reasoned over — not just searched.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-6 py-8">
        <PatientForm state={form} onChange={setForm} />

        <form onSubmit={findTrials} className="flex items-center justify-end gap-3">
          {phase === "evaluating" && results && (
            <p className="text-xs text-slate-500">
              Evaluating eligibility… {Math.min(evaluatedCount, results.trials.length)} done
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !form.condition.trim()}
            className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {phase === "searching"
              ? "Searching…"
              : phase === "evaluating"
                ? "Matching…"
                : "Find trials"}
          </button>
        </form>

        {error && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </p>
        )}

        {phase === "searching" && (
          <p className="text-sm text-slate-500">Querying ClinicalTrials.gov…</p>
        )}

        {results && (
          <ResultsView results={results} distanceLabels={distanceLabels} onRetry={retry} />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <p className="mx-auto w-full max-w-4xl px-6 py-3 text-xs text-slate-400">
          Decision-support only — not medical advice. Trial eligibility is always confirmed by
          the trial site and your care team.
        </p>
      </footer>
    </div>
  );
}

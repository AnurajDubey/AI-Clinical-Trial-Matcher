"use client";

import { useState } from "react";
import type { Trial } from "@/lib/types";
import { TrialCard } from "@/components/TrialCard";

export default function Home() {
  const [condition, setCondition] = useState("");
  const [trials, setTrials] = useState<Trial[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!condition.trim() || loading) return;
    setLoading(true);
    setError(null);
    setTrials(null);
    try {
      const res = await fetch(`/api/trials?cond=${encodeURIComponent(condition.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setTrials(data.trials);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

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

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
        <form onSubmit={search} className="flex gap-3">
          <input
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            placeholder="Condition, e.g. metastatic breast cancer"
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
          <button
            type="submit"
            disabled={loading || !condition.trim()}
            className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Searching…" : "Search trials"}
          </button>
        </form>

        <div className="mt-8">
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}
          {loading && (
            <p className="text-sm text-slate-500">Querying ClinicalTrials.gov…</p>
          )}
          {trials && (
            <>
              <p className="mb-4 text-sm text-slate-500">
                {trials.length} recruiting {trials.length === 1 ? "trial" : "trials"} found
              </p>
              <ul className="space-y-4">
                {trials.map((t) => (
                  <li key={t.nctId}>
                    <TrialCard trial={t} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
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

import type { SessionManifestEntry } from "@/lib/runner/replay";

export function ReplayPicker({
  sessions,
  onPlay,
  disabled,
}: {
  sessions: SessionManifestEntry[];
  onPlay: (entry: SessionManifestEntry) => void;
  disabled: boolean;
}) {
  if (sessions.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Watch a recorded session
      </h2>
      <p className="mt-1 text-[11px] text-slate-400">
        Real sessions, replayed deterministically — no API calls, no key needed.
      </p>
      <ul className="mt-3 space-y-2">
        {sessions.map((s) => (
          <li key={s.file}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPlay(s)}
              className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs transition hover:border-sky-300 hover:bg-sky-50 disabled:opacity-50"
            >
              <span className="font-semibold text-slate-700">▶ {s.name}</span>
              <span className="mt-0.5 block text-slate-500">{s.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

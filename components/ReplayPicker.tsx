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
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-glow">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
        <div className="leading-tight">
          <h2 className="text-sm font-semibold text-slate-900">Try a demo</h2>
          <p className="text-[11px] text-slate-400">
            Recorded sessions, replayed — deterministic, no API key needed.
          </p>
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {sessions.map((s) => (
          <li key={s.file}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPlay(s)}
              className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-teal-300 hover:bg-teal-50/50 hover:shadow-sm disabled:opacity-50"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-sm transition group-hover:scale-105">
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-slate-700">{s.name}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
                  {s.description}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

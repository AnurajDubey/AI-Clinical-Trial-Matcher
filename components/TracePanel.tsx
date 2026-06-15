"use client";

import { useEffect, useRef } from "react";

export interface TraceItem {
  kind: "thinking" | "narration" | "tool" | "agent";
  text: string;
  scope?: "analyst"; // sub-agent lane — rendered indented under the navigator
}

const KIND_STYLES: Record<"thinking" | "narration" | "tool", { label: string; cls: string; tag: string }> = {
  thinking: { label: "think", cls: "text-slate-500 italic", tag: "text-slate-400" },
  narration: { label: "agent", cls: "text-slate-700", tag: "text-teal-500" },
  tool: { label: "action", cls: "font-medium text-teal-700", tag: "text-emerald-500" },
};

export function TracePanel({ items, live }: { items: TraceItem[]; live: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only pin to the latest line while streaming; once settled the trace
    // expands inline and scrolls with the page instead of within itself.
    if (live) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [items, live]);

  if (items.length === 0 && !live) return null;

  return (
    <details open className="group overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
      <summary className="flex cursor-pointer select-none items-center gap-2 border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/60 px-4 py-3">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-90"
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
        <span className="text-sm font-semibold text-slate-900">Agent reasoning trace</span>
        {live ? (
          <span className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-teal-500" />
            </span>
            live
          </span>
        ) : (
          <span className="ml-1 text-xs text-slate-400">{items.length} steps</span>
        )}
      </summary>
      <div
        ref={scrollRef}
        className={`scrollbar-slim space-y-2.5 px-4 py-3.5 ${live ? "max-h-72 overflow-y-auto" : ""}`}
      >
        {items.map((item, i) => {
          if (item.kind === "agent") {
            // Sub-agent header — opens a nested lane in the trace.
            return (
              <div
                key={i}
                className="mt-1 flex animate-rise items-center gap-1.5 text-[11px] font-semibold text-teal-700"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5 shrink-0"
                >
                  <path d="M9 3v6l-5 9a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-9V3" />
                  <path d="M8 3h8" />
                </svg>
                {item.text}
              </div>
            );
          }
          const style = KIND_STYLES[item.kind];
          const indented = item.scope === "analyst";
          return (
            <div
              key={i}
              className={`flex animate-rise gap-3 text-xs ${indented ? "ml-2 border-l-2 border-teal-100 pl-3" : ""}`}
            >
              <span
                className={`mt-0.5 w-12 shrink-0 text-right font-mono text-[10px] uppercase tracking-wider ${style.tag}`}
              >
                {style.label}
              </span>
              <p className={`min-w-0 flex-1 whitespace-pre-wrap leading-relaxed ${style.cls}`}>
                {item.text}
              </p>
            </div>
          );
        })}
        {live && items.length === 0 && <p className="text-xs text-slate-400">Starting…</p>}
      </div>
    </details>
  );
}

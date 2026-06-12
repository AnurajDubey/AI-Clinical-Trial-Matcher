"use client";

import { useEffect, useRef } from "react";

export interface TraceItem {
  kind: "thinking" | "narration" | "tool";
  text: string;
}

const KIND_STYLES: Record<TraceItem["kind"], { label: string; cls: string }> = {
  thinking: { label: "reasoning", cls: "text-slate-500 italic" },
  narration: { label: "agent", cls: "text-slate-700" },
  tool: { label: "action", cls: "text-sky-700 font-medium" },
};

export function TracePanel({ items, live }: { items: TraceItem[]; live: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [items]);

  if (items.length === 0 && !live) return null;

  return (
    <details open className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <summary className="cursor-pointer select-none border-b border-slate-100 px-4 py-3">
        <span className="text-sm font-semibold text-slate-900">Agent reasoning trace</span>
        <span className="ml-2 text-xs text-slate-400">
          {live ? "live — the agent decides each move" : `${items.length} steps`}
        </span>
      </summary>
      <div ref={scrollRef} className="max-h-64 space-y-2 overflow-y-auto px-4 py-3">
        {items.map((item, i) => {
          const style = KIND_STYLES[item.kind];
          return (
            <div key={i} className="flex gap-2 text-xs">
              <span className="mt-0.5 w-16 shrink-0 text-right font-mono uppercase tracking-wide text-slate-300">
                {style.label}
              </span>
              <p className={`min-w-0 whitespace-pre-wrap ${style.cls}`}>{item.text}</p>
            </div>
          );
        })}
        {live && items.length === 0 && <p className="text-xs text-slate-400">Starting…</p>}
      </div>
    </details>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { EXAMPLE_INTAKES } from "@/lib/patients";

export interface ChatMessage {
  role: "agent" | "user";
  text: string;
}

export function ChatPanel({
  messages,
  onSend,
  canSend,
  running,
}: {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  canSend: boolean;
  running: boolean;
}) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, running]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !canSend) return;
    setDraft("");
    onSend(text);
  }

  return (
    <div className="flex h-[36rem] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
      <div className="flex items-center gap-2.5 border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/60 px-4 py-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-glow">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M12 2.5l1.9 5.1 5.1 1.9-5.1 1.9L12 16.5l-1.9-5.1L5 9.5l5.1-1.9z" />
          </svg>
        </span>
        <div className="leading-tight">
          <h2 className="text-sm font-semibold text-slate-900">Intake conversation</h2>
          <p className="text-[11px] text-slate-400">The navigator asks only what changes the answer.</p>
        </div>
      </div>

      <div ref={scrollRef} className="scrollbar-slim flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-2.5">
            <p className="text-xs text-slate-400">
              Describe the situation in your own words, or start from an example:
            </p>
            {EXAMPLE_INTAKES.map((ex) => (
              <button
                key={ex.name}
                type="button"
                onClick={() => canSend && onSend(ex.text)}
                className="group block w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-teal-300 hover:bg-teal-50/50 hover:shadow-sm"
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3.5 w-3.5 text-teal-500"
                  >
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                  </svg>
                  {ex.name}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-500">{ex.text}</span>
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-teal-500 to-teal-600 px-3.5 py-2 text-sm text-white shadow-sm"
                  : "max-w-[85%] whitespace-pre-line rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-700 shadow-sm"
              }
            >
              {m.text}
            </div>
          </div>
        ))}

        {running && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-400 shadow-sm">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-400 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-400 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-400" />
              </span>
              navigating…
            </div>
          </div>
        )}
      </div>

      <form onSubmit={submit} className="border-t border-slate-100 bg-white p-3">
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={canSend ? "Type your message…" : "Waiting for the navigator…"}
            disabled={!canSend}
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-teal-100 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!canSend || !draft.trim()}
            aria-label="Send message"
            className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-sm transition hover:from-teal-600 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[18px] w-[18px]"
            >
              <path d="M22 2 11 13" />
              <path d="M22 2 15 22 11 13 2 9z" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}

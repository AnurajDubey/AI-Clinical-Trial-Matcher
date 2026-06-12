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
    <div className="flex h-[36rem] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Intake conversation</h2>
        <p className="text-xs text-slate-400">
          Tell us about the patient — the navigator asks only what changes the answer.
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Describe the situation in your own words, or start from an example:
            </p>
            {EXAMPLE_INTAKES.map((ex) => (
              <button
                key={ex.name}
                type="button"
                onClick={() => canSend && onSend(ex.text)}
                className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-600 transition hover:border-sky-300 hover:bg-sky-50"
              >
                <span className="font-semibold text-slate-700">{ex.name}</span> — {ex.text}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-sm bg-sky-600 px-3.5 py-2 text-sm text-white"
                  : "max-w-[85%] whitespace-pre-line rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-2 text-sm text-slate-800"
              }
            >
              {m.text}
            </div>
          </div>
        ))}

        {running && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-2 text-sm text-slate-400">
              <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent align-middle" />
              navigating…
            </div>
          </div>
        )}
      </div>

      <form onSubmit={submit} className="border-t border-slate-100 p-3">
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={canSend ? "Type your message…" : "Waiting for the navigator…"}
            disabled={!canSend}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50"
          />
          <button
            type="submit"
            disabled={!canSend || !draft.trim()}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

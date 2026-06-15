// Prompt caching for the agent loops. Marks the stable request prefix (system +
// tools) and a rolling transcript breakpoint with `cache_control`, returning
// cache-annotated COPIES so the caller's stored messages stay clean (they're
// echoed back each turn and serialized into the continuation).
//
// Caching is a billing/latency optimization ONLY: the model receives the
// identical prompt, so outputs, reasoning, and behavior are unchanged. A
// misplaced breakpoint costs savings (a cache miss), never correctness.

import type Anthropic from "@anthropic-ai/sdk";

const EPHEMERAL: Anthropic.CacheControlEphemeral = { type: "ephemeral" };

type ContentBlock = Exclude<Anthropic.MessageParam["content"], string>[number];

export interface CachedRequest {
  system: Anthropic.TextBlockParam[];
  tools: Anthropic.Tool[];
  messages: Anthropic.MessageParam[];
}

export function withCache(
  system: string,
  tools: Anthropic.Tool[],
  messages: Anthropic.MessageParam[],
): CachedRequest {
  // (1) system as a single cached text block — stable across every turn / every
  // analyst invocation.
  const cachedSystem: Anthropic.TextBlockParam[] = [
    { type: "text", text: system, cache_control: EPHEMERAL },
  ];

  // (2) cache the whole tools block by marking the last tool.
  const cachedTools = tools.map((tool, i) =>
    i === tools.length - 1 ? { ...tool, cache_control: EPHEMERAL } : tool,
  );

  // (3) rolling breakpoint on the last block of the last message → the growing
  // transcript prefix is cached and reused incrementally. The last message in
  // both agent loops is always a `user` message (initial text, a nudge, or
  // tool_results), so this never touches assistant thinking blocks (which the
  // API requires be replayed unmodified).
  const cachedMessages = messages.map((m, i): Anthropic.MessageParam => {
    if (i !== messages.length - 1) return m;
    if (typeof m.content === "string") {
      return {
        ...m,
        content: [
          { type: "text", text: m.content, cache_control: EPHEMERAL } satisfies Anthropic.TextBlockParam,
        ],
      };
    }
    if (m.content.length === 0) return m;
    const blocks: ContentBlock[] = m.content.map((b, j) =>
      j === m.content.length - 1 ? ({ ...b, cache_control: EPHEMERAL } as ContentBlock) : b,
    );
    return { ...m, content: blocks };
  });

  return { system: cachedSystem, tools: cachedTools, messages: cachedMessages };
}

// One concise line per model call — lets a live/record run show the cache
// warming (reads climbing, fresh tokens dropping). Dev/record only.
export function logCacheUsage(label: string, usage: Anthropic.Usage): void {
  if (process.env.NODE_ENV === "production") return;
  const read = usage.cache_read_input_tokens ?? 0;
  const write = usage.cache_creation_input_tokens ?? 0;
  console.log(
    `[cache:${label}] read=${read} write=${write} fresh=${usage.input_tokens} out=${usage.output_tokens}`,
  );
}

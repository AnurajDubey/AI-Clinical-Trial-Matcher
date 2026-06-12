import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-4-8";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local to enable live evaluation.",
    );
  }
  client ??= new Anthropic();
  return client;
}

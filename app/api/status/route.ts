import { NextResponse } from "next/server";

// Reports whether live mode is available in this deployment — i.e. whether an
// Anthropic key is configured server-side. The key itself is never sent to the
// client; only this boolean. The key-less public demo uses it to fall back to
// replay-only and swap the live chat input for a fork-and-add-a-key notice.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ liveEnabled: Boolean(process.env.ANTHROPIC_API_KEY) });
}

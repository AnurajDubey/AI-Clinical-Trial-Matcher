import { NextRequest, NextResponse } from "next/server";
import { getTrial } from "@/lib/ctgov";
import { evaluateTrial } from "@/lib/agent/evaluateTrial";
import type { PatientProfile } from "@/lib/types";

export const maxDuration = 120; // LLM reasoning over long criteria lists takes a while

export async function POST(req: NextRequest) {
  let body: { nctId?: string; profile?: PatientProfile };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.nctId || !body.profile) {
    return NextResponse.json({ error: "Expected { nctId, profile }" }, { status: 400 });
  }

  try {
    const trial = await getTrial(body.nctId);
    if (!trial) {
      return NextResponse.json({ error: `Trial ${body.nctId} not found` }, { status: 404 });
    }
    const verdict = await evaluateTrial(trial, body.profile);
    return NextResponse.json({ verdict });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Evaluation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

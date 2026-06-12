import { NextRequest, NextResponse } from "next/server";
import { getTrial } from "@/lib/ctgov";
import { computeGap } from "@/lib/agent/computeGap";
import type { PatientProfile, TrialVerdict } from "@/lib/types";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let body: { nctId?: string; profile?: PatientProfile; verdict?: TrialVerdict };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.nctId || !body.profile || !body.verdict) {
    return NextResponse.json({ error: "Expected { nctId, profile, verdict }" }, { status: 400 });
  }

  try {
    const trial = await getTrial(body.nctId);
    if (!trial) {
      return NextResponse.json({ error: `Trial ${body.nctId} not found` }, { status: 404 });
    }
    const path = await computeGap(trial, body.profile, body.verdict);
    return NextResponse.json({ path });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gap analysis failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

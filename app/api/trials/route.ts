import { NextRequest, NextResponse } from "next/server";
import { searchTrials } from "@/lib/ctgov";

export async function GET(req: NextRequest) {
  const condition = req.nextUrl.searchParams.get("cond")?.trim();
  if (!condition) {
    return NextResponse.json({ error: "Missing ?cond=<condition>" }, { status: 400 });
  }
  try {
    const trials = await searchTrials({
      condition,
      intervention: req.nextUrl.searchParams.get("intr")?.trim() || undefined,
    });
    return NextResponse.json({ trials });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getFacility, isSource } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ source: string; id: string }> }) {
  const { source, id } = await context.params;
  if (!isSource(source)) return NextResponse.json({ error: "That record could not be found." }, { status: 404 });
  try {
    const facility = await getFacility(source, id);
    if (!facility) return NextResponse.json({ error: "That record could not be found." }, { status: 404 });
    return NextResponse.json(facility);
  } catch {
    return NextResponse.json({ error: "Healthcare records are temporarily unavailable. Try again in a few minutes." }, { status: 502 });
  }
}

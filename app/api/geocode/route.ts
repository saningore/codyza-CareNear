import { NextRequest, NextResponse } from "next/server";
import { GeocodeError, resolveQuery, suggestionsFor } from "@/lib/geocode";
import { clientKey, rateLimit } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!rateLimit(`geocode:${clientKey(request.headers.get("x-forwarded-for"))}`)) {
    return NextResponse.json({ error: "Too many searches. Wait a minute and try again." }, { status: 429 });
  }
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!query) return NextResponse.json({ error: "Enter a U.S. ZIP code, city, or street address." }, { status: 400 });
  try {
    if (request.nextUrl.searchParams.get("suggest") === "1") {
      const suggestions = await suggestionsFor(query);
      return NextResponse.json({ suggestions });
    }
    const origin = await resolveQuery(query);
    return NextResponse.json(origin);
  } catch (error) {
    const message = error instanceof GeocodeError ? error.message : "That location could not be found. Try a street address or another ZIP code.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

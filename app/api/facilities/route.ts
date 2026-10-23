import { NextRequest, NextResponse } from "next/server";
import { GeocodeError } from "@/lib/geocode";
import { clientKey, rateLimit } from "@/lib/http";
import { normalizeRadius, searchFacilities } from "@/lib/search";
import type { SearchOrigin } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!rateLimit(`facilities:${clientKey(request.headers.get("x-forwarded-for"))}`)) {
    return NextResponse.json({ error: "Too many searches. Wait a minute and try again." }, { status: 429 });
  }
  const params = request.nextUrl.searchParams;
  const latitude = Number(params.get("lat"));
  const longitude = Number(params.get("lon"));
  const precision = params.get("precision");
  const label = params.get("label")?.slice(0, 180) || "Search location";
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return NextResponse.json({ error: "Enter a U.S. ZIP code, city, or street address." }, { status: 400 });
  }
  const origin: SearchOrigin = {
    label,
    latitude,
    longitude,
    precision: precision === "device" || precision === "zip-center" || precision === "place" || precision === "address" ? precision : "address",
    state: params.get("state"),
  };
  try {
    const result = await searchFacilities(origin, normalizeRadius(params.get("radius")));
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
    });
  } catch (error) {
    const message = error instanceof GeocodeError
      ? error.message
      : "Healthcare records are temporarily unavailable. Try again in a few minutes.";
    const status = error instanceof GeocodeError ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

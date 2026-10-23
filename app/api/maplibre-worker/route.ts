import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-static";

export async function GET() {
  const file = await readFile(join(process.cwd(), "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs"));
  return new NextResponse(file, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

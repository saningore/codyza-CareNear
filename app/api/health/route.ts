import { NextResponse } from "next/server";
import { hrsaFile } from "@/lib/hrsa";
import { placeData, zctaData } from "@/lib/reference";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const hrsa = hrsaFile();
    const zcta = zctaData();
    const places = placeData();
    return NextResponse.json({
      ok: true,
      sources: {
        hrsa: { retrievedAt: hrsa.retrievedAt, fileLastModified: hrsa.fileLastModified, count: hrsa.count },
        zcta: { retrievedAt: zcta.retrievedAt, count: Object.keys(zcta.centroids).length },
        places: { retrievedAt: places.retrievedAt, count: places.places.length },
        samhsa: { mode: "live", url: "https://findtreatment.gov/" },
        nppes: { mode: "live", url: "https://npiregistry.cms.hhs.gov/api-page" },
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Reference data is not loaded." }, { status: 503 });
  }
}

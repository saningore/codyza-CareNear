import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as geocodeGet } from "@/app/api/geocode/route";
import { GET as facilitiesGet } from "@/app/api/facilities/route";
import { GET as facilityGet } from "@/app/api/facilities/[source]/[id]/route";
import { GET as healthGet } from "@/app/api/health/route";
import { geocodeAddress } from "@/lib/geocode";
import { getNppes } from "@/lib/nppes";
import { searchSamhsa } from "@/lib/samhsa";
import { searchFacilities } from "@/lib/search";
import { resolveQuery } from "@/lib/geocode";

const LIVE = 120_000;

describe("HTTP routes", () => {
  it("reports loaded reference data from the health check", async () => {
    const response = await healthGet();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.sources.hrsa.count).toBeGreaterThan(16000);
    expect(body.sources.zcta.count).toBeGreaterThan(30000);
    expect(body.sources.places.count).toBeGreaterThan(30000);
    expect(body.sources.samhsa.mode).toBe("live");
    expect(body.sources.nppes.mode).toBe("live");
  });

  it("geocodes a ZIP through the API and rejects a bad one", async () => {
    const good = await geocodeGet(new NextRequest("http://localhost/api/geocode?q=10001", {
      headers: { "x-forwarded-for": "198.51.100.10" },
    }));
    expect(good.status).toBe(200);
    const origin = await good.json();
    expect(origin.precision).toBe("zip-center");
    expect(origin.label).toBe("ZIP code 10001");

    const bad = await geocodeGet(new NextRequest("http://localhost/api/geocode?q=1234", {
      headers: { "x-forwarded-for": "198.51.100.11" },
    }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("Enter a 5-digit U.S. ZIP code.");

    const empty = await geocodeGet(new NextRequest("http://localhost/api/geocode?q=", {
      headers: { "x-forwarded-for": "198.51.100.12" },
    }));
    expect(empty.status).toBe(400);
  });

  it("rejects a facilities search with no coordinates", async () => {
    const response = await facilitiesGet(new NextRequest("http://localhost/api/facilities?lat=abc&lon=1", {
      headers: { "x-forwarded-for": "198.51.100.13" },
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/ZIP code, city, or street address/);
  });

  it("returns the Chelsea HRSA record and a not-found response", async () => {
    const found = await facilityGet(new NextRequest("http://localhost/api/facilities/hrsa/021630-5-10001"), {
      params: Promise.resolve({ source: "hrsa", id: "021630-5-10001" }),
    });
    expect(found.status).toBe(200);
    const facility = await found.json();
    expect(facility.name).toBe("Chelsea Mobile Unit");
    expect(facility.phone).toBe("(212) 545-2495");
    expect(facility.hours).toBe("40 hours per week reported by HRSA");

    const missing = await facilityGet(new NextRequest("http://localhost/api/facilities/hrsa/missing"), {
      params: Promise.resolve({ source: "hrsa", id: "missing" }),
    });
    expect(missing.status).toBe(404);

    const unknown = await facilityGet(new NextRequest("http://localhost/api/facilities/fake/1"), {
      params: Promise.resolve({ source: "fake", id: "1" }),
    });
    expect(unknown.status).toBe(404);
  });
});

describe("live agency records", () => {
  it("matches a known street address with the Census geocoder", async () => {
    const match = await geocodeAddress("1600 Pennsylvania Avenue NW, Washington, DC");
    expect(match).not.toBeNull();
    expect(match?.state).toBe("DC");
    expect(match?.precision).toBe("address");
    expect(match?.latitude).toBeGreaterThan(38.8);
    expect(match?.latitude).toBeLessThan(38.95);
    expect(match?.longitude).toBeLessThan(-77);
  }, 20_000);

  it("loads Bellevue Hospital Center from the NPI Registry", async () => {
    const facility = await getNppes("1730404468");
    expect(facility).not.toBeNull();
    expect(facility?.name.toUpperCase()).toContain("BELLEVUE");
    expect(facility?.city?.toUpperCase()).toBe("NEW YORK");
    expect(facility?.state).toBe("NY");
    expect(facility?.postalCode).toMatch(/^10016/);
    expect(facility?.phone).toMatch(/212/);
    expect(facility?.sourceUrl).toContain("npiregistry.cms.hhs.gov");
    expect(facility?.sourceRecordId).toBe("1730404468");
  }, 30_000);

  it("returns SAMHSA treatment locations around ZIP 10001", async () => {
    const rows = await searchSamhsa(40.75065, -73.9973, 5);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.source).toBe("samhsa");
      expect(row.name.trim().length).toBeGreaterThan(1);
      expect(row.categories.some((category) => category === "mental-health" || category === "substance-use")).toBe(true);
      expect(row.distanceMiles === null || row.distanceMiles <= 6).toBe(true);
      expect(row.sourceUrl).toContain("findtreatment.gov");
    }
  }, 40_000);

  it("searches Manhattan across HRSA, SAMHSA, and NPPES", async () => {
    const origin = await resolveQuery("10001");
    const result = await searchFacilities(origin, 10);
    expect(result.facilities.length).toBeGreaterThan(8);
    expect(result.facilities.length).toBeLessThanOrEqual(100);
    const sources = new Set(result.facilities.map((facility) => facility.source));
    expect(sources.has("hrsa")).toBe(true);
    expect(sources.has("samhsa")).toBe(true);
    expect(sources.has("nppes")).toBe(true);
    expect(result.counts["health-center"]).toBeGreaterThan(0);
    expect(result.counts.hospital).toBeGreaterThan(0);

    const distances = result.facilities.map((facility) => facility.distanceMiles ?? 0);
    const sorted = [...distances].sort((a, b) => a - b);
    expect(distances).toEqual(sorted);
    for (const facility of result.facilities) {
      expect(facility.name.trim().length).toBeGreaterThan(1);
      expect(facility.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(facility.distanceMiles === null || facility.distanceMiles <= 11).toBe(true);
      expect(JSON.stringify(facility)).not.toMatch(/medically best|star rating|price/i);
      if (facility.latitude !== null) {
        expect(facility.longitude).not.toBeNull();
        expect(facility.addressLine).toBeTruthy();
      }
    }
  }, LIVE);

  it("finds care around Chicago and Houston", async () => {
    const chicagoOrigin = await resolveQuery("Chicago, IL");
    const houstonOrigin = await resolveQuery("77002");
    const [chicago, houston] = await Promise.all([
      searchFacilities(chicagoOrigin, 10),
      searchFacilities(houstonOrigin, 10),
    ]);
    for (const result of [chicago, houston]) {
      expect(result.facilities.length).toBeGreaterThan(5);
      expect(result.counts["health-center"]).toBeGreaterThan(0);
      expect(new Set(result.facilities.map((facility) => facility.source)).size).toBeGreaterThan(1);
      expect(result.facilities.every((facility) => (facility.distanceMiles ?? 0) <= 11)).toBe(true);
    }
    expect(chicago.origin.state).toBe("IL");
    expect(houston.origin.precision).toBe("zip-center");
  }, LIVE);
});

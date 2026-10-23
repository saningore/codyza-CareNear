import { describe, expect, it } from "vitest";
import { GeocodeError, resolveQuery, suggestionsFor } from "@/lib/geocode";
import {
  formatMiles,
  formatPostal,
  fullAddress,
  show,
  stateAbbreviation,
  telHref,
} from "@/lib/format";
import { inSearchableArea, roundCoordinate } from "@/lib/geo";
import { hrsaFacility, hrsaFile, searchHrsa } from "@/lib/hrsa";
import { clientKey, rateLimit } from "@/lib/http";
import { nearbyZips, searchPlaces, zipCentroid } from "@/lib/reference";
import { isSource, normalizeRadius } from "@/lib/search";
import { UNAVAILABLE, categoryLabel } from "@/lib/types";

describe("search rules", () => {
  it("keeps only the published radius choices and defaults to 25 miles", () => {
    expect(normalizeRadius("10")).toBe(10);
    expect(normalizeRadius(50)).toBe(50);
    expect(normalizeRadius("7")).toBe(25);
    expect(normalizeRadius(null)).toBe(25);
    expect(normalizeRadius("25 miles")).toBe(25);
  });

  it("accepts only the three publishing agencies as record sources", () => {
    expect(isSource("hrsa")).toBe(true);
    expect(isSource("samhsa")).toBe(true);
    expect(isSource("nppes")).toBe(true);
    expect(isSource("cms")).toBe(false);
    expect(isSource("")).toBe(false);
  });

  it("labels every category in plain language", () => {
    expect(categoryLabel("health-center")).toBe("Community health centers");
    expect(categoryLabel("substance-use")).toBe("Substance use treatment");
  });

  it("limits repeated searches from the same client", () => {
    const key = `unit-${Date.now()}`;
    for (let attempt = 0; attempt < 30; attempt += 1) expect(rateLimit(key, 30, 60_000)).toBe(true);
    expect(rateLimit(key, 30, 60_000)).toBe(false);
    expect(clientKey("203.0.113.8, 10.0.0.1")).toBe("203.0.113.8");
    expect(clientKey(null)).toBe("local");
  });
});

describe("place lookup from the Census gazetteer", () => {
  it("resolves a ZIP code to its published center", async () => {
    const origin = await resolveQuery("10001");
    const center = zipCentroid("10001");
    expect(center).not.toBeNull();
    expect(origin.precision).toBe("zip-center");
    expect(origin.label).toBe("ZIP code 10001");
    expect(origin.latitude).toBe(center?.latitude);
    expect(origin.longitude).toBe(center?.longitude);
    expect(origin.latitude).toBeCloseTo(40.75, 1);
    expect(origin.longitude).toBeCloseTo(-74, 0);
  });

  it("rejects a short ZIP and an unknown ZIP without inventing a point", async () => {
    await expect(resolveQuery("1234")).rejects.toThrow(new GeocodeError("Enter a 5-digit U.S. ZIP code."));
    await expect(resolveQuery("00000")).rejects.toThrow(/could not be found/);
    await expect(resolveQuery("   ")).rejects.toThrow(/ZIP code, city, or street address/);
  });

  it("resolves Chicago and Houston from the place file", async () => {
    const chicago = await resolveQuery("Chicago, Illinois");
    expect(chicago.precision).toBe("place");
    expect(chicago.state).toBe("IL");
    expect(chicago.latitude).toBeCloseTo(41.84, 1);
    expect(chicago.longitude).toBeCloseTo(-87.68, 1);

    const houston = await resolveQuery("Houston, TX");
    expect(houston.state).toBe("TX");
    expect(houston.latitude).toBeGreaterThan(29);
    expect(houston.latitude).toBeLessThan(30.2);
  });

  it("asks for a state when several cities share a name", async () => {
    await expect(resolveQuery("Springfield")).rejects.toThrow(/Add a state/);
  });

  it("suggests the ZIP center and the largest matching place", async () => {
    const zip = await suggestionsFor("60601");
    expect(zip[0]?.precision).toBe("zip-center");
    const places = await suggestionsFor("Chicago, IL");
    expect(places[0]?.label).toMatch(/Chicago, IL/);
    expect(await suggestionsFor("zz")).toEqual([]);
  });

  it("finds nearby ZIP codes around Manhattan", () => {
    const center = zipCentroid("10001");
    expect(center).not.toBeNull();
    const zips = nearbyZips(center!.latitude, center!.longitude, 2, 8);
    expect(zips[0]).toBe("10001");
    expect(zips.length).toBeGreaterThan(1);
    expect(zips.every((zip) => /^\d{5}$/.test(zip))).toBe(true);
  });

  it("finds Chicago by name and state", () => {
    const matches = searchPlaces("Chicago, IL", 3);
    expect(matches[0]?.n).toBe("Chicago");
    expect(matches[0]?.s).toBe("IL");
    expect(matches[0]?.cdp).toBe(false);
  });
});

describe("local HRSA snapshot", () => {
  it("loaded an official extract with thousands of service sites", () => {
    const file = hrsaFile();
    expect(file.publisher).toMatch(/Health Resources and Services Administration/);
    expect(file.url).toContain("data.hrsa.gov");
    expect(file.count).toBe(file.sites.length);
    expect(file.count).toBeGreaterThan(16000);
    expect(file.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("returns Chelsea Mobile Unit exactly as HRSA published it", () => {
    const found = searchHrsa(40.75065, -73.9973, 1).find((site) => site.id === "021630-5-10001");
    expect(found?.name).toBe("Chelsea Mobile Unit");
    expect(found?.phone).toBe("(212) 545-2495");
    expect(found?.addressLine).toBe("303 9th Ave");
    expect(found?.city).toBe("New York");
    expect(found?.state).toBe("NY");
    expect(found?.postalCode).toMatch(/^10001/);
    expect(found?.hours).toBe("40 hours per week reported by HRSA");
    expect(found?.website).toBeNull();
    expect(found?.latitude).toBeCloseTo(40.74924, 4);
    expect(found?.longitude).toBeCloseTo(-73.99935, 4);
    expect(found?.sourceName).toMatch(/Health Resources and Services Administration/);
    expect(found?.facts.find((fact) => fact.label === "Daily opening hours")?.value).toBeNull();
  });

  it("does not map sites whose street address was withheld", () => {
    const withheld = hrsaFile().sites.filter((site) => site.withheld);
    expect(withheld.length).toBeGreaterThan(0);
    for (const site of withheld.slice(0, 25)) {
      const facility = hrsaFacility(site, { latitude: 40.75, longitude: -73.99 });
      expect(facility.latitude).toBeNull();
      expect(facility.longitude).toBeNull();
      expect(facility.addressLine).toBeNull();
      expect(facility.postalCode).toBeNull();
    }
  });

  it("finds health centers around Chicago and Houston", () => {
    const chicago = searchHrsa(41.83705, -87.68494, 10);
    const houston = searchHrsa(29.7543, -95.3609, 10);
    expect(chicago.length).toBeGreaterThan(0);
    expect(houston.length).toBeGreaterThan(0);
    expect(chicago.every((site) => (site.distanceMiles ?? 99) <= 10)).toBe(true);
    expect(houston.every((site) => site.category === "health-center")).toBe(true);
  });
});

describe("display of missing fields", () => {
  it("uses the required unavailable sentence and formats the rest of a record", () => {
    expect(show(null)).toBe(UNAVAILABLE);
    expect(show("  ")).toBe(UNAVAILABLE);
    expect(UNAVAILABLE).toBe("Information unavailable");
    expect(stateAbbreviation("New York")).toBe("NY");
    expect(stateAbbreviation("zz")).toBeNull();
    expect(formatPostal("100011810")).toBe("10001-1810");
    expect(formatMiles(0.84, true)).toBe("About 0.8 mi");
    expect(formatMiles(12.2, false)).toBe("12 mi");
    expect(formatMiles(null, false)).toBeNull();
    expect(telHref("(212) 545-2495")).toBe("tel:+12125452495");
    expect(telHref("311")).toBeNull();
    expect(fullAddress({
      addressLine: "303 9th Ave",
      city: "New York",
      state: "NY",
      postalCode: "100015701",
    })).toBe("303 9th Ave, New York, NY 10001-5701");
    expect(roundCoordinate(40.750654)).toBe(40.75065);
  });

  it("keeps searches inside U.S. areas and rejects other countries", () => {
    expect(inSearchableArea(40.75, -73.99)).toBe(true);
    expect(inSearchableArea(21.3, -157.8)).toBe(true);
    expect(inSearchableArea(18.2, -66.5)).toBe(true);
    expect(inSearchableArea(51.5, -0.12)).toBe(false);
    expect(inSearchableArea(Number.NaN, -73)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { directionsHref, formatPhone, publishCoordinates, websiteHref, zipFive } from "@/lib/format";
import { milesBetween } from "@/lib/geo";

describe("public record formatting", () => {
  it("rejects an incomplete ZIP code", () => {
    expect(zipFive("1234")).toBeNull();
    expect(zipFive("10001-1234")).toBe("10001");
    expect(zipFive("100011810")).toBe("10001");
  });

  it("formats a 10-digit phone and keeps an unusual source value", () => {
    expect(formatPhone("2126778550")).toBe("(212) 677-8550");
    expect(formatPhone("311")).toBe("311");
    expect(formatPhone("")).toBeNull();
  });

  it("allows only http and https websites", () => {
    expect(websiteHref("www.tricountyri.org")).toBe("https://www.tricountyri.org/");
    expect(websiteHref("javascript:alert(1)")).toBeNull();
    expect(websiteHref("")).toBeNull();
  });

  it("does not publish coordinates when the street or ZIP is withheld", () => {
    expect(publishCoordinates(null, null, 40.7, -74).latitude).toBeNull();
    expect(publishCoordinates("5301 Broadway", "07093", 40.78, -74.01).latitude).toBe(40.78);
  });

  it("builds a directions link from coordinates", () => {
    expect(directionsHref(40.7, -74, null)).toContain("destination=40.7,-74");
    expect(directionsHref(null, null, null)).toBeNull();
  });

  it("measures a short distance in miles", () => {
    const miles = milesBetween(40.7484, -73.9967, 40.758, -73.9855);
    expect(miles).toBeGreaterThan(0.5);
    expect(miles).toBeLessThan(1.2);
  });
});

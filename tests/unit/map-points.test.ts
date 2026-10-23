import { describe, expect, it } from "vitest";
import { milesBetween } from "@/lib/geo";
import {
  accuracyCollection,
  facilityCollection,
  facilityKey,
  frameFor,
  legendMarks,
  originCollection,
  pinDistanceText,
  searchPlaceLabel,
  unpinnedCount,
} from "@/lib/map-points";
import type { CategoryId, Facility, SearchOrigin } from "@/lib/types";

function origin(overrides: Partial<SearchOrigin> = {}): SearchOrigin {
  return {
    label: "ZIP code 10001",
    latitude: 40.75,
    longitude: -73.99,
    precision: "zip-center",
    state: "NY",
    ...overrides,
  };
}

function facility(overrides: Partial<Facility> & { id: string; category: CategoryId }): Facility {
  return {
    source: "hrsa",
    name: overrides.name ?? overrides.id,
    aka: null,
    categories: overrides.categories ?? [overrides.category],
    serviceType: null,
    addressLine: null,
    city: null,
    state: "NY",
    postalCode: "10001",
    phone: null,
    intakePhone: null,
    hotlinePhone: null,
    website: null,
    hours: null,
    latitude: overrides.latitude === undefined ? 40.75 : overrides.latitude,
    longitude: overrides.longitude === undefined ? -73.99 : overrides.longitude,
    coordinateNote: null,
    distanceMiles: overrides.distanceMiles === undefined ? 0.4 : overrides.distanceMiles,
    distanceApproximate: overrides.distanceApproximate ?? false,
    sourceName: "HRSA",
    sourceUrl: "https://data.hrsa.gov",
    sourceRecordUrl: null,
    sourceRecordId: null,
    retrievedAt: "2026-01-01T00:00:00.000Z",
    facts: [],
    services: [],
    ...overrides,
  };
}

describe("map points", () => {
  it("names the searched place from how it was found", () => {
    expect(searchPlaceLabel(origin())).toBe("Center of ZIP code 10001");
    expect(searchPlaceLabel(origin({ precision: "device", label: "Your current location" }))).toBe("Your current location");
    expect(searchPlaceLabel(origin({ precision: "place", label: "Chicago, IL" }))).toBe("Chicago, IL");
    expect(searchPlaceLabel(origin({ precision: "address", label: "303 9th Ave, New York, NY" }))).toBe("303 9th Ave, New York, NY");
  });

  it("plots one pin per facility and skips a listing without coordinates", () => {
    const place = origin();
    const plotted = facility({ id: "site-1", category: "hospital", name: "Bellevue" });
    const hidden = facility({ id: "site-2", category: "pharmacy", latitude: null, longitude: null });
    const collection = facilityCollection([plotted, hidden], place);
    expect(collection.features).toHaveLength(1);
    expect(collection.features[0]?.id).toBe(facilityKey(plotted));
    expect(collection.features[0]?.properties).toMatchObject({ mark: "H", name: "Bellevue" });
    expect(unpinnedCount([plotted, hidden])).toBe(1);
  });

  it("uses the primary category for the pin mark", () => {
    const place = origin();
    const mixed = facility({
      id: "mixed",
      category: "hospital",
      categories: ["pharmacy", "hospital"],
    });
    const feature = facilityCollection([mixed], place).features[0];
    expect(feature?.properties).toMatchObject({ mark: "H" });
    expect(legendMarks([mixed]).map((item) => item.mark)).toEqual(["H"]);
  });

  it("separates facilities that share a coordinate without moving the distance text", () => {
    const place = origin();
    const first = facility({ id: "a", category: "hospital", name: "One" });
    const second = facility({ id: "b", category: "pharmacy", name: "Two", categories: ["pharmacy"] });
    const features = facilityCollection([first, second], place).features;
    expect(features).toHaveLength(2);
    const [left, right] = features;
    if (!left || !right || left.geometry.type !== "Point" || right.geometry.type !== "Point") {
      throw new Error("expected two point features");
    }
    const miles = milesBetween(left.geometry.coordinates[1], left.geometry.coordinates[0], right.geometry.coordinates[1], right.geometry.coordinates[0]);
    expect(miles).toBeGreaterThan(0);
    expect(miles).toBeLessThan(0.02);
    expect(pinDistanceText(first, place)).toBe("0.4 mi from Center of ZIP code 10001");
  });

  it("keeps the searched place inside the frame", () => {
    const place = origin();
    const far = facility({ id: "far", category: "dialysis", latitude: 40.9, longitude: -74.2 });
    const frame = frameFor(place, [far]);
    expect(frame.kind).toBe("bounds");
    if (frame.kind !== "bounds") return;
    expect(frame.south).toBeLessThanOrEqual(place.latitude);
    expect(frame.north).toBeGreaterThanOrEqual(40.9);
    expect(frame.west).toBeLessThanOrEqual(-74.2);
    expect(frame.east).toBeGreaterThanOrEqual(place.longitude);
  });

  it("centers on the searched place when nothing can be pinned", () => {
    const place = origin();
    const frame = frameFor(place, [facility({ id: "none", category: "hospital", latitude: null, longitude: null })]);
    expect(frame).toEqual({ kind: "point", longitude: place.longitude, latitude: place.latitude, zoom: 12 });
  });

  it("draws a device accuracy ring only for a precise device fix", () => {
    const device = origin({ precision: "device", label: "Your current location" });
    const ring = accuracyCollection(device, 100);
    expect(ring.features).toHaveLength(1);
    const geometry = ring.features[0]?.geometry;
    expect(geometry?.type).toBe("Polygon");
    if (geometry?.type !== "Polygon") return;
    expect(geometry.coordinates[0]).toHaveLength(65);
    expect(accuracyCollection(origin(), 100).features).toHaveLength(0);
    expect(accuracyCollection(device, 5000).features).toHaveLength(0);
    expect(accuracyCollection(device, null).features).toHaveLength(0);
  });

  it("describes the ZIP center on the origin pin", () => {
    const feature = originCollection(origin()).features[0];
    expect(feature?.properties).toMatchObject({
      label: "Center of ZIP code 10001",
      detail: "Distances are measured from the center of this ZIP code.",
    });
  });
});

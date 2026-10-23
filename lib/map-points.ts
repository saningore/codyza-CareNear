import { formatMiles } from "@/lib/format";
import { CATEGORIES, categoryLabel, type CategoryId, type Facility, type SearchOrigin } from "@/lib/types";

export const PIN_MARKS: Record<CategoryId, string> = {
  "health-center": "HC",
  hospital: "H",
  "nursing-home": "NH",
  dialysis: "D",
  "mental-health": "MH",
  "substance-use": "SU",
  pharmacy: "Rx",
  "urgent-care": "UC",
};

const NUDGE_METERS = 7;
const EARTH_RADIUS_METERS = 6378137;
const MAX_ACCURACY_METERS = 5000;

export type LngLat = [number, number];

export type FacilityFeatureProperties = {
  key: string;
  name: string;
  mark: string;
  categories: string;
  distance: string;
  href: string;
};

export type OriginFeatureProperties = {
  label: string;
  detail: string;
};

export type MapFeature = {
  type: "Feature";
  id: string;
  properties: FacilityFeatureProperties | OriginFeatureProperties | Record<string, never>;
  geometry: { type: "Point"; coordinates: LngLat } | { type: "Polygon"; coordinates: LngLat[][] };
};

export type MapFeatureCollection = {
  type: "FeatureCollection";
  features: MapFeature[];
};

export type MapFrame =
  | { kind: "point"; longitude: number; latitude: number; zoom: number }
  | { kind: "bounds"; west: number; south: number; east: number; north: number };

export function facilityKey(facility: { source: string; id: string }): string {
  return `${facility.source}:${facility.id}`;
}

export function pinMark(category: CategoryId): string {
  return PIN_MARKS[category];
}

export function searchPlaceLabel(origin: Pick<SearchOrigin, "precision" | "label">): string {
  if (origin.precision === "device") return "Your current location";
  if (origin.precision === "zip-center") {
    return origin.label.startsWith("Center of ") ? origin.label : `Center of ${origin.label}`;
  }
  return origin.label;
}

export function searchPlaceDetail(origin: Pick<SearchOrigin, "precision">): string {
  if (origin.precision === "zip-center") return "Distances are measured from the center of this ZIP code.";
  return "Distances are measured from this search location.";
}

export function pinDistanceText(facility: Facility, origin: SearchOrigin): string {
  const miles = formatMiles(facility.distanceMiles, facility.distanceApproximate);
  if (!miles) return "Information unavailable";
  return `${miles} from ${searchPlaceLabel(origin)}`;
}

export function hasCoordinates(facility: Facility): facility is Facility & { latitude: number; longitude: number } {
  return facility.latitude !== null
    && facility.longitude !== null
    && Number.isFinite(facility.latitude)
    && Number.isFinite(facility.longitude);
}

export function unpinnedCount(facilities: Facility[]): number {
  return facilities.filter((facility) => !hasCoordinates(facility)).length;
}

export function legendMarks(facilities: Facility[]): { category: CategoryId; mark: string }[] {
  const present = new Set<CategoryId>();
  for (const facility of facilities) {
    if (hasCoordinates(facility)) present.add(facility.category);
  }
  return CATEGORIES.filter((category) => present.has(category.id)).map((category) => ({
    category: category.id,
    mark: pinMark(category.id),
  }));
}

export function emptyCollection(): MapFeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

export function nudgeCoordinate(
  latitude: number,
  longitude: number,
  index: number,
  total: number,
): { latitude: number; longitude: number } {
  if (total <= 1) return { latitude, longitude };
  const angle = (2 * Math.PI * index) / total;
  const north = NUDGE_METERS * Math.cos(angle);
  const east = NUDGE_METERS * Math.sin(angle);
  const latitudeShift = north / 111320;
  const cosine = Math.cos((latitude * Math.PI) / 180);
  const longitudeShift = east / (111320 * Math.max(Math.abs(cosine), 0.01));
  return { latitude: latitude + latitudeShift, longitude: longitude + longitudeShift };
}

export function facilityCollection(facilities: Facility[], origin: SearchOrigin): MapFeatureCollection {
  const groups = new Map<string, Facility[]>();
  for (const facility of facilities) {
    if (!hasCoordinates(facility)) continue;
    const key = `${facility.latitude.toFixed(5)},${facility.longitude.toFixed(5)}`;
    const group = groups.get(key);
    if (group) group.push(facility);
    else groups.set(key, [facility]);
  }
  const features: MapFeature[] = [];
  for (const group of groups.values()) {
    group.forEach((facility, index) => {
      if (!hasCoordinates(facility)) return;
      const display = nudgeCoordinate(facility.latitude, facility.longitude, index, group.length);
      const properties: FacilityFeatureProperties = {
        key: facilityKey(facility),
        name: facility.name,
        mark: pinMark(facility.category),
        categories: facility.categories.map((category) => categoryLabel(category)).join(" · "),
        distance: pinDistanceText(facility, origin),
        href: `/facility/${facility.source}/${encodeURIComponent(facility.id)}`,
      };
      features.push({
        type: "Feature",
        id: properties.key,
        properties,
        geometry: { type: "Point", coordinates: [display.longitude, display.latitude] },
      });
    });
  }
  return { type: "FeatureCollection", features };
}

export function originCollection(origin: SearchOrigin): MapFeatureCollection {
  const properties: OriginFeatureProperties = {
    label: searchPlaceLabel(origin),
    detail: searchPlaceDetail(origin),
  };
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      id: "origin",
      properties,
      geometry: { type: "Point", coordinates: [origin.longitude, origin.latitude] },
    }],
  };
}

export function circleRing(longitude: number, latitude: number, radiusMeters: number, steps = 64): LngLat[] {
  const latitudeRadians = (latitude * Math.PI) / 180;
  const longitudeRadians = (longitude * Math.PI) / 180;
  const angular = radiusMeters / EARTH_RADIUS_METERS;
  const ring: LngLat[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const bearing = (2 * Math.PI * index) / steps;
    const nextLatitude = Math.asin(
      Math.sin(latitudeRadians) * Math.cos(angular)
      + Math.cos(latitudeRadians) * Math.sin(angular) * Math.cos(bearing),
    );
    const nextLongitude = longitudeRadians + Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(latitudeRadians),
      Math.cos(angular) - Math.sin(latitudeRadians) * Math.sin(nextLatitude),
    );
    ring.push([(nextLongitude * 180) / Math.PI, (nextLatitude * 180) / Math.PI]);
  }
  return ring;
}

export function accuracyCollection(origin: SearchOrigin, accuracyMeters: number | null | undefined): MapFeatureCollection {
  if (
    origin.precision !== "device"
    || accuracyMeters == null
    || !Number.isFinite(accuracyMeters)
    || accuracyMeters <= 0
    || accuracyMeters >= MAX_ACCURACY_METERS
  ) {
    return emptyCollection();
  }
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      id: "accuracy",
      properties: {},
      geometry: { type: "Polygon", coordinates: [circleRing(origin.longitude, origin.latitude, accuracyMeters)] },
    }],
  };
}

export function frameFor(origin: SearchOrigin, facilities: Facility[]): MapFrame {
  const points = facilityCollection(facilities, origin).features.flatMap((feature) => (
    feature.geometry.type === "Point"
      ? [{ longitude: feature.geometry.coordinates[0], latitude: feature.geometry.coordinates[1] }]
      : []
  ));
  if (!points.length) {
    return { kind: "point", longitude: origin.longitude, latitude: origin.latitude, zoom: 12 };
  }
  let west = origin.longitude;
  let east = origin.longitude;
  let south = origin.latitude;
  let north = origin.latitude;
  for (const point of points) {
    west = Math.min(west, point.longitude);
    east = Math.max(east, point.longitude);
    south = Math.min(south, point.latitude);
    north = Math.max(north, point.latitude);
  }
  return { kind: "bounds", west, south, east, north };
}

export function isFacilityProperties(value: object): value is FacilityFeatureProperties {
  return "href" in value && "name" in value && "key" in value;
}

export function isOriginProperties(value: object): value is OriginFeatureProperties {
  return "label" in value && "detail" in value && !("href" in value);
}

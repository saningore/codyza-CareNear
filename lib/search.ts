import { confirmUsPoint, GeocodeError } from "@/lib/geocode";
import { getHrsa, searchHrsa } from "@/lib/hrsa";
import { geocodeNearest, getNppes, searchNppes } from "@/lib/nppes";
import { getSamhsa, searchSamhsa } from "@/lib/samhsa";
import { CATEGORIES, type CategoryId, type Facility, type SearchOrigin, type SearchResponse, type SourceId, type SourceWarning } from "@/lib/types";

const RADII = new Set([5, 10, 25, 50]);

export function normalizeRadius(value: unknown): number {
  const radius = Number(value);
  return RADII.has(radius) ? radius : 25;
}

export async function searchFacilities(origin: SearchOrigin, radiusMiles: number): Promise<SearchResponse> {
  if (origin.precision === "device") {
    const allowed = await confirmUsPoint(origin.latitude, origin.longitude);
    if (!allowed) throw new GeocodeError("CareNear searches U.S. locations. Enter a U.S. ZIP code or address.");
  }
  const warnings: SourceWarning[] = [];
  const [healthCenters, treatment, providers] = await Promise.all([
    Promise.resolve()
      .then(() => searchHrsa(origin.latitude, origin.longitude, radiusMiles))
      .catch(() => {
        warnings.push({ source: "HRSA", message: "Community health center records could not be loaded. Other results are shown when they are available." });
        return [] as Facility[];
      }),
    searchSamhsa(origin.latitude, origin.longitude, radiusMiles).catch(() => {
      warnings.push({ source: "SAMHSA", message: "Mental health and substance use results could not be loaded. Other results are shown." });
      return [] as Facility[];
    }),
    searchNppes(origin.latitude, origin.longitude, radiusMiles).catch(() => {
      warnings.push({ source: "NPPES", message: "Hospital, nursing home, dialysis, pharmacy, and urgent care results could not be loaded. Other results are shown." });
      return [] as Facility[];
    }),
  ]);

  let facilities = [...healthCenters, ...treatment, ...providers];
  try {
    await geocodeNearest(facilities, origin.latitude, origin.longitude, radiusMiles);
  } catch {
    warnings.push({ source: "Census", message: "Some map pins could not be confirmed. Those listings still show the published address." });
  }
  facilities = facilities.filter((facility) => {
    if (facility.distanceMiles === null) return facility.source !== "nppes";
    if (!facility.distanceApproximate && facility.distanceMiles > radiusMiles + 1) return false;
    return facility.distanceMiles <= radiusMiles + (facility.distanceApproximate ? 0 : 1);
  });
  facilities.sort((a, b) => (a.distanceMiles ?? 9999) - (b.distanceMiles ?? 9999) || a.name.localeCompare(b.name));
  const counts = Object.fromEntries(CATEGORIES.map((category) => [
    category.id,
    facilities.filter((facility) => facility.categories.includes(category.id)).length,
  ])) as Record<CategoryId, number>;
  const chosen = new Map<string, Facility>();
  for (const category of CATEGORIES) {
    const nearest = facilities
      .filter((facility) => facility.categories.includes(category.id))
      .slice(0, 12);
    for (const facility of nearest) chosen.set(`${facility.source}:${facility.id}`, facility);
  }
  const listed = [...chosen.values()].sort((a, b) => (a.distanceMiles ?? 9999) - (b.distanceMiles ?? 9999) || a.name.localeCompare(b.name));
  return { origin, facilities: listed.slice(0, 100), warnings, capped: facilities.length > listed.length, counts };
}

export async function getFacility(source: string, id: string): Promise<Facility | null> {
  if (source === "hrsa") return getHrsa(id);
  if (source === "samhsa") return getSamhsa(decodeURIComponent(id));
  if (source === "nppes") return getNppes(id);
  return null;
}

export function isSource(source: string): source is SourceId {
  return source === "hrsa" || source === "samhsa" || source === "nppes";
}

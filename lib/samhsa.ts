import { fetchJson } from "@/lib/http";
import { formatPhone, slugPart, textOrNull, websiteHref, zipFive } from "@/lib/format";
import { milesBetween } from "@/lib/geo";
import { zipCentroid } from "@/lib/reference";
import type { CategoryId, Facility } from "@/lib/types";

type SamhsaService = { f1?: string; f2?: string; f3?: string };
type SamhsaRow = {
  name1?: string;
  name2?: string;
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  intake1?: string | null;
  hotline1?: string | null;
  website?: string | null;
  latitude?: string | number;
  longitude?: string | number;
  services?: SamhsaService[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function serviceLines(services: SamhsaService[] | undefined): string[] {
  if (!Array.isArray(services)) return [];
  const lines: string[] = [];
  for (const service of services) {
    const group = textOrNull(service.f1);
    const detail = textOrNull(service.f3);
    if (!group || !detail) continue;
    for (const part of detail.split(";")) {
      const item = part.trim();
      if (item) lines.push(`${group}: ${item}`);
    }
  }
  return lines;
}

function facilityType(services: SamhsaService[] | undefined): string | null {
  const facility = services?.find((service) => service.f1 === "Facility Type" && textOrNull(service.f3));
  if (facility) return textOrNull(facility.f3);
  const care = services?.find((service) => service.f1 === "Type of Care" && textOrNull(service.f3));
  return textOrNull(care?.f3 ?? null);
}

export function samhsaId(row: SamhsaRow): string {
  const zip = zipFive(row.zip) ?? "00000";
  const phone = (row.phone ?? "").replace(/\D/g, "") || "nophone";
  return `${zip}-${phone}-${slugPart(row.street1) || slugPart(row.name1) || "site"}`;
}

function toFacility(row: SamhsaRow, category: CategoryId, origin: { latitude: number; longitude: number }, retrievedAt: string): Facility | null {
  const name = textOrNull(row.name1);
  if (!name) return null;
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  const hasPoint = Number.isFinite(latitude) && Number.isFinite(longitude);
  const distance = hasPoint ? Math.round(milesBetween(origin.latitude, origin.longitude, latitude, longitude) * 10) / 10 : null;
  const aka = textOrNull(row.name2);
  const street = [textOrNull(row.street1), textOrNull(row.street2)].filter(Boolean).join(", ");
  return {
    id: samhsaId(row),
    source: "samhsa",
    name,
    aka: aka && aka.toLowerCase() !== name.toLowerCase() ? aka : null,
    category,
    categories: [category],
    serviceType: facilityType(row.services),
    addressLine: street || null,
    city: textOrNull(row.city),
    state: textOrNull(row.state),
    postalCode: textOrNull(row.zip),
    phone: formatPhone(row.phone),
    intakePhone: formatPhone(row.intake1),
    hotlinePhone: formatPhone(row.hotline1),
    website: textOrNull(row.website),
    hours: null,
    latitude: hasPoint ? latitude : null,
    longitude: hasPoint ? longitude : null,
    coordinateNote: hasPoint ? "Coordinates published by SAMHSA FindTreatment.gov" : null,
    distanceMiles: distance,
    distanceApproximate: false,
    sourceName: "Substance Abuse and Mental Health Services Administration",
    sourceUrl: "https://findtreatment.gov/",
    sourceRecordUrl: "https://findtreatment.gov/",
    sourceRecordId: samhsaId(row),
    retrievedAt,
    services: serviceLines(row.services),
    facts: [
      { label: "Intake phone reported by SAMHSA", value: formatPhone(row.intake1) },
      { label: "Hotline reported by SAMHSA", value: formatPhone(row.hotline1) },
      { label: "Daily opening hours", value: null },
    ],
  };
}

async function fetchType(latitude: number, longitude: number, radiusMiles: number, sType: "mh" | "sa"): Promise<SamhsaRow[]> {
  const meters = Math.round(radiusMiles * 1609.344);
  const rows: SamhsaRow[] = [];
  for (let page = 1; page <= 2; page += 1) {
    const url = `https://findtreatment.gov/locator/exportsAsJson/v2?sAddr=${latitude},${longitude}&limitType=2&limitValue=${meters}&sType=${sType}&page=${page}`;
    const payload = asRecord(await fetchJson(url, 7000));
    const batch = Array.isArray(payload?.rows) ? payload.rows as SamhsaRow[] : [];
    rows.push(...batch);
    const total = Number(payload?.recordCount ?? rows.length);
    if (!batch.length || rows.length >= total || rows.length >= 80) break;
  }
  return rows;
}

export async function searchSamhsa(latitude: number, longitude: number, radiusMiles: number): Promise<Facility[]> {
  const retrievedAt = new Date().toISOString();
  const origin = { latitude, longitude };
  const [mental, substance] = await Promise.all([
    fetchType(latitude, longitude, radiusMiles, "mh"),
    fetchType(latitude, longitude, radiusMiles, "sa"),
  ]);
  const merged = new Map<string, Facility>();
  const add = (rows: SamhsaRow[], category: CategoryId) => {
    for (const row of rows) {
      const facility = toFacility(row, category, origin, retrievedAt);
      if (!facility || facility.distanceMiles === null || facility.distanceMiles > radiusMiles) continue;
      const existing = merged.get(facility.id);
      if (!existing) {
        merged.set(facility.id, facility);
        continue;
      }
      if (!existing.categories.includes(category)) existing.categories.push(category);
      if (facility.services.length > existing.services.length) existing.services = facility.services;
    }
  };
  add(mental, "mental-health");
  add(substance, "substance-use");
  return [...merged.values()];
}

export async function getSamhsa(id: string): Promise<Facility | null> {
  const zip = id.slice(0, 5);
  const center = zipCentroid(zip);
  if (!center) return null;
  const facilities = await searchSamhsa(center.latitude, center.longitude, 20);
  return facilities.find((facility) => facility.id === id) ?? null;
}

export function safeWebsite(facility: Facility): string | null {
  return websiteHref(facility.website);
}

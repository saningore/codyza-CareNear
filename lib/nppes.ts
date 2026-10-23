import { fetchJson } from "@/lib/http";
import { formatPhone, textOrNull, zipFive } from "@/lib/format";
import { geocodeAddress } from "@/lib/geocode";
import { milesBetween } from "@/lib/geo";
import { nearbyCities, nearbyZips, zipCentroid } from "@/lib/reference";
import type { CategoryId, Facility } from "@/lib/types";

type NpiAddress = {
  address_1?: string;
  address_2?: string;
  address_purpose?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  telephone_number?: string;
  country_code?: string;
};

type NpiTaxonomy = { desc?: string; primary?: boolean };
type NpiRecord = {
  number?: string | number;
  enumeration_type?: string;
  basic?: { organization_name?: string; status?: string; organizational_subpart?: string; last_updated?: string };
  other_names?: { organization_name?: string; type?: string }[];
  addresses?: NpiAddress[];
  taxonomies?: NpiTaxonomy[];
};

const QUERIES: { category: CategoryId; taxonomy: string; pattern: RegExp; primaryOnly: boolean; scope: "city" | "zip" }[] = [
  { category: "hospital", taxonomy: "General Acute Care Hospital", pattern: /general acute care hospital|critical access hospital|psychiatric hospital|rehabilitation hospital/i, primaryOnly: true, scope: "city" },
  { category: "hospital", taxonomy: "Critical Access Hospital", pattern: /critical access hospital/i, primaryOnly: true, scope: "city" },
  { category: "nursing-home", taxonomy: "Skilled Nursing Facility", pattern: /skilled nursing facility/i, primaryOnly: true, scope: "city" },
  { category: "dialysis", taxonomy: "End-Stage Renal Disease", pattern: /end-stage renal|dialysis/i, primaryOnly: true, scope: "city" },
  { category: "pharmacy", taxonomy: "Pharmacy", pattern: /pharmacy/i, primaryOnly: false, scope: "zip" },
  { category: "urgent-care", taxonomy: "Urgent Care", pattern: /urgent care/i, primaryOnly: false, scope: "zip" },
];

const memory = new Map<string, { at: number; records: NpiRecord[] }>();

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function locationAddress(record: NpiRecord): NpiAddress | null {
  const location = record.addresses?.find((address) => address.address_purpose === "LOCATION" && address.country_code === "US");
  return location ?? null;
}

function taxonomyText(record: NpiRecord): string | null {
  const taxonomies = record.taxonomies ?? [];
  const ordered = [...taxonomies].sort((a, b) => Number(b.primary) - Number(a.primary));
  const labels = ordered.map((item) => textOrNull(item.desc)).filter((item): item is string => Boolean(item));
  return labels.length ? labels.join("; ") : null;
}

async function queryNpi(params: Record<string, string>, taxonomy: string): Promise<NpiRecord[]> {
  const key = `${JSON.stringify(params)}|${taxonomy}`;
  const cached = memory.get(key);
  if (cached && Date.now() - cached.at < 12 * 60 * 60 * 1000) return cached.records;
  const search = new URLSearchParams({ version: "2.1", enumeration_type: "NPI-2", taxonomy_description: taxonomy, limit: "50", ...params });
  const payload = asRecord(await fetchJson(`https://npiregistry.cms.hhs.gov/api/?${search}`, 7000));
  const records = Array.isArray(payload?.results) ? payload.results as NpiRecord[] : [];
  memory.set(key, { at: Date.now(), records });
  return records;
}

function toFacility(record: NpiRecord, category: CategoryId, retrievedAt: string): Facility | null {
  const npi = String(record.number ?? "");
  if (!/^\d{10}$/.test(npi)) return null;
  if (record.basic?.status && record.basic.status !== "A") return null;
  if (category === "hospital" && record.basic?.organizational_subpart === "YES") return null;
  const address = locationAddress(record);
  if (!address) return null;
  const serviceType = taxonomyText(record);
  const query = QUERIES.find((item) => item.category === category);
  const taxonomies = record.taxonomies ?? [];
  const primary = taxonomies.find((item) => item.primary) ?? taxonomies[0];
  const considered = query?.primaryOnly ? [primary?.desc ?? ""] : taxonomies.map((item) => item.desc ?? "");
  if (query && !considered.some((desc) => query.pattern.test(desc))) return null;
  const legal = textOrNull(record.basic?.organization_name);
  const dba = textOrNull(record.other_names?.find((item) => item.type === "Doing Business As")?.organization_name ?? null);
  const name = dba ?? legal;
  if (!name) return null;
  const aka = dba && legal && dba.toLowerCase() !== legal.toLowerCase() ? legal : null;
  const zip = zipFive(address.postal_code);
  const street = [textOrNull(address.address_1), textOrNull(address.address_2)].filter(Boolean).join(", ");
  const center = zip ? zipCentroid(zip) : null;
  return {
    id: npi,
    source: "nppes",
    name,
    aka: aka && aka.toLowerCase() !== name.toLowerCase() ? aka : null,
    category,
    categories: [category],
    serviceType,
    addressLine: street || null,
    city: textOrNull(address.city),
    state: textOrNull(address.state),
    postalCode: textOrNull(address.postal_code),
    phone: formatPhone(address.telephone_number),
    intakePhone: null,
    hotlinePhone: null,
    website: null,
    hours: null,
    latitude: null,
    longitude: null,
    coordinateNote: null,
    distanceMiles: null,
    distanceApproximate: Boolean(center),
    sourceName: "CMS National Plan and Provider Enumeration System",
    sourceUrl: "https://npiregistry.cms.hhs.gov/",
    sourceRecordUrl: `https://npiregistry.cms.hhs.gov/provider-view/${npi}`,
    sourceRecordId: npi,
    retrievedAt,
    services: [],
    facts: [
      { label: "NPI", value: npi },
      { label: "NPPES record updated", value: textOrNull(record.basic?.last_updated ?? null) },
      { label: "Practice location note", value: "This is the practice location published in NPPES. Call the provider to confirm where patients are seen." },
      { label: "Daily opening hours", value: null },
      { label: "Website", value: null },
    ],
    ...(center ? { latitude: null, longitude: null } : {}),
  };
}

async function runPool<T>(items: T[], size: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  async function run(): Promise<void> {
    while (index < items.length) {
      const current = index;
      index += 1;
      await worker(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => run()));
}

export async function searchNppes(latitude: number, longitude: number, radiusMiles: number): Promise<Facility[]> {
  const retrievedAt = new Date().toISOString();
  const zips = nearbyZips(latitude, longitude, radiusMiles, 4);
  const cities = nearbyCities(latitude, longitude, radiusMiles);
  const jobs = [
    ...zips.flatMap((zip) => QUERIES.filter((query) => query.scope === "zip").map((query) => ({ params: { postal_code: zip }, query }))),
    ...cities.flatMap((city) => QUERIES.filter((query) => query.scope === "city").map((query) => ({
      params: { city: city.city.toUpperCase(), state: city.state },
      query,
    }))),
  ];
  if (!jobs.length) return [];
  const batches: { category: CategoryId; records: NpiRecord[] }[] = [];
  let failures = 0;
  await runPool(jobs, 6, async (job) => {
    try {
      const records = await queryNpi(job.params, job.query.taxonomy);
      batches.push({ category: job.query.category, records });
    } catch {
      failures += 1;
    }
  });
  if (failures === jobs.length) throw new Error("The NPPES registry is unavailable.");
  const facilities = new Map<string, Facility>();
  for (const batch of batches) {
    for (const record of batch.records) {
      const facility = toFacility(record, batch.category, retrievedAt);
      if (!facility) continue;
      const zip = zipFive(facility.postalCode);
      const center = zip ? zipCentroid(zip) : null;
      if (!center) continue;
      const miles = milesBetween(latitude, longitude, center.latitude, center.longitude);
      if (miles > radiusMiles) continue;
      facility.distanceMiles = Math.round(miles * 10) / 10;
      facility.distanceApproximate = true;
      const existing = facilities.get(facility.id);
      if (!existing) facilities.set(facility.id, facility);
      else if (!existing.categories.includes(batch.category)) existing.categories.push(batch.category);
    }
  }
  return [...facilities.values()];
}

export async function geocodeNearest(facilities: Facility[], latitude: number, longitude: number, radiusMiles: number): Promise<void> {
  const pending = facilities
    .filter((facility) => facility.source === "nppes" && facility.addressLine && facility.city && facility.state)
    .sort((a, b) => (a.distanceMiles ?? 999) - (b.distanceMiles ?? 999))
    .slice(0, 8);
  await Promise.all(pending.map(async (facility) => {
    const query = [facility.addressLine, facility.city, facility.state, zipFive(facility.postalCode)].filter(Boolean).join(", ");
    try {
      const match = await geocodeAddress(query);
      if (!match) return;
      const miles = milesBetween(latitude, longitude, match.latitude, match.longitude);
      if (miles > radiusMiles + 1) return;
      facility.latitude = match.latitude;
      facility.longitude = match.longitude;
      facility.distanceMiles = Math.round(miles * 10) / 10;
      facility.distanceApproximate = false;
      facility.coordinateNote = "Coordinates from the U.S. Census Bureau geocoder for the NPPES practice-location address";
    } catch {
      /* The list still shows the published address without a map pin. */
    }
  }));
}

export async function getNppes(npi: string): Promise<Facility | null> {
  if (!/^\d{10}$/.test(npi)) return null;
  const payload = asRecord(await fetchJson(`https://npiregistry.cms.hhs.gov/api/?version=2.1&number=${npi}`, 7000));
  const record = (Array.isArray(payload?.results) ? payload.results[0] : null) as NpiRecord | null;
  if (!record) return null;
  const serviceType = taxonomyText(record) ?? "";
  const category = QUERIES.find((query) => query.pattern.test(serviceType))?.category ?? "hospital";
  const facility = toFacility(record, category, new Date().toISOString());
  if (!facility) return null;
  const query = [facility.addressLine, facility.city, facility.state, zipFive(facility.postalCode)].filter(Boolean).join(", ");
  try {
    const match = query ? await geocodeAddress(query) : null;
    if (match) {
      facility.latitude = match.latitude;
      facility.longitude = match.longitude;
      facility.coordinateNote = "Coordinates from the U.S. Census Bureau geocoder for the NPPES practice-location address";
    }
  } catch {
    /* Detail still shows the published address. */
  }
  return facility;
}

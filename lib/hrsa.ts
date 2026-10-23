import { readFileSync } from "node:fs";
import path from "node:path";
import { formatPhone, fullAddress, publishCoordinates, textOrNull, websiteHref } from "@/lib/format";
import { milesBetween } from "@/lib/geo";
import type { Facility } from "@/lib/types";

type HrsaSite = {
  id: string;
  name: string | null;
  grantee: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  website: string | null;
  lat: number | null;
  lon: number | null;
  hoursPerWeek: string | null;
  setting: string | null;
  locationKind: string | null;
  schedule: string | null;
  calendar: string | null;
  program: string | null;
  npi: string | null;
  withheld: boolean;
};

type HrsaFile = {
  source: string;
  publisher: string;
  url: string;
  retrievedAt: string;
  fileLastModified: string | null;
  count: number;
  sites: HrsaSite[];
};

let file: HrsaFile | null = null;

export function hrsaFile(): HrsaFile {
  if (!file) {
    file = JSON.parse(readFileSync(path.join(process.cwd(), "data", "hrsa-sites.json"), "utf8")) as HrsaFile;
  }
  return file;
}

function published(value: string | null): string | null {
  if (!value) return null;
  return /^(unknown|n\/a|na|none|not available|null)$/i.test(value.trim()) ? null : value;
}

function hoursText(site: HrsaSite): string | null {
  const parts = [
    site.hoursPerWeek && published(site.hoursPerWeek) ? `${published(site.hoursPerWeek)} hours per week reported by HRSA` : null,
    published(site.schedule) ? `Schedule reported by HRSA: ${published(site.schedule)}` : null,
    published(site.calendar) ? `Calendar reported by HRSA: ${published(site.calendar)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(". ") : null;
}

export function hrsaFacility(site: HrsaSite, origin: { latitude: number; longitude: number } | null): Facility {
  const data = hrsaFile();
  const coords = publishCoordinates(site.address, site.zip, site.lat, site.lon);
  const distance = origin && coords.latitude !== null && coords.longitude !== null
    ? milesBetween(origin.latitude, origin.longitude, coords.latitude, coords.longitude)
    : null;
  const npi = textOrNull(site.npi);
  return {
    id: site.id,
    source: "hrsa",
    name: site.name ?? "Health center site",
    aka: site.grantee && site.grantee !== site.name ? site.grantee : null,
    category: "health-center",
    categories: ["health-center"],
    serviceType: site.program,
    addressLine: site.withheld ? null : site.address,
    city: site.city,
    state: site.state,
    postalCode: site.withheld ? null : site.zip,
    phone: formatPhone(site.phone),
    intakePhone: null,
    hotlinePhone: null,
    website: websiteHref(site.website) ? site.website : textOrNull(site.website),
    hours: hoursText(site),
    latitude: coords.latitude,
    longitude: coords.longitude,
    coordinateNote: coords.latitude === null
      ? null
      : "Coordinates published by HRSA",
    distanceMiles: distance === null ? null : Math.round(distance * 10) / 10,
    distanceApproximate: false,
    sourceName: data.publisher,
    sourceUrl: data.url,
    sourceRecordUrl: npi ? `https://npiregistry.cms.hhs.gov/provider-view/${npi}` : "https://findahealthcenter.hrsa.gov/",
    sourceRecordId: site.id,
    retrievedAt: data.retrievedAt,
    services: [],
    facts: [
      { label: "HRSA program", value: site.program },
      { label: "Location type", value: published(site.locationKind) },
      { label: "Setting reported by HRSA", value: published(site.setting) },
      { label: "Daily opening hours", value: null },
      { label: "NPI on the HRSA record", value: npi },
    ],
  };
}

export function searchHrsa(latitude: number, longitude: number, radiusMiles: number): Facility[] {
  const origin = { latitude, longitude };
  const found: Facility[] = [];
  for (const site of hrsaFile().sites) {
    if (site.lat === null || site.lon === null) continue;
    const miles = milesBetween(latitude, longitude, site.lat, site.lon);
    if (miles <= radiusMiles) found.push(hrsaFacility(site, origin));
  }
  return found;
}

export function getHrsa(id: string): Facility | null {
  const site = hrsaFile().sites.find((item) => item.id === id);
  return site ? hrsaFacility(site, null) : null;
}

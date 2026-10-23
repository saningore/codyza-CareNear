import { readFileSync } from "node:fs";
import path from "node:path";
import { milesBetween } from "@/lib/geo";

type ZctaFile = {
  source: string;
  url: string;
  retrievedAt: string;
  centroids: Record<string, [number, number]>;
};

type Place = { s: string; n: string; lat: number; lon: number; a: number; cdp: boolean };
type PlaceFile = { source: string; url: string; retrievedAt: string; places: Place[] };

let zctaFile: ZctaFile | null = null;
let placeFile: PlaceFile | null = null;

function readJson<T>(name: string): T {
  const file = path.join(process.cwd(), "data", name);
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

export function zctaData(): ZctaFile {
  zctaFile ??= readJson<ZctaFile>("zcta.json");
  return zctaFile;
}

export function placeData(): PlaceFile {
  placeFile ??= readJson<PlaceFile>("places.json");
  return placeFile;
}

export function zipCentroid(zip: string): { latitude: number; longitude: number } | null {
  const point = zctaData().centroids[zip];
  if (!point) return null;
  return { latitude: point[0], longitude: point[1] };
}

export function nearbyZips(latitude: number, longitude: number, radiusMiles: number, limit: number): string[] {
  const centroids = zctaData().centroids;
  const matches: { zip: string; miles: number }[] = [];
  for (const [zip, point] of Object.entries(centroids)) {
    const miles = milesBetween(latitude, longitude, point[0], point[1]);
    if (miles <= radiusMiles) matches.push({ zip, miles });
  }
  matches.sort((a, b) => a.miles - b.miles);
  return matches.slice(0, limit).map((match) => match.zip);
}

export type PlaceMatch = Place & { label: string };

export function nearbyCities(latitude: number, longitude: number, radiusMiles: number): { city: string; state: string }[] {
  let closest: Place & { miles: number } | null = null;
  let largest: Place & { miles: number } | null = null;
  for (const place of placeData().places) {
    const miles = milesBetween(latitude, longitude, place.lat, place.lon);
    if (miles > Math.max(radiusMiles, 20)) continue;
    if (!closest || miles < closest.miles) closest = { ...place, miles };
    if (!place.cdp && place.a >= 8 && (!largest || place.a > largest.a)) largest = { ...place, miles };
  }
  const picked = [closest, largest].filter((place): place is Place & { miles: number } => Boolean(place));
  const unique = new Map<string, { city: string; state: string }>();
  for (const place of picked) unique.set(`${place.s}|${place.n.toUpperCase()}`, { city: place.n, state: place.s });
  return [...unique.values()];
}

export function searchPlaces(query: string, limit = 6): PlaceMatch[] {
  const trimmed = query.trim().replace(/\s+/g, " ");
  if (trimmed.length < 3) return [];
  const comma = trimmed.match(/^(.+?),\s*([A-Za-z .]+)$/);
  const nameQuery = (comma ? comma[1] : trimmed).toUpperCase();
  const stateQuery = comma ? comma[2].trim().toUpperCase() : null;
  if (nameQuery.length < 3) return [];
  const matches = placeData().places.filter((place) => {
    if (stateQuery && place.s !== stateQuery && !place.s.startsWith(stateQuery)) return false;
    return place.n.toUpperCase().startsWith(nameQuery);
  });
  matches.sort((a, b) => b.a - a.a || a.n.localeCompare(b.n));
  return matches.slice(0, limit).map((place) => ({
    ...place,
    label: place.cdp ? `${place.n} (census designated place), ${place.s}` : `${place.n}, ${place.s}`,
  }));
}

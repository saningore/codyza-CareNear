export const CATEGORIES = [
  { id: "health-center", label: "Community health centers" },
  { id: "hospital", label: "Hospitals" },
  { id: "nursing-home", label: "Nursing homes" },
  { id: "dialysis", label: "Dialysis" },
  { id: "mental-health", label: "Mental health" },
  { id: "substance-use", label: "Substance use treatment" },
  { id: "pharmacy", label: "Pharmacies" },
  { id: "urgent-care", label: "Urgent care" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export type SourceId = "hrsa" | "samhsa" | "nppes";

export type Fact = { label: string; value: string | null };

export type Facility = {
  id: string;
  source: SourceId;
  name: string;
  aka: string | null;
  category: CategoryId;
  categories: CategoryId[];
  serviceType: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  phone: string | null;
  intakePhone: string | null;
  hotlinePhone: string | null;
  website: string | null;
  hours: string | null;
  latitude: number | null;
  longitude: number | null;
  coordinateNote: string | null;
  distanceMiles: number | null;
  distanceApproximate: boolean;
  sourceName: string;
  sourceUrl: string;
  sourceRecordUrl: string | null;
  sourceRecordId: string | null;
  retrievedAt: string;
  facts: Fact[];
  services: string[];
};

export type SearchOrigin = {
  label: string;
  latitude: number;
  longitude: number;
  precision: "zip-center" | "place" | "address" | "device";
  state: string | null;
};

export type SourceWarning = { source: string; message: string };

export type SearchResponse = {
  origin: SearchOrigin;
  facilities: Facility[];
  warnings: SourceWarning[];
  capped: boolean;
  counts: Record<CategoryId, number>;
};

export const UNAVAILABLE = "Information unavailable";

export function categoryLabel(id: CategoryId): string {
  return CATEGORIES.find((category) => category.id === id)?.label ?? id;
}

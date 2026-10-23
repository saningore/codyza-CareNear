import { directionsHref, formatMiles, formatPhone, fullAddress, show, telHref, websiteHref } from "@/lib/format";
import { categoryLabel, UNAVAILABLE, type Facility } from "@/lib/types";

export function FactList({ facility, detailed = false }: { facility: Facility; detailed?: boolean }) {
  const address = fullAddress(facility);
  const directions = directionsHref(facility.latitude, facility.longitude, address);
  const phone = formatPhone(facility.phone);
  const phoneHref = telHref(facility.phone);
  const site = websiteHref(facility.website);
  const rows: { label: string; value: string; href?: string }[] = [
    { label: "Address", value: show(address) },
    {
      label: "Distance",
      value: formatMiles(facility.distanceMiles, facility.distanceApproximate) ?? UNAVAILABLE,
    },
    { label: "Phone", value: show(phone), href: phoneHref ?? undefined },
    { label: "Website", value: show(facility.website), href: site ?? undefined },
    { label: "Service type", value: show(facility.serviceType) },
    { label: "Hours", value: show(facility.hours) },
    { label: "Map location", value: facility.latitude === null ? UNAVAILABLE : "Coordinates confirmed" },
    { label: "Directions", value: directions ? "Open directions" : UNAVAILABLE, href: directions ?? undefined },
    { label: "Source", value: facility.sourceName, href: facility.sourceUrl },
  ];
  return (
    <dl className="space-y-2 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[7.5rem_1fr] gap-2">
          <dt className="font-bold text-ink/70">{row.label}</dt>
          <dd>
            {row.href && row.value !== UNAVAILABLE ? (
              <a className="font-bold text-teal underline underline-offset-2" href={row.href} target={row.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">{row.value}</a>
            ) : (
              <span className={row.value === UNAVAILABLE ? "text-ink/55" : undefined}>{row.value}</span>
            )}
            {detailed && row.label === "Distance" && facility.distanceApproximate && facility.distanceMiles !== null && (
              <span className="mt-1 block text-ink/60">Measured from the facility ZIP code center, not a confirmed door.</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function categoryText(facility: Facility): string {
  return facility.categories.map(categoryLabel).join(" · ");
}

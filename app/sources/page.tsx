import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sources" };

const sources = [
  {
    name: "HRSA health center sites",
    href: "https://data.hrsa.gov/topics/health-centers",
    detail: "The daily Health Center Service Delivery and Look-Alike Sites file. CareNear keeps active service delivery sites, including the address, phone, website, weekly hours, and coordinates HRSA published. Street addresses HRSA left blank are not mapped.",
  },
  {
    name: "SAMHSA FindTreatment.gov",
    href: "https://findtreatment.gov/",
    detail: "Live locator results for mental health and substance use treatment. Service names on a record are the services that facility reported to SAMHSA.",
  },
  {
    name: "CMS NPPES",
    href: "https://npiregistry.cms.hhs.gov/api-page",
    detail: "Organizational NPI records for hospitals, skilled nursing facilities, dialysis providers, pharmacies, and urgent care. Hospitals and nursing homes are included when that is the record’s primary taxonomy. A published doing-business-as name is shown when NPPES has one. CareNear uses the practice location, not the mailing address. A map pin is added only after the U.S. Census Bureau geocoder matches that address.",
  },
  {
    name: "U.S. Census Bureau",
    href: "https://geocoding.geo.census.gov/geocoder/",
    detail: "Street-address matching, and the 2025 Gazetteer for ZIP Code Tabulation Area centers and place locations. A ZIP search is labeled as distance from the ZIP code center.",
  },
];

export default function SourcesPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-serif text-4xl font-semibold">Where the information comes from</h1>
      <p className="mt-4 text-lg text-ink/80">Each listing names its publisher and the date CareNear retrieved it. Open the original record from the listing when a direct link is available.</p>
      <ul className="mt-8 space-y-4">
        {sources.map((source) => (
          <li key={source.name} className="rounded-3xl border border-line bg-card p-5">
            <h2 className="font-serif text-2xl font-semibold"><a className="underline decoration-teal/40 underline-offset-4" href={source.href}>{source.name}</a></h2>
            <p className="mt-2 text-ink/80">{source.detail}</p>
          </li>
        ))}
      </ul>
      <h2 className="mt-10 font-serif text-2xl font-semibold">What CareNear does not fill in</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-ink/80">
        <li>Star ratings, prices, or whether a provider is accepting patients.</li>
        <li>A daily opening schedule, unless the source text already contains one. HRSA weekly hours stay labeled as weekly hours.</li>
        <li>A map pin when the address was withheld or the Census geocoder could not match it.</li>
        <li>Individual clinicians. This version lists organizational locations.</li>
      </ul>
    </article>
  );
}

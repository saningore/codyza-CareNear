import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { FactList, categoryText } from "@/components/FactList";
import { directionsHref, fullAddress, show, telHref, websiteHref } from "@/lib/format";
import { getFacility, isSource } from "@/lib/search";
import { UNAVAILABLE } from "@/lib/types";

export const dynamic = "force-dynamic";

const loadFacility = cache((source: string, id: string) => getFacility(source, id));

export async function generateMetadata({ params }: { params: Promise<{ source: string; id: string }> }): Promise<Metadata> {
  const { source, id } = await params;
  if (!isSource(source)) return { title: "Record" };
  const facility = await loadFacility(source, id).catch(() => null);
  return { title: facility?.name ?? "Record" };
}

export default async function FacilityPage({ params }: { params: Promise<{ source: string; id: string }> }) {
  const { source, id } = await params;
  if (!isSource(source)) notFound();
  const facility = await loadFacility(source, id).catch(() => null);
  if (!facility) notFound();
  const address = fullAddress(facility);
  const directions = directionsHref(facility.latitude, facility.longitude, address);
  const phoneHref = telHref(facility.phone);
  const site = websiteHref(facility.website);

  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      <Link className="text-sm font-bold text-teal underline" href="/">Back to search</Link>
      <p className="mt-4 text-sm font-bold uppercase tracking-wide text-teal">{categoryText(facility)}</p>
      <h1 className="mt-1 font-serif text-4xl font-semibold leading-tight">{facility.name}</h1>
      {facility.aka && <p className="mt-2 text-ink/75">Also listed as {facility.aka}</p>}
      <p className="mt-4 rounded-2xl bg-moss px-4 py-3 text-sm">CareNear lists public records. It does not diagnose conditions or recommend a provider as medically best. Call the location to confirm services before you visit.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {phoneHref ? <a className="rounded-full bg-teal px-4 py-2 font-bold text-card" href={phoneHref}>Call {facility.phone}</a> : <span className="rounded-full bg-line px-4 py-2 text-sm">Call: {UNAVAILABLE}</span>}
        {site ? <a className="rounded-full border border-teal px-4 py-2 font-bold text-teal" href={site} target="_blank" rel="noopener noreferrer">Website</a> : <span className="rounded-full border border-line px-4 py-2 text-sm">Website: {UNAVAILABLE}</span>}
        {directions ? <a className="rounded-full border border-teal px-4 py-2 font-bold text-teal" href={directions} target="_blank" rel="noopener noreferrer">Get directions</a> : <span className="rounded-full border border-line px-4 py-2 text-sm">Directions: {UNAVAILABLE}</span>}
      </div>
      <div className="mt-6 rounded-3xl border border-line bg-card p-5">
        <FactList facility={facility} detailed />
        {facility.coordinateNote && <p className="mt-3 text-sm text-ink/70">{facility.coordinateNote}</p>}
      </div>
      <section className="mt-6">
        <h2 className="font-serif text-2xl font-semibold">Published details</h2>
        <dl className="mt-3 space-y-2">
          {facility.facts.map((fact) => (
            <div key={fact.label} className="grid gap-1 border-b border-line py-2 sm:grid-cols-[16rem_1fr]">
              <dt className="font-bold text-ink/70">{fact.label}</dt>
              <dd className={fact.value ? undefined : "text-ink/55"}>{show(fact.value)}</dd>
            </div>
          ))}
          <div className="grid gap-1 border-b border-line py-2 sm:grid-cols-[16rem_1fr]">
            <dt className="font-bold text-ink/70">Source record</dt>
            <dd>{facility.sourceRecordUrl ? <a className="font-bold text-teal underline" href={facility.sourceRecordUrl} target="_blank" rel="noopener noreferrer">{facility.source === "nppes" ? `NPI ${facility.sourceRecordId}` : "Open the original record"}</a> : UNAVAILABLE}</dd>
          </div>
        </dl>
      </section>
      <section className="mt-6">
        <h2 className="font-serif text-2xl font-semibold">Services reported by the source</h2>
        {facility.services.length ? (
          <ul className="mt-3 list-disc space-y-1 pl-5">{facility.services.map((service) => <li key={service}>{service}</li>)}</ul>
        ) : <p className="mt-3 text-ink/55">{UNAVAILABLE}</p>}
      </section>
      <p className="mt-6 text-sm text-ink/60">Source: {facility.sourceName}. Retrieved {new Date(facility.retrievedAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}.</p>
    </article>
  );
}

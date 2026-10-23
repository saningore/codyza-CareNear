import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-serif text-4xl font-semibold">About CareNear</h1>
      <div className="mt-4 space-y-4 text-lg leading-relaxed text-ink/85">
        <p>CareNear helps people find healthcare locations that government agencies have already published. A search uses your current location, or a ZIP code, city, or street address you type.</p>
        <p>The site lists the name, address, distance, phone, website, service type, map location, directions, and source when that information is in the record. If a field is missing, the page says “Information unavailable.”</p>
        <p>CareNear does not diagnose symptoms, estimate prices, or describe one provider as medically best. A CMS or SAMHSA record is shown as that agency published it. Call the provider, or 911 in an emergency, before you rely on a listing.</p>
        <p>For help paying for care or finding insurance, visit <a className="font-bold text-teal underline" href="https://www.healthcare.gov/">HealthCare.gov</a> or call <a className="font-bold text-teal underline" href="https://www.211.org/">211</a>.</p>
        <p><Link className="font-bold text-teal underline" href="/sources">See the data sources</Link> or <Link className="font-bold text-teal underline" href="/">search for care</Link>.</p>
      </div>
    </article>
  );
}

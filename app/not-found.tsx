import Link from "next/link";

export default function NotFound() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="font-serif text-4xl font-semibold">That page is not available</h1>
      <p className="mt-3 text-lg">The address may be out of date. Search again for a current public record.</p>
      <Link className="mt-6 inline-flex rounded-full bg-teal px-5 py-3 font-bold text-card" href="/">Find care</Link>
    </article>
  );
}

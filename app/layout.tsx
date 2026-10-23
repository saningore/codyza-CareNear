import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Fraunces } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";

const sans = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-atkinson",
});

const serif = Fraunces({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-fraunces",
});

export const metadata: Metadata = {
  title: { default: "CareNear", template: "%s · CareNear" },
  description: "Find real healthcare services near a U.S. location using public HRSA, SAMHSA, and CMS records.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <a className="skip-link" href="#main">Skip to content</a>
        <div className="bg-clay px-4 py-2 text-center text-sm font-bold text-white">
          If this is an emergency, call 911. CareNear does not provide medical advice.
        </div>
        <header className="border-b border-line bg-card">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
            <Link href="/" className="group flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-teal text-card" aria-hidden="true">
                <svg viewBox="0 0 32 32" className="h-7 w-7"><path fill="currentColor" d="M16 4.5c-4.4 0-8 3.4-8 7.8 0 5.8 8 14.2 8 14.2s8-8.4 8-14.2c0-4.4-3.6-7.8-8-7.8zm0 10.6a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6z"/></svg>
              </span>
              <span>
                <span className="block font-serif text-2xl font-semibold leading-none tracking-tight">CareNear</span>
                <span className="text-sm text-ink/70">Find real healthcare services near you</span>
              </span>
            </Link>
            <nav className="flex gap-2 text-sm font-bold" aria-label="Primary">
              <Link className="rounded-full px-3 py-2 hover:bg-moss focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal" href="/">Find care</Link>
              <Link className="rounded-full px-3 py-2 hover:bg-moss focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal" href="/sources">Sources</Link>
              <Link className="rounded-full px-3 py-2 hover:bg-moss focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal" href="/about">About</Link>
            </nav>
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="mt-16 border-t border-line px-4 py-8 text-center text-sm">
          <p className="font-bold">
            Powered by <a className="text-teal underline underline-offset-2" href="https://codyza.com" target="_blank" rel="noopener noreferrer">Codyza</a>
          </p>
          <p className="mt-2 text-ink/70">Public records only. CareNear does not rank a provider as medically best.</p>
        </footer>
      </body>
    </html>
  );
}

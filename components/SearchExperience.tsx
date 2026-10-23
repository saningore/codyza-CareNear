"use client";

import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ResultsMap from "@/components/ResultsMap";
import { categoryText, FactList } from "@/components/FactList";
import { facilityKey, hasCoordinates } from "@/lib/map-points";
import { CATEGORIES, type CategoryId, type Facility, type SearchOrigin, type SearchResponse } from "@/lib/types";

type Suggestion = { label: string; latitude: number; longitude: number; precision: SearchOrigin["precision"]; state: string | null };

const RADII = [5, 10, 25, 50];

export default function SearchExperience() {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [radius, setRadius] = useState(25);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [origin, setOrigin] = useState<SearchOrigin | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [selected, setSelected] = useState<CategoryId[]>(CATEGORIES.map((category) => category.id));
  const [phase, setPhase] = useState<"idle" | "searching">("idle");
  const [error, setError] = useState("");
  const [view, setView] = useState<"map" | "list">("list");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<"map" | "list" | null>(null);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [frameKey, setFrameKey] = useState("");
  const pendingAccuracy = useRef<number | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 3) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/geocode?suggest=1&q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
        const payload = await response.json();
        if (!controller.signal.aborted) setSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions : []);
      } catch {
        if (!controller.signal.aborted) setSuggestions([]);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  async function searchAt(next: SearchOrigin, nextRadius = radius) {
    setPhase("searching");
    setError("");
    setOrigin(next);
    setOpen(false);
    setActiveId(null);
    setActiveSource(null);
    try {
      const params = new URLSearchParams({
        lat: String(next.latitude),
        lon: String(next.longitude),
        radius: String(nextRadius),
        precision: next.precision,
        label: next.label,
      });
      if (next.state) params.set("state", next.state);
      const response = await fetch(`/api/facilities?${params}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Healthcare records are temporarily unavailable. Try again in a few minutes.");
      setResult(payload as SearchResponse);
      setAccuracyMeters(next.precision === "device" ? pendingAccuracy.current : null);
      if (next.precision !== "device") pendingAccuracy.current = null;
      setFrameKey(`${next.latitude.toFixed(5)}:${next.longitude.toFixed(5)}:${nextRadius}:${next.precision}:${Date.now()}`);
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "Healthcare records are temporarily unavailable. Try again in a few minutes.");
    } finally {
      setPhase("idle");
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (active >= 0 && suggestions[active]) {
      const suggestion = suggestions[active];
      setQuery(suggestion.label);
      await searchAt(suggestion);
      return;
    }
    setPhase("searching");
    setError("");
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "That location could not be found. Try a street address or another ZIP code.");
      setQuery(payload.label);
      await searchAt(payload as SearchOrigin);
    } catch (caught) {
      setPhase("idle");
      setResult(null);
      setError(caught instanceof Error ? caught.message : "That location could not be found. Try a street address or another ZIP code.");
    }
  }

  function locate() {
    if (!navigator.geolocation) {
      setError("Location permission was not granted. Enter a ZIP code or address.");
      return;
    }
    setPhase("searching");
    setError("");
    navigator.geolocation.getCurrentPosition(async (position) => {
      pendingAccuracy.current = Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null;
      await searchAt({
        label: "Your current location",
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        precision: "device",
        state: null,
      });
    }, () => {
      setPhase("idle");
      setError("Location permission was not granted. Enter a ZIP code or address.");
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  }

  function toggle(category: CategoryId) {
    setSelected((current) => current.includes(category) ? current.filter((item) => item !== category) : [...current, category]);
  }

  const facilities = useMemo(
    () => (result?.facilities ?? []).filter((facility) => facility.categories.some((category) => selected.includes(category))),
    [result, selected],
  );
  const counts = result?.counts;

  useEffect(() => {
    if (!activeId) return;
    if (!facilities.some((facility) => facilityKey(facility) === activeId)) {
      setActiveId(null);
      setActiveSource(null);
    }
  }, [facilities, activeId]);

  useEffect(() => {
    if (activeSource !== "map" || !activeId) return;
    const card = document.querySelector(`[data-facility-key="${CSS.escape(activeId)}"]`);
    if (!(card instanceof HTMLElement) || card.getClientRects().length === 0) return;
    card.scrollIntoView({ block: "nearest" });
  }, [activeId, activeSource]);

  function highlight(id: string | null, source: "map" | "list") {
    setActiveSource(id ? source : null);
    setActiveId(id);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <section className="max-w-3xl">
        <h1 className="font-serif text-4xl font-semibold tracking-tight md:text-5xl">Find care that is published in public records.</h1>
        <p className="mt-3 max-w-2xl text-lg text-ink/80">Search a U.S. ZIP code, city, or address. CareNear lists health centers, hospitals, and treatment locations from HRSA, SAMHSA, and CMS. It does not invent phone numbers, hours, or ratings.</p>
      </section>

      <form onSubmit={onSubmit} className="mt-6 rounded-3xl border border-line bg-card p-4 shadow-sm" role="search">
        <label htmlFor="place" className="text-sm font-bold">ZIP code, city, or street address</label>
        <div className="mt-2 flex flex-col gap-2 md:flex-row">
          <div className="relative flex-1">
            <input
              id="place"
              role="combobox"
              aria-expanded={open && suggestions.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
              className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
              placeholder="10001 or Chicago, IL"
              value={query}
              autoComplete="off"
              maxLength={200}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(-1); }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
                if (!suggestions.length) return;
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((index) => event.key === "ArrowDown" ? (index + 1) % suggestions.length : (index <= 0 ? suggestions.length - 1 : index - 1));
                }
              }}
            />
            {open && suggestions.length > 0 && (
              <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-2xl border border-line bg-card p-1 shadow-lg">
                {suggestions.map((suggestion, index) => (
                  <li key={`${suggestion.label}-${index}`} id={`${listId}-${index}`} role="option" aria-selected={active === index}>
                    <button
                      type="button"
                      className={`w-full rounded-xl px-3 py-2 text-left ${active === index ? "bg-moss" : "hover:bg-moss"}`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setQuery(suggestion.label);
                        void searchAt(suggestion);
                      }}
                    >{suggestion.label}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <label className="sr-only" htmlFor="radius">Search radius</label>
          <select id="radius" value={radius} onChange={(event) => {
            const next = Number(event.target.value);
            setRadius(next);
            if (origin) void searchAt(origin, next);
          }} className="rounded-2xl border border-line bg-paper px-3 py-3 font-bold focus-visible:outline-2 focus-visible:outline-teal">
            {RADII.map((miles) => <option key={miles} value={miles}>{miles} miles</option>)}
          </select>
          <button type="submit" className="rounded-2xl bg-teal px-5 py-3 font-bold text-card hover:bg-pine focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:opacity-60" disabled={phase === "searching"}>
            {phase === "searching" ? "Searching…" : "Search"}
          </button>
          <button type="button" onClick={locate} className="rounded-2xl border border-teal px-4 py-3 font-bold text-teal hover:bg-moss focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal">
            Use my location
          </button>
        </div>
        <p className="mt-3 text-sm text-ink/70">A ZIP search measures distance from the center of that ZIP code. Street addresses use the U.S. Census Bureau geocoder.</p>
      </form>

      {phase === "searching" && (
        <p role="status" className="mt-4 flex items-center gap-3 rounded-2xl bg-moss px-4 py-3 font-bold text-pine">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-teal/30 border-t-teal motion-reduce:animate-none" aria-hidden="true" />
          Searching public health records…
        </p>
      )}
      {error && (
        <div role="alert" className="mt-4 rounded-2xl border border-clay/30 bg-amber px-4 py-3">
          <p>{error}</p>
          {origin && <button type="button" className="mt-2 font-bold underline" onClick={() => void searchAt(origin)}>Retry</button>}
        </div>
      )}

      {!origin && !error && phase === "idle" && (
        <p className="mt-8 rounded-3xl border border-dashed border-line bg-card px-5 py-8 text-ink/75">Search a place to see healthcare locations. The map stays empty until you do.</p>
      )}

      {result && (
        <>
          <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Healthcare categories">
            {CATEGORIES.map((category) => {
              const total = counts?.[category.id] ?? 0;
              const shown = (result.facilities ?? []).filter((facility) => facility.categories.includes(category.id)).length;
              return (
                <button key={category.id} type="button" aria-pressed={selected.includes(category.id)} onClick={() => toggle(category.id)} className={`rounded-full border px-3 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal ${selected.includes(category.id) ? "border-teal bg-teal text-card" : "border-line bg-card"}`}>
                  {category.label} <span className="font-normal">({total > shown ? `${shown} of ${total}` : total})</span>
                </button>
              );
            })}
          </div>
          <p role="status" className="mt-4 text-sm">
            {facilities.length} {facilities.length === 1 ? "listing" : "listings"} within {radius} miles of {result.origin.label}.
            {result.origin.precision === "zip-center" ? " Distances are measured from the center of this ZIP code." : " Distances are measured from this search location."}
            {result.capped ? " Showing the 100 nearest listings." : ""}
          </p>
          {result.warnings.map((warning) => (
            <p key={warning.source} role="status" className="mt-2 rounded-2xl border border-clay/30 bg-amber px-4 py-3 text-sm">{warning.message}</p>
          ))}
          {!facilities.length && phase === "idle" && (
            <p className="mt-4 rounded-2xl bg-card px-4 py-4">No listed facilities in the selected categories within {radius} miles. Try a larger distance or another category.</p>
          )}
          <div className="mt-4 flex gap-2 md:hidden" role="group" aria-label="Choose map or list">
            {(["list", "map"] as const).map((item) => (
              <button key={item} type="button" aria-pressed={view === item} onClick={() => setView(item)} className={`rounded-full px-4 py-2 text-sm font-bold ${view === item ? "bg-teal text-card" : "border border-line bg-card"}`}>
                {item === "list" ? "List" : "Map"}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
            <div className={view === "list" ? "hidden lg:block" : "block"}>
              <ResultsMap
                origin={result.origin}
                facilities={facilities}
                frameKey={frameKey}
                accuracyMeters={accuracyMeters}
                activeId={activeId}
                activeSource={activeSource}
                onActiveId={(id) => highlight(id, "map")}
              />
              <p className="mt-2 text-xs text-ink/60">Map tiles © OpenStreetMap contributors, via OpenFreeMap.</p>
            </div>
            <section aria-busy={phase === "searching"} className={`max-h-[560px] space-y-3 overflow-auto pr-1 ${view === "map" ? "hidden lg:block" : "block"}`}>
                <h2 className="font-serif text-2xl font-semibold">Nearby listings</h2>
                {facilities.map((facility) => (
                  <ResultCard
                    key={`${facility.source}-${facility.id}`}
                    facility={facility}
                    active={facilityKey(facility) === activeId}
                    onHighlight={(next) => highlight(next ? facilityKey(facility) : null, "list")}
                    onShowOnMap={() => {
                      setView("map");
                      highlight(facilityKey(facility), "list");
                    }}
                  />
                ))}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function ResultCard({
  facility,
  active,
  onHighlight,
  onShowOnMap,
}: {
  facility: Facility;
  active: boolean;
  onHighlight: (active: boolean) => void;
  onShowOnMap: () => void;
}) {
  const pinned = hasCoordinates(facility);
  return (
    <article
      data-facility-key={facilityKey(facility)}
      data-pinned={pinned ? "true" : "false"}
      data-active={active ? "true" : "false"}
      onMouseEnter={() => onHighlight(true)}
      onMouseLeave={() => onHighlight(false)}
      onFocusCapture={() => onHighlight(true)}
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) onHighlight(false);
      }}
      className={`rounded-3xl border p-4 ${active ? "border-teal bg-moss" : "border-line bg-card"}`}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-teal">{categoryText(facility)}</p>
      <h3 className="mt-1 font-serif text-xl font-semibold leading-tight">{facility.name}</h3>
      {facility.aka && <p className="text-sm text-ink/70">Also listed as {facility.aka}</p>}
      <div className="mt-3"><FactList facility={facility} /></div>
      <p className="mt-3 text-xs text-ink/60">Retrieved {new Date(facility.retrievedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {pinned && (
          <button type="button" className="inline-flex rounded-full border border-teal px-4 py-2 text-sm font-bold text-teal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal lg:hidden" onClick={onShowOnMap}>
            Show on map
          </button>
        )}
        <Link className="inline-flex rounded-full bg-pine px-4 py-2 text-sm font-bold text-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal" href={`/facility/${facility.source}/${encodeURIComponent(facility.id)}`}>
          View record
        </Link>
      </div>
    </article>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { categoryLabel, type Facility } from "@/lib/types";

type Props = {
  origin: { latitude: number; longitude: number; label: string } | null;
  facilities: Facility[];
};

export default function ResultsMap({ origin, facilities }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let map: MapLibreMap | undefined;
    let cancelled = false;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      map = new maplibregl.Map({
        container: container.current,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: [-98.5, 39.8],
        zoom: 3,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        if (!cancelled) setReady(true);
      });
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      setReady(false);
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const markers: Marker[] = [];
    let cancelled = false;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled) return;
      const points = facilities.filter((facility): facility is Facility & { latitude: number; longitude: number } =>
        facility.latitude !== null && facility.longitude !== null);
      if (cancelled) return;
      if (origin) {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        map.flyTo({ center: [origin.longitude, origin.latitude], zoom: points.length ? 11 : 10, duration: reduced ? 0 : 700 });
      }
      for (const facility of points) {
        const link = document.createElement("a");
        link.href = `/facility/${facility.source}/${encodeURIComponent(facility.id)}`;
        link.textContent = shortMark(facility);
        link.setAttribute("aria-label", `${facility.name}, ${categoryLabel(facility.category)}`);
        link.style.cssText = "display:grid;place-items:center;min-width:34px;height:34px;padding:0 6px;border-radius:999px;background:#fffdf8;border:2px solid #0c5c56;color:#083f3b;font:700 11px/1 Atkinson Hyperlegible,sans-serif;box-shadow:0 1px 4px rgba(23,32,51,.25)";
        const popup = new maplibregl.Popup({ offset: 18, closeButton: false }).setText(`${facility.name}. ${categoryLabel(facility.category)}`);
        markers.push(new maplibregl.Marker({ element: link }).setLngLat([facility.longitude, facility.latitude]).setPopup(popup).addTo(map));
      }
    })();
    return () => {
      cancelled = true;
      markers.forEach((marker) => marker.remove());
    };
  }, [origin, facilities, ready]);

  return <div ref={container} className="h-[320px] w-full rounded-3xl border border-line bg-moss md:h-[560px]" role="region" aria-label="Map of healthcare locations" />;
}

function shortMark(facility: Facility): string {
  if (facility.categories.includes("pharmacy")) return "Rx";
  if (facility.categories.includes("health-center")) return "HC";
  if (facility.categories.includes("hospital")) return "H";
  if (facility.categories.includes("urgent-care")) return "UC";
  return "•";
}

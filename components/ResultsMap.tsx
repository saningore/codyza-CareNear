"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent, Popup } from "maplibre-gl";
import { categoryLabel } from "@/lib/types";
import type { Facility, SearchOrigin } from "@/lib/types";
import {
  accuracyCollection,
  facilityCollection,
  frameFor,
  isFacilityProperties,
  isOriginProperties,
  legendMarks,
  originCollection,
  searchPlaceLabel,
  unpinnedCount,
  type FacilityFeatureProperties,
  type MapFeatureCollection,
  type MapFrame,
} from "@/lib/map-points";

type Props = {
  origin: SearchOrigin;
  facilities: Facility[];
  frameKey: string;
  accuracyMeters: number | null;
  activeId: string | null;
  activeSource: "map" | "list" | null;
  onActiveId: (id: string | null) => void;
};

const FACILITY_LAYERS = ["facility-circle", "facility-mark"] as const;
const HIT_LAYERS = ["facility-circle", "facility-mark", "origin-circle", "clusters"] as const;

export default function ResultsMap({
  origin,
  facilities,
  frameKey,
  accuracyMeters,
  activeId,
  activeSource,
  onActiveId,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const onActiveRef = useRef(onActiveId);
  const activeIdRef = useRef(activeId);
  const activeSourceRef = useRef(activeSource);
  const originRef = useRef(origin);
  const facilitiesRef = useRef(facilities);
  const frameRef = useRef<MapFrame | null>(null);
  const fitKeyRef = useRef(frameKey);
  const appliedFitRef = useRef<string | null>(null);
  const tryFitRef = useRef<() => void>(() => {});
  const previousActiveRef = useRef<string | null>(null);
  const revealToken = useRef(0);
  const revealedId = useRef<string | null>(null);
  const stickyRef = useRef(false);
  const holdPopup = useRef(false);
  const suppressCloseRef = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [styleReady, setStyleReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [originOpen, setOriginOpen] = useState(false);
  const [mapError, setMapError] = useState("");

  onActiveRef.current = onActiveId;
  activeIdRef.current = activeId;
  activeSourceRef.current = activeSource;
  originRef.current = origin;
  facilitiesRef.current = facilities;
  fitKeyRef.current = frameKey;

  tryFitRef.current = () => {
    const map = mapRef.current;
    const element = container.current;
    const frame = frameRef.current;
    if (!map || !frame || !element || element.clientWidth < 20 || element.clientHeight < 20) return;
    if (appliedFitRef.current === fitKeyRef.current) return;
    const duration = reducedMotion() ? 0 : 700;
    if (frame.kind === "point") {
      map.easeTo({ center: [frame.longitude, frame.latitude], zoom: frame.zoom, duration });
    } else {
      map.fitBounds(
        [[frame.west, frame.south], [frame.east, frame.north]],
        { padding: 48, maxZoom: 14, duration },
      );
    }
    appliedFitRef.current = fitKeyRef.current;
  };

  useEffect(() => {
    let map: MapLibreMap | undefined;
    let popup: Popup | undefined;
    let observer: ResizeObserver | undefined;
    let cancelled = false;

    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      maplibregl.setWorkerUrl(`/api/maplibre-worker?v=${maplibregl.getVersion()}`);
      map = new maplibregl.Map({
        container: container.current,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: [-98.5, 39.8],
        zoom: 3,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      popup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: false,
        closeOnMove: false,
        focusAfterOpen: false,
        offset: 18,
        maxWidth: "280px",
        className: "care-popup",
      });
      popup.on("close", () => {
        if (suppressCloseRef.current) return;
        stickyRef.current = false;
        holdPopup.current = false;
        setOriginOpen(false);
        onActiveRef.current(null);
      });
      popup.on("open", () => {
        const element = popup?.getElement();
        if (!element || element.dataset.hoverBound === "true") return;
        element.dataset.hoverBound = "true";
        element.addEventListener("mouseenter", () => {
          holdPopup.current = true;
          if (leaveTimer.current) clearTimeout(leaveTimer.current);
        });
        element.addEventListener("mouseleave", () => {
          holdPopup.current = false;
          if (stickyRef.current) return;
          setOriginOpen(false);
          if (activeSourceRef.current === "map") onActiveRef.current(null);
        });
      });

      const clearLeave = () => {
        if (leaveTimer.current) clearTimeout(leaveTimer.current);
      };
      const scheduleLeave = (closeOrigin: boolean) => {
        clearLeave();
        leaveTimer.current = setTimeout(() => {
          const openPopup = popup?.getElement();
          if (holdPopup.current || openPopup?.matches(":hover") || stickyRef.current) return;
          if (closeOrigin) setOriginOpen(false);
          else if (activeSourceRef.current === "map") onActiveRef.current(null);
        }, 220);
      };
      const rememberPopupTarget = (event: MapLayerMouseEvent) => {
        const related = event.originalEvent instanceof MouseEvent ? event.originalEvent.relatedTarget : null;
        const element = popup?.getElement();
        return Boolean(element && related instanceof Node && element.contains(related));
      };

      const setupLayers = () => {
        if (cancelled || !map || map.getSource("facilities")) return;
        const font = symbolFont(map);
        map.addSource("accuracy", { type: "geojson", data: emptyGeoJson() });
        map.addSource("facilities", {
          type: "geojson",
          data: emptyGeoJson(),
          cluster: true,
          clusterRadius: 48,
          clusterMaxZoom: 14,
          promoteId: "key",
        });
        map.addSource("origin", { type: "geojson", data: emptyGeoJson() });
        map.addLayer({
          id: "accuracy-fill",
          type: "fill",
          source: "accuracy",
          paint: { "fill-color": "#0c5c56", "fill-opacity": 0.12 },
        });
        map.addLayer({
          id: "accuracy-line",
          type: "line",
          source: "accuracy",
          paint: { "line-color": "#0c5c56", "line-width": 1.5, "line-opacity": 0.5 },
        });
        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "facilities",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#0c5c56",
            "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 30, 26],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fffdf8",
          },
        });
        if (font) {
          map.addLayer({
            id: "cluster-count",
            type: "symbol",
            source: "facilities",
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-font": font,
              "text-size": 12,
            },
            paint: { "text-color": "#fffdf8" },
          });
        }
        map.addLayer({
          id: "facility-circle",
          type: "circle",
          source: "facilities",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": "#fffdf8",
            "circle-radius": ["case", ["boolean", ["feature-state", "active"], false], 18, 13],
            "circle-stroke-width": ["case", ["boolean", ["feature-state", "active"], false], 3, 2],
            "circle-stroke-color": "#0c5c56",
          },
        });
        if (font) {
          map.addLayer({
            id: "facility-mark",
            type: "symbol",
            source: "facilities",
            filter: ["!", ["has", "point_count"]],
            layout: {
              "text-field": ["get", "mark"],
              "text-font": font,
              "text-size": 11,
              "text-allow-overlap": true,
            },
            paint: { "text-color": "#083f3b" },
          });
        }
        map.addLayer({
          id: "origin-circle",
          type: "circle",
          source: "origin",
          paint: {
            "circle-color": "#0c5c56",
            "circle-radius": 8,
            "circle-stroke-width": 3,
            "circle-stroke-color": "#fffdf8",
          },
        });

        const facilitySource = map.getSource("facilities");
        for (const layer of FACILITY_LAYERS) {
          if (!map.getLayer(layer)) continue;
          map.on("mouseenter", layer, (event) => {
            clearLeave();
            map?.getCanvas().style.setProperty("cursor", "pointer");
            const key = eventKey(event);
            if (!key) return;
            setOriginOpen(false);
            onActiveRef.current(key);
          });
          map.on("mouseleave", layer, (event) => {
            map?.getCanvas().style.setProperty("cursor", "");
            if (rememberPopupTarget(event)) {
              holdPopup.current = true;
              return;
            }
            scheduleLeave(false);
          });
          map.on("click", layer, (event) => {
            const key = eventKey(event);
            if (!key) return;
            stickyRef.current = true;
            setOriginOpen(false);
            onActiveRef.current(key);
          });
        }
        map.on("mouseenter", "origin-circle", () => {
          clearLeave();
          map?.getCanvas().style.setProperty("cursor", "pointer");
          stickyRef.current = false;
          onActiveRef.current(null);
          setOriginOpen(true);
        });
        map.on("mouseleave", "origin-circle", (event) => {
          map?.getCanvas().style.setProperty("cursor", "");
          if (rememberPopupTarget(event)) {
            holdPopup.current = true;
            return;
          }
          scheduleLeave(true);
        });
        map.on("click", "origin-circle", () => {
          stickyRef.current = true;
          onActiveRef.current(null);
          setOriginOpen(true);
        });
        map.on("mouseenter", "clusters", () => map?.getCanvas().style.setProperty("cursor", "pointer"));
        map.on("mouseleave", "clusters", () => map?.getCanvas().style.setProperty("cursor", ""));
        map.on("click", "clusters", (event) => {
          const feature = event.features?.[0];
          if (!map || !feature || feature.geometry.type !== "Point" || !isGeoJSONSource(facilitySource)) return;
          const clusterId = Number(feature.properties?.cluster_id);
          if (!Number.isFinite(clusterId)) return;
          const center = feature.geometry.coordinates as [number, number];
          void facilitySource.getClusterExpansionZoom(clusterId).then((zoom) => {
            if (cancelled) return;
            map?.easeTo({ center, zoom, duration: reducedMotion() ? 0 : 400 });
          });
        });
        map.on("click", (event) => {
          if (!map) return;
          const hits = map.queryRenderedFeatures(event.point, { layers: [...HIT_LAYERS] });
          if (hits.length) return;
          stickyRef.current = false;
          holdPopup.current = false;
          setOriginOpen(false);
          onActiveRef.current(null);
        });
        mapRef.current = map;
        if (popup) popupRef.current = popup;
        setStyleReady(true);
      };
      map.on("error", (event) => {
        const message = event.error instanceof Error ? event.error.message : "The map could not be loaded.";
        if (!container.current?.getAttribute("data-map-error")) {
          container.current?.setAttribute("data-map-error", message);
        }
      });
      const startLayers = () => {
        try {
          setupLayers();
        } catch (error) {
          const message = error instanceof Error ? error.message : "The map could not be loaded.";
          container.current?.setAttribute("data-map-error", message);
          setMapError(message);
        }
      };
      map.on("load", startLayers);
      if (map.isStyleLoaded()) startLayers();

      observer = new ResizeObserver(() => {
        map?.resize();
        tryFitRef.current();
      });
      observer.observe(container.current);
      mapRef.current = map;
      popupRef.current = popup;
    })();

    return () => {
      cancelled = true;
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      observer?.disconnect();
      appliedFitRef.current = null;
      setStyleReady(false);
      setDataReady(false);
      popup?.remove();
      map?.remove();
      mapRef.current = null;
      popupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const facilitiesSource = map.getSource("facilities");
    const originSource = map.getSource("origin");
    const accuracySource = map.getSource("accuracy");
    if (!isGeoJSONSource(facilitiesSource) || !isGeoJSONSource(originSource) || !isGeoJSONSource(accuracySource)) return;
    let cancelled = false;
    frameRef.current = frameFor(origin, facilities);
    void (async () => {
      try {
        await Promise.all([
          facilitiesSource.setData(asGeoJson(facilityCollection(facilities, origin))),
          originSource.setData(asGeoJson(originCollection(origin))),
          accuracySource.setData(asGeoJson(accuracyCollection(origin, accuracyMeters))),
        ]);
        if (cancelled) return;
        paintActive(map, activeIdRef.current, previousActiveRef);
        tryFitRef.current();
        setDataReady(true);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "The map could not show these locations.";
        container.current?.setAttribute("data-map-error", message);
        setMapError(message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [styleReady, facilities, origin, accuracyMeters, frameKey]);

  useEffect(() => {
    const map = mapRef.current;
    const popup = popupRef.current;
    if (!map || !popup || !styleReady) return;
    if (activeId && originOpen) setOriginOpen(false);
    if (originOpen && !activeId) {
      const place = originCollection(origin).features[0];
      if (!place || place.geometry.type !== "Point" || !isOriginProperties(place.properties)) return;
      revealedId.current = null;
      paintActive(map, null, previousActiveRef);
      popup.setLngLat(place.geometry.coordinates).setDOMContent(originPopup(place.properties)).addTo(map);
      return;
    }
    if (activeId) {
      const feature = facilityCollection(facilities, origin).features.find((item) => item.id === activeId);
      if (!feature || feature.geometry.type !== "Point" || !isFacilityProperties(feature.properties)) {
        dismissPopup(popup, suppressCloseRef);
        return;
      }
      paintActive(map, activeId, previousActiveRef);
      popup.setLngLat(feature.geometry.coordinates).setDOMContent(facilityPopup(feature.properties)).addTo(map);
      if (dataReady && revealedId.current !== activeId) {
        revealedId.current = activeId;
        const token = ++revealToken.current;
        const [longitude, latitude] = feature.geometry.coordinates;
        void revealFacility(map, activeId, longitude, latitude, origin, token, revealToken);
      }
      return;
    }
    revealedId.current = null;
    paintActive(map, null, previousActiveRef);
    dismissPopup(popup, suppressCloseRef);
  }, [activeId, originOpen, styleReady, dataReady, facilities, origin]);

  const activeFacility = facilities.find((facility) => `${facility.source}:${facility.id}` === activeId);
  const label = activeFacility
    ? `Showing ${activeFacility.name}, ${pinPhrase(activeFacility, origin)}`
    : "Map of healthcare locations";
  const marks = legendMarks(facilities);
  const unpinned = unpinnedCount(facilities);

  return (
    <div>
      <div
        ref={container}
        className="h-[320px] w-full rounded-3xl border border-line bg-moss md:h-[560px]"
        role="region"
        aria-label={label}
        data-map-ready={dataReady ? "true" : "false"}
      />
      {mapError && <p role="alert" className="mt-2 text-sm text-clay">{mapError}</p>}
      <ul aria-label="Map legend" className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
        <li className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-2.5 py-1">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-card bg-teal outline outline-1 outline-teal" aria-hidden="true" />
          {searchPlaceLabel(origin)}
        </li>
        {marks.map((item) => (
          <li key={item.category} className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-2.5 py-1">
            <span className="grid h-6 min-w-6 place-items-center rounded-full border-2 border-teal bg-card px-1 text-[10px] font-bold text-pine" aria-hidden="true">{item.mark}</span>
            {categoryLabel(item.category)}
          </li>
        ))}
      </ul>
      {unpinned > 0 && (
        <p className="mt-2 text-xs text-ink/60">
          {unpinned} {unpinned === 1 ? "listing has" : "listings have"} no confirmed coordinates and {unpinned === 1 ? "is" : "are"} not pinned.
        </p>
      )}
    </div>
  );
}

function pinPhrase(facility: Facility, place: SearchOrigin): string {
  const feature = facilityCollection([facility], place).features[0];
  if (!feature || !isFacilityProperties(feature.properties)) return searchPlaceLabel(place);
  return feature.properties.distance;
}

function emptyGeoJson(): GeoJSON.GeoJSON {
  return { type: "FeatureCollection", features: [] };
}

function asGeoJson(collection: MapFeatureCollection): GeoJSON.GeoJSON {
  return collection as GeoJSON.GeoJSON;
}

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isGeoJSONSource(source: unknown): source is GeoJSONSource {
  return typeof source === "object"
    && source !== null
    && "setData" in source
    && "getClusterLeaves" in source;
}

function eventKey(event: MapLayerMouseEvent): string | null {
  const key = event.features?.[0]?.properties?.key;
  return typeof key === "string" && key ? key : null;
}

function symbolFont(map: MapLibreMap): string[] | null {
  for (const layer of map.getStyle()?.layers ?? []) {
    if (layer.type !== "symbol" || !layer.layout || !("text-font" in layer.layout)) continue;
    const font: unknown = layer.layout["text-font"];
    if (Array.isArray(font) && font.length > 0 && font.every((face) => typeof face === "string")) return font;
  }
  return ["Noto Sans Regular"];
}

function paintActive(map: MapLibreMap, id: string | null, previous: { current: string | null }) {
  if (!map.getSource("facilities")) return;
  if (previous.current && previous.current !== id) {
    try {
      map.removeFeatureState({ source: "facilities", id: previous.current });
    } catch {
      previous.current = null;
    }
  }
  if (id) {
    try {
      map.setFeatureState({ source: "facilities", id }, { active: true });
    } catch {
      return;
    }
  }
  previous.current = id;
}

function dismissPopup(popup: Popup, suppress: { current: boolean }) {
  suppress.current = true;
  popup.remove();
  suppress.current = false;
}

function facilityPopup(properties: FacilityFeatureProperties): HTMLElement {
  const root = document.createElement("div");
  const name = document.createElement("p");
  name.className = "care-popup-name";
  name.textContent = properties.name;
  const categories = document.createElement("p");
  categories.className = "care-popup-meta";
  categories.textContent = properties.categories;
  const distance = document.createElement("p");
  distance.className = "care-popup-distance";
  distance.textContent = properties.distance;
  const link = document.createElement("a");
  link.className = "care-popup-link";
  link.href = properties.href;
  link.textContent = "View record";
  root.append(name, categories, distance, link);
  return root;
}

function originPopup(properties: { label: string; detail: string }): HTMLElement {
  const root = document.createElement("div");
  const name = document.createElement("p");
  name.className = "care-popup-name";
  name.textContent = properties.label;
  const detail = document.createElement("p");
  detail.className = "care-popup-distance";
  detail.textContent = properties.detail;
  root.append(name, detail);
  return root;
}

async function revealFacility(
  map: MapLibreMap,
  key: string,
  longitude: number,
  latitude: number,
  place: SearchOrigin,
  token: number,
  tokens: { current: number },
) {
  try {
    await waitForIdle(map);
    if (token !== tokens.current) return;
    const rendered = map.queryRenderedFeatures({ layers: ["facility-circle"] })
      .some((feature) => String(feature.properties?.key ?? "") === key);
    if (rendered) return;
    const source = map.getSource("facilities");
    if (!isGeoJSONSource(source)) return;
    const clusters = map.queryRenderedFeatures({ layers: ["clusters"] });
    for (const cluster of clusters) {
      if (cluster.geometry.type !== "Point") continue;
      const clusterId = Number(cluster.properties?.cluster_id);
      const pointCount = Number(cluster.properties?.point_count);
      if (!Number.isFinite(clusterId) || !Number.isFinite(pointCount)) continue;
      const leaves = await source.getClusterLeaves(clusterId, pointCount, 0);
      if (token !== tokens.current) return;
      if (!leaves.some((leaf) => String(leaf.properties?.key ?? "") === key)) continue;
      const expansion = await source.getClusterExpansionZoom(clusterId);
      if (token !== tokens.current) return;
      moveCamera(map, place, longitude, latitude, Math.min(Math.max(expansion, map.getZoom()), 16));
      return;
    }
    if (!map.getBounds().contains([longitude, latitude])) {
      moveCamera(map, place, longitude, latitude, Math.max(map.getZoom(), 14));
    }
  } catch {
    // The pin highlight still shows when cluster details are not ready yet.
  }
}

function moveCamera(map: MapLibreMap, place: SearchOrigin, longitude: number, latitude: number, maxZoom: number) {
  const frame = map.cameraForBounds(
    [
      [Math.min(place.longitude, longitude), Math.min(place.latitude, latitude)],
      [Math.max(place.longitude, longitude), Math.max(place.latitude, latitude)],
    ],
    { padding: 48, maxZoom },
  );
  if (!frame) return;
  map.easeTo({ ...frame, duration: reducedMotion() ? 0 : 500 });
}

function waitForIdle(map: MapLibreMap): Promise<void> {
  if (!map.isMoving() && map.loaded()) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => resolve();
    map.once("idle", finish);
  });
}

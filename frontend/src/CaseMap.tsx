import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { X, Crosshair } from "@phosphor-icons/react";

// Ensure global L exists for leaflet.heat plugin
if (typeof window !== "undefined") {
  (window as unknown as { L: typeof L }).L = L;
}
import "leaflet.heat";

import type { CaseScan } from "./types";

type MapLayerMode = "combined" | "pins" | "heatmap";

interface ActivePopover {
  scan: CaseScan;
  point: { x: number; y: number };
}

interface MarkerEntry {
  scan: CaseScan;
  marker: L.Marker;
  index: number;
}

interface CaseMapProps {
  scans: CaseScan[];
  demoImage: string;
  vehiclePlate: string;
  onSelectScan?: (scanId: number) => void;
  selectedScanId?: number | null;
}

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Unknown" : dateTimeFormatter.format(date);
}

function updateMarkerPositions(map: L.Map, entries: MarkerEntry[]) {
  if (entries.length === 0) return;

  const threshold = 36; // Screen pixel collision threshold
  const visited = new Set<number>();
  const clusters: { entry: MarkerEntry; basePt: L.Point }[][] = [];

  for (let i = 0; i < entries.length; i++) {
    if (visited.has(i)) continue;
    const entryI = entries[i];
    const ptI = map.latLngToContainerPoint([entryI.scan.latitude, entryI.scan.longitude]);
    const cluster = [{ entry: entryI, basePt: ptI }];
    visited.add(i);

    for (let j = i + 1; j < entries.length; j++) {
      if (visited.has(j)) continue;
      const entryJ = entries[j];
      const ptJ = map.latLngToContainerPoint([entryJ.scan.latitude, entryJ.scan.longitude]);
      if (cluster.some((item) => item.basePt.distanceTo(ptJ) < threshold)) {
        cluster.push({ entry: entryJ, basePt: ptJ });
        visited.add(j);
      }
    }
    clusters.push(cluster);
  }

  clusters.forEach((cluster) => {
    if (cluster.length === 1) {
      const item = cluster[0];
      item.entry.marker.setLatLng([item.entry.scan.latitude, item.entry.scan.longitude]);
      return;
    }

    // Sort by sequence index ascending (#01 first, then #02, etc.)
    cluster.sort((a, b) => a.entry.index - b.entry.index);

    if (cluster.length === 2) {
      // Fan out horizontally with 38px spacing so both numbers are clearly visible side-by-side
      const offsets = [-19, 19];
      cluster.forEach((item, k) => {
        const offsetPt = item.basePt.add(L.point(offsets[k], 0));
        const offsetLatLng = map.containerPointToLatLng(offsetPt);
        item.entry.marker.setLatLng(offsetLatLng);
      });
    } else {
      // Fan out in a circle for clusters of 3 or more co-located sightings
      const radius = 24 + (cluster.length - 2) * 5;
      cluster.forEach((item, k) => {
        const angle = (2 * Math.PI * k) / cluster.length - Math.PI / 2;
        const dx = Math.cos(angle) * radius;
        const dy = Math.sin(angle) * radius;
        const offsetPt = item.basePt.add(L.point(dx, dy));
        const offsetLatLng = map.containerPointToLatLng(offsetPt);
        item.entry.marker.setLatLng(offsetLatLng);
      });
    }
  });
}

export function CaseMap({ scans, demoImage, vehiclePlate, onSelectScan, selectedScanId }: CaseMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const heatLayerRef = useRef<L.HeatLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const markerEntriesRef = useRef<MarkerEntry[]>([]);
  const [layerMode, setLayerMode] = useState<MapLayerMode>("combined");
  const [activePopover, setActivePopover] = useState<ActivePopover | null>(null);
  const activeScanIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || scans.length === 0) return;

    // Initialize Map if not already created
    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: true,
        scrollWheelZoom: false, // Prevent accidental scrolling when page scrolls
      });

      // Position zoom controls in top-left
      L.control.zoom({ position: "topleft" }).addTo(map);

      // Standard OpenStreetMap tiles (free, reliable, no API key required)
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Clean up previous layers if any
    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }
    if (markersLayerRef.current) {
      map.removeLayer(markersLayerRef.current);
      markersLayerRef.current = null;
    }
    markerEntriesRef.current = [];

    // 1. Create Heatmap Layer
    const heatPoints = scans.map(
      (s) => [s.latitude, s.longitude, 1.0] as [number, number, number]
    );

    const heatLayer = L.heatLayer(heatPoints, {
      radius: 38,
      blur: 24,
      maxZoom: 16,
      minOpacity: 0.35,
      gradient: {
        0.2: "#173b32",
        0.5: "#e25d33",
        0.8: "#b84120",
        1.0: "#8f2517",
      },
    });
    heatLayerRef.current = heatLayer;

    // 2. Create Markers Layer with custom tactical DivIcons
    const markersGroup = L.layerGroup();
    const entries: MarkerEntry[] = [];

    scans.forEach((scan, index) => {
      const isLatest = index === 0;
      const markerNumber = String(index + 1).padStart(2, "0");

      const icon = L.divIcon({
        className: "tactical-marker-wrap",
        html: `
          <div class="tactical-marker ${isLatest ? "tactical-marker--latest" : ""}">
            <span class="marker-number">${markerNumber}</span>
            <div class="marker-pin"></div>
            ${isLatest ? '<div class="marker-radar-ring"></div>' : ""}
          </div>
        `,
        iconSize: [34, 44],
        iconAnchor: [17, 44],
        tooltipAnchor: [0, -42],
      });

      // Priority stacking: latest sightings have higher zIndexOffset so they are never buried
      const zIndexOffset = (scans.length - index) * 100;

      const marker = L.marker([scan.latitude, scan.longitude], {
        icon,
        zIndexOffset,
        title: `Scan #${scan.id} (${formatDate(scan.scanned_at)})`,
      });

      // Quick hover tooltip for immediate discovery on desktop
      marker.bindTooltip(
        `<strong>Scan #${scan.id}</strong> · ${formatDate(scan.scanned_at)}`,
        {
          direction: "top",
          className: "tactical-tooltip",
          offset: [0, -38],
        }
      );

      // Click to open floating unclipped popover
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        activeScanIdRef.current = scan.id;
        const pt = map.latLngToContainerPoint(marker.getLatLng());
        setActivePopover({ scan, point: pt });
      });

      markersGroup.addLayer(marker);
      entries.push({ scan, marker, index });
    });

    markersLayerRef.current = markersGroup;
    markerEntriesRef.current = entries;

    // Map move/zoom updates floating popover anchor and proximity fanning
    const handleMove = () => {
      updateMarkerPositions(map, markerEntriesRef.current);
      if (activeScanIdRef.current && mapInstanceRef.current) {
        const found = markerEntriesRef.current.find((e) => e.scan.id === activeScanIdRef.current);
        if (found) {
          const pt = mapInstanceRef.current.latLngToContainerPoint(found.marker.getLatLng());
          setActivePopover({ scan: found.scan, point: pt });
        }
      }
    };
    map.on("move", handleMove);
    map.on("zoom", handleMove);
    map.on("zoomend", handleMove);

    // Map click outside markers dismisses popover
    const handleMapClick = () => {
      activeScanIdRef.current = null;
      setActivePopover(null);
    };
    map.on("click", handleMapClick);

    // Apply layers according to current layerMode
    if (layerMode === "combined" || layerMode === "heatmap") {
      heatLayer.addTo(map);
    }
    if (layerMode === "combined" || layerMode === "pins") {
      markersGroup.addTo(map);
    }

    // Auto-fit bounds with padding
    if (scans.length === 1) {
      map.setView([scans[0].latitude, scans[0].longitude], 14);
    } else {
      const bounds = L.latLngBounds(scans.map((s) => [s.latitude, s.longitude]));
      map.fitBounds(bounds, { padding: [45, 45], maxZoom: 15 });
    }

    // Invalidate size and calculate cluster positions after layout stabilizes
    const timer = setTimeout(() => {
      map.invalidateSize();
      updateMarkerPositions(map, markerEntriesRef.current);
    }, 120);

    return () => {
      clearTimeout(timer);
      map.off("move", handleMove);
      map.off("zoom", handleMove);
      map.off("zoomend", handleMove);
      map.off("click", handleMapClick);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [scans, demoImage, vehiclePlate]);

  // Handle external selection from timeline cards
  useEffect(() => {
    if (!selectedScanId || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const entry = markerEntriesRef.current.find((e) => e.scan.id === selectedScanId);
    if (entry) {
      map.panTo(entry.marker.getLatLng(), { animate: true });
      activeScanIdRef.current = selectedScanId;
      const pt = map.latLngToContainerPoint(entry.marker.getLatLng());
      setActivePopover({ scan: entry.scan, point: pt });
    }
  }, [selectedScanId]);

  // Handle Layer Mode toggles
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (heatLayerRef.current) {
      if (layerMode === "combined" || layerMode === "heatmap") {
        if (!map.hasLayer(heatLayerRef.current)) {
          map.addLayer(heatLayerRef.current);
        }
      } else {
        if (map.hasLayer(heatLayerRef.current)) {
          map.removeLayer(heatLayerRef.current);
        }
      }
    }

    if (markersLayerRef.current) {
      if (layerMode === "combined" || layerMode === "pins") {
        if (!map.hasLayer(markersLayerRef.current)) {
          map.addLayer(markersLayerRef.current);
        }
      } else {
        if (map.hasLayer(markersLayerRef.current)) {
          map.removeLayer(markersLayerRef.current);
        }
      }
    }
  }, [layerMode]);

  const fitAllSightings = () => {
    const map = mapInstanceRef.current;
    if (!map || scans.length === 0) return;
    if (scans.length === 1) {
      map.setView([scans[0].latitude, scans[0].longitude], 14, { animate: true });
    } else {
      const bounds = L.latLngBounds(scans.map((s) => [s.latitude, s.longitude]));
      map.fitBounds(bounds, { padding: [45, 45], maxZoom: 15, animate: true });
    }
  };

  const handlePopoverJump = (scanId: number) => {
    activeScanIdRef.current = null;
    setActivePopover(null);
    if (onSelectScan) {
      onSelectScan(scanId);
    } else {
      const el = document.getElementById(`scan-${scanId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("scan-highlight");
        setTimeout(() => el.classList.remove("scan-highlight"), 1600);
      }
    }
  };

  if (scans.length === 0) return null;

  const containerWidth = mapContainerRef.current?.clientWidth ?? 500;
  const isNearTop = activePopover && activePopover.point.y < 230;
  const isNearLeft = activePopover && activePopover.point.x < 140;
  const isNearRight = activePopover && activePopover.point.x > containerWidth - 140;

  let transformStr = "translate(-50%, calc(-100% - 46px))";
  if (isNearTop) {
    if (isNearLeft) transformStr = "translate(-12%, 14px)";
    else if (isNearRight) transformStr = "translate(-88%, 14px)";
    else transformStr = "translate(-50%, 14px)";
  } else {
    if (isNearLeft) transformStr = "translate(-12%, calc(-100% - 46px))";
    else if (isNearRight) transformStr = "translate(-88%, calc(-100% - 46px))";
    else transformStr = "translate(-50%, calc(-100% - 46px))";
  }

  return (
    <div className="case-map-section" aria-labelledby="case-map-heading">
      <header className="case-map-header">
        <div>
          <h2 id="case-map-heading">Sighting trail & heat density</h2>
        </div>
        <div className="case-map-controls">
          <div className="map-layer-selector" role="group" aria-label="Map layer modes">
            <button
              type="button"
              className={`layer-btn ${layerMode === "combined" ? "layer-btn--active" : ""}`}
              onClick={() => setLayerMode("combined")}
            >
              Combined
            </button>
            <button
              type="button"
              className={`layer-btn ${layerMode === "pins" ? "layer-btn--active" : ""}`}
              onClick={() => setLayerMode("pins")}
            >
              Pins
            </button>
            <button
              type="button"
              className={`layer-btn ${layerMode === "heatmap" ? "layer-btn--active" : ""}`}
              onClick={() => setLayerMode("heatmap")}
            >
              Heatmap
            </button>
          </div>
          <button
            type="button"
            className="button button--quiet map-recenter-btn"
            onClick={fitAllSightings}
            title="Recenter and fit all sightings"
          >
            <Crosshair size={13} weight="bold" />
            <span>Fit all</span>
          </button>
        </div>
      </header>

      <div className="case-map-frame">
        <div ref={mapContainerRef} className="case-map-canvas" />

        {/* Floating popover unconstrained by map canvas boundaries */}
        {activePopover && (
          <div
            className="floating-tactical-popover"
            style={{
              left: `${activePopover.point.x}px`,
              top: `${activePopover.point.y}px`,
              transform: transformStr,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="popover-card">
              <header className="popover-header">
                <div>
                  <span className="popover-tag">
                    {activePopover.scan.id === scans[0]?.id ? "LATEST OBSERVATION" : "RECORDED SIGHTING"}
                  </span>
                  <strong>Scan #{activePopover.scan.id}</strong>
                </div>
                <div className="popover-header-actions">
                  <time>{formatDate(activePopover.scan.scanned_at)}</time>
                  <button
                    type="button"
                    className="popover-close-btn"
                    onClick={() => {
                      activeScanIdRef.current = null;
                      setActivePopover(null);
                    }}
                    aria-label="Close popover"
                  >
                    <X size={14} weight="bold" />
                  </button>
                </div>
              </header>

              <div className="popover-image">
                <img
                  src={
                    activePopover.scan.image_url && !activePopover.scan.image_url.includes("example.invalid")
                      ? activePopover.scan.image_url
                      : demoImage
                  }
                  alt={`Vehicle sighting: ${vehiclePlate}`}
                />
              </div>

              <div className="popover-meta">
                <div>
                  <dt>COORDINATES</dt>
                  <dd><code>{activePopover.scan.latitude.toFixed(5)}, {activePopover.scan.longitude.toFixed(5)}</code></dd>
                </div>
                <div>
                  <dt>REPORTED BY</dt>
                  <dd>
                    {activePopover.scan.reported_by
                      ? `${activePopover.scan.reported_by.first_name} ${activePopover.scan.reported_by.last_name}`
                      : "Shared network source"}
                  </dd>
                </div>
              </div>

              <button
                type="button"
                className="popover-jump-btn"
                onClick={() => handlePopoverJump(activePopover.scan.id)}
              >
                View in timeline &darr;
              </button>
            </div>
          </div>
        )}

        <footer className="case-map-legend" aria-label="Map legend">
          <div className="legend-item">
            <span className="legend-swatch legend-swatch--latest"></span>
            <span>Latest sighting (01)</span>
          </div>
          <div className="legend-item">
            <span className="legend-swatch legend-swatch--prior"></span>
            <span>Prior sightings</span>
          </div>
          <div className="legend-item">
            <span className="legend-gradient"></span>
            <span>Sighting density</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

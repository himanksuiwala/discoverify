import { useEffect, useRef, useState } from "react";
import L from "leaflet";

// Ensure global L exists for leaflet.heat plugin
if (typeof window !== "undefined") {
  (window as unknown as { L: typeof L }).L = L;
}
import "leaflet.heat";

import type { CaseScan } from "./types";

type MapLayerMode = "combined" | "pins" | "heatmap";

interface CaseMapProps {
  scans: CaseScan[];
  demoImage: string;
  vehiclePlate: string;
  onSelectScan?: (scanId: number) => void;
}

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Unknown" : dateTimeFormatter.format(date);
}

export function CaseMap({ scans, demoImage, vehiclePlate, onSelectScan }: CaseMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const heatLayerRef = useRef<L.HeatLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const [layerMode, setLayerMode] = useState<MapLayerMode>("combined");

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

    // 1. Create Heatmap Layer
    // Tactical brand gradient: forest green -> safety signal orange -> deep dark burnt orange -> dark red
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
        popupAnchor: [0, -42],
        tooltipAnchor: [0, -42],
      });

      const marker = L.marker([scan.latitude, scan.longitude], {
        icon,
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

      // Rich Popover on click/tap
      const imageSource =
        scan.image_url && !scan.image_url.includes("example.invalid")
          ? scan.image_url
          : demoImage;

      const reporterName = scan.reported_by
        ? `${scan.reported_by.first_name} ${scan.reported_by.last_name}`
        : "Shared network source";

      const popupHtml = `
        <div class="tactical-popover">
          <header class="popover-header">
            <div>
              <span class="popover-tag">${isLatest ? "LATEST OBSERVATION" : "RECORDED SIGHTING"}</span>
              <strong>Scan #${scan.id}</strong>
            </div>
            <time>${formatDate(scan.scanned_at)}</time>
          </header>
          <div class="popover-image">
            <img src="${imageSource}" alt="Vehicle sighting: ${vehiclePlate}" />
          </div>
          <div class="popover-meta">
            <div>
              <dt>COORDINATES</dt>
              <dd><code>${scan.latitude.toFixed(5)}, ${scan.longitude.toFixed(5)}</code></dd>
            </div>
            <div>
              <dt>REPORTED BY</dt>
              <dd>${reporterName}</dd>
            </div>
          </div>
          <button type="button" class="popover-jump-btn" data-scan-id="${scan.id}">
            View in timeline &darr;
          </button>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        className: "tactical-leaflet-popup",
        maxWidth: 300,
        minWidth: 260,
      });

      markersGroup.addLayer(marker);
    });

    markersLayerRef.current = markersGroup;

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
      map.fitBounds(bounds, { padding: [55, 55], maxZoom: 15 });
    }

    // Invalidate size to ensure clean render
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 120);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [scans, demoImage, vehiclePlate]);

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

  // Handle popup jump button click delegation
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const handleContainerClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest(".popover-jump-btn");
      if (!target) return;
      const scanIdStr = target.getAttribute("data-scan-id");
      if (!scanIdStr) return;
      const scanId = Number(scanIdStr);

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

    container.addEventListener("click", handleContainerClick);
    return () => container.removeEventListener("click", handleContainerClick);
  }, [onSelectScan]);

  const fitAllSightings = () => {
    const map = mapInstanceRef.current;
    if (!map || scans.length === 0) return;
    if (scans.length === 1) {
      map.setView([scans[0].latitude, scans[0].longitude], 14, { animate: true });
    } else {
      const bounds = L.latLngBounds(scans.map((s) => [s.latitude, s.longitude]));
      map.fitBounds(bounds, { padding: [55, 55], maxZoom: 15, animate: true });
    }
  };

  if (scans.length === 0) return null;

  return (
    <section className="case-map-section" aria-labelledby="case-map-heading">
      <header className="case-map-header">
        <div>
          <p className="kicker">Geographic surveillance</p>
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
            <span>Fit all</span>
          </button>
        </div>
      </header>

      <div className="case-map-frame">
        <div ref={mapContainerRef} className="case-map-canvas" />
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
    </section>
  );
}

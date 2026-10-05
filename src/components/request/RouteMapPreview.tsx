'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

export interface RouteOption {
  routeIndex: number;
  distanceMetres: number;
  durationSeconds: number | null;
  encodedPolyline: string;
  routeLabels: string[];
}

export interface RoutePreview {
  originLabel: string;
  destinationLabel: string;
  routes: RouteOption[];
  selectedRouteIndex: number;
}

const MAP_SCALE_MIN = 0.7;
const MAP_SCALE_MAX = 2;
const MAP_SCALE_STEP = 0.15;

function metresToKm(value: number): string {
  return (value / 1000).toFixed(3).replace(/\.?0+$/, '');
}

function durationLabel(seconds: number | null | undefined): string {
  if (!Number.isFinite(seconds) || seconds === null || seconds === undefined) return '';
  return ` · ประมาณ ${Math.max(1, Math.round(seconds / 60))} นาที`;
}

function googleMapsDirectionsUrl(origin: string, destination: string): string {
  const search = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'driving',
  });
  return `https://www.google.com/maps/dir/?${search.toString()}`;
}

export function RouteMapPreview({
  preview,
  onSelect,
}: {
  preview: RoutePreview;
  onSelect: (route: RouteOption) => void;
}) {
  const selected =
    preview.routes.find((route) => route.routeIndex === preview.selectedRouteIndex) ??
    preview.routes[0];
  const selectedPolyline = selected?.encodedPolyline ?? '';
  const [mapUrl, setMapUrl] = useState('');
  const [mapError, setMapError] = useState('');
  const [mapLoading, setMapLoading] = useState(false);
  const [mapScale, setMapScale] = useState(1);
  const [mapExpanded, setMapExpanded] = useState(false);

  useEffect(() => {
    if (!selectedPolyline) return;
    const controller = new AbortController();
    let objectUrl = '';
    async function loadMap() {
      setMapLoading(true);
      setMapError('');
      try {
        const response = await fetch('/api/routes/map', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ encodedPolyline: selectedPolyline }),
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(payload?.error?.message ?? 'โหลดแผนที่ไม่สำเร็จ');
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        setMapUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return objectUrl;
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setMapUrl('');
        setMapError(error instanceof Error ? error.message : 'โหลดแผนที่ไม่สำเร็จ');
      } finally {
        if (!controller.signal.aborted) setMapLoading(false);
      }
    }

    void loadMap();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selectedPolyline]);

  if (!selected) return null;

  const mapScalePercent = Math.round(mapScale * 100);

  return (
    <div className="route-picker">
      <div
        className={
          mapExpanded
            ? 'route-map-frame route-map-frame-google is-expanded'
            : 'route-map-frame route-map-frame-google'
        }
      >
        <div className="route-map-toolbar" aria-label="เครื่องมือแผนที่">
          <button
            type="button"
            aria-label="ย่อแผนที่"
            title="ย่อแผนที่"
            disabled={mapScale <= MAP_SCALE_MIN}
            onClick={() =>
              setMapScale((value) =>
                Math.max(MAP_SCALE_MIN, Number((value - MAP_SCALE_STEP).toFixed(2))),
              )
            }
          >
            −
          </button>
          <span aria-live="polite">{mapScalePercent}%</span>
          <button
            type="button"
            aria-label="ขยายแผนที่"
            title="ขยายแผนที่"
            disabled={mapScale >= MAP_SCALE_MAX}
            onClick={() =>
              setMapScale((value) =>
                Math.min(MAP_SCALE_MAX, Number((value + MAP_SCALE_STEP).toFixed(2))),
              )
            }
          >
            +
          </button>
          <button
            className="route-map-frame-toggle"
            type="button"
            onClick={() => setMapExpanded((value) => !value)}
          >
            {mapExpanded ? 'ย่อกรอบ' : 'ขยายกรอบ'}
          </button>
        </div>

        <div className="route-map-canvas">
          {mapLoading ? <div className="route-map-loading">กำลังโหลด Google Map…</div> : null}
          {mapUrl ? (
            <Image
              className="route-map-image"
              src={mapUrl}
              alt={`Google Map เส้นทางจาก ${preview.originLabel} ไป ${preview.destinationLabel}`}
              width={1280}
              height={640}
              style={{
                width: `${mapScalePercent}%`,
                height: 'auto',
                maxWidth: 'none',
              }}
              unoptimized
            />
          ) : null}
          {mapError ? (
            <div className="route-map-error" role="alert">
              {mapError}
            </div>
          ) : null}
        </div>
      </div>

      <div className="route-option-list">
        {preview.routes.map((route, index) => (
          <button
            type="button"
            key={route.routeIndex}
            className={
              route.routeIndex === selected.routeIndex ? 'route-option is-selected' : 'route-option'
            }
            onClick={() => onSelect(route)}
          >
            <span>
              <strong>{index === 0 ? 'เส้นทางแนะนำ' : `ทางเลือก ${index + 1}`}</strong>
              <small>
                {metresToKm(route.distanceMetres)}
                {' กม.'}
                {durationLabel(route.durationSeconds)}
              </small>
            </span>
            <span aria-hidden="true">
              {route.routeIndex === selected.routeIndex ? '✓' : 'เลือก'}
            </span>
          </button>
        ))}
      </div>

      <a
        className="text-link"
        href={googleMapsDirectionsUrl(preview.originLabel, preview.destinationLabel)}
        target="_blank"
        rel="noreferrer"
      >
        เปิดต้นทางและปลายทางใน Google Maps ↗
      </a>
      <p className="field-note">
        แผนที่และเส้นทางโหลดแบบชั่วคราวจาก Google Maps · ใช้ − / + เพื่อย่อหรือขยายภาพ และกด
        “ขยายกรอบ” เมื่อต้องการดูพื้นที่มากขึ้น ระบบไม่เก็บภาพ/geometry นี้เป็นหลักฐานถาวร
      </p>
    </div>
  );
}

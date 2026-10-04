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

  return (
    <div className="route-picker">
      <div className="route-map-frame route-map-frame-google">
        {mapLoading ? <div className="route-map-loading">กำลังโหลด Google Map…</div> : null}
        {mapUrl ? (
          <Image
            className="route-map-image"
            src={mapUrl}
            alt={`Google Map เส้นทางจาก ${preview.originLabel} ไป ${preview.destinationLabel}`}
            width={1280}
            height={640}
            unoptimized
          />
        ) : null}
        {mapError ? (
          <div className="route-map-error" role="alert">
            {mapError}
          </div>
        ) : null}
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
        แผนที่และเส้นทางโหลดแบบชั่วคราวจาก Google Maps · เปลี่ยนทางเลือกด้านบนเพื่อดูเส้นทางบนแผนที่
        และระบบไม่เก็บภาพ/geometry นี้เป็นหลักฐานถาวร
      </p>
    </div>
  );
}

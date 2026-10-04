'use client';

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

interface RoutePoint {
  lat: number;
  lng: number;
}

function decodePolyline(encoded: string): RoutePoint[] {
  const points: RoutePoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

function routePath(
  points: RoutePoint[],
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
): string {
  const width = 420;
  const height = 180;
  const pad = 18;
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.00001);
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.00001);
  return points
    .map((point) => {
      const x = pad + ((point.lng - bounds.minLng) / lngSpan) * (width - pad * 2);
      const y = height - pad - ((point.lat - bounds.minLat) / latSpan) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
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
  if (!preview.routes.length) return null;

  const decoded = preview.routes.map((route) => ({
    route,
    points: decodePolyline(route.encodedPolyline),
  }));
  const allPoints = decoded.flatMap((item) => item.points);
  if (!allPoints.length) return null;

  const bounds = {
    minLat: Math.min(...allPoints.map((point) => point.lat)),
    maxLat: Math.max(...allPoints.map((point) => point.lat)),
    minLng: Math.min(...allPoints.map((point) => point.lng)),
    maxLng: Math.max(...allPoints.map((point) => point.lng)),
  };
  const selected =
    preview.routes.find((route) => route.routeIndex === preview.selectedRouteIndex) ??
    preview.routes[0]!;

  return (
    <div className="route-picker">
      <div className="route-map-frame">
        <svg viewBox="0 0 420 180" role="img" aria-label="แผนผังเส้นทางจาก Google Routes">
          <rect width="420" height="180" className="route-map-background" />
          <path
            d="M0 45H420 M0 90H420 M0 135H420 M105 0V180 M210 0V180 M315 0V180"
            className="route-map-grid"
          />
          {decoded.map(({ route, points }) => (
            <polyline
              key={route.routeIndex}
              points={routePath(points, bounds)}
              className={
                route.routeIndex === selected.routeIndex
                  ? 'route-map-line route-map-line-selected'
                  : 'route-map-line'
              }
            />
          ))}
        </svg>
        <span className="route-map-attribution">Google Routes · transient preview</span>
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
        แผนผังด้านบนวาดจาก geometry ที่ Google Routes ส่งกลับแบบชั่วคราว · กด “เปิดใน Google Maps”
        เพื่อดูแผนที่เต็ม และระบบไม่เก็บ geometry นี้เป็นหลักฐานถาวร
      </p>
    </div>
  );
}

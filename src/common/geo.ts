/** Earth radius in meters (WGS84 mean). */
const EARTH_RADIUS_M = 6_371_000;

export type GeoPoint = { lat: number; lng: number };

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Haversine distance between two WGS84 points, in meters. */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function isWithinRadius(
  point: GeoPoint,
  center: GeoPoint,
  radiusMeters: number,
): boolean {
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) return false;
  return (
    distanceMeters(point.lat, point.lng, center.lat, center.lng) <= radiusMeters
  );
}

/** Ray-casting point-in-polygon (lat/lng treated as planar for small areas). */
export function isPointInPolygon(point: GeoPoint, polygon: GeoPoint[]): boolean {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function polygonCentroid(polygon: GeoPoint[]): GeoPoint | null {
  if (!polygon.length) return null;
  let lat = 0;
  let lng = 0;
  for (const p of polygon) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / polygon.length, lng: lng / polygon.length };
}

export function normalizePolygon(
  points: Array<{ lat?: number; lng?: number } | null | undefined> | null | undefined,
): GeoPoint[] {
  if (!Array.isArray(points)) return [];
  const out: GeoPoint[] = [];
  for (const p of points) {
    const lat = Number(p?.lat);
    const lng = Number(p?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    out.push({ lat, lng });
  }
  // Drop closing duplicate if present
  if (out.length >= 2) {
    const first = out[0];
    const last = out[out.length - 1];
    if (first.lat === last.lat && first.lng === last.lng) out.pop();
  }
  return out;
}

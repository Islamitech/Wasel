import { customType } from 'drizzle-orm/pg-core';
import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';

/**
 * Canonical WGS84 geographic coordinate point used across Wasel APIs and DTOs.
 * Order: Latitude first, Longitude second.
 */
export interface Point {
  lat: number;
  lng: number;
}

/**
 * Validates that geographic coordinates are within valid WGS84 boundaries:
 * Latitude: [-90, 90]
 * Longitude: [-180, 180]
 */
export function validatePoint(point: Point): void {
  if (!point || typeof point !== 'object') {
    throw new Error('Coordinates must be an object with lat and lng properties.');
  }

  if (typeof point.lat !== 'number' || typeof point.lng !== 'number' || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
    throw new Error('Coordinates must be finite numbers.');
  }

  if (point.lat < -90 || point.lat > 90) {
    throw new Error(`Latitude must be between -90 and 90 degrees. Received: ${point.lat}`);
  }

  if (point.lng < -180 || point.lng > 180) {
    throw new Error(`Longitude must be between -180 and 180 degrees. Received: ${point.lng}`);
  }
}

/**
 * Helper to normalize various location inputs ({ lat, lng } or { latitude, longitude }) into Point
 */
export function normalizePoint(input: unknown): Point {
  if (!input) {
    throw new Error('Location input cannot be empty.');
  }
  if (typeof input === 'object' && input !== null) {
    const candidate = input as Record<string, unknown>;
    if (typeof candidate.lat === 'number' && typeof candidate.lng === 'number') {
      const pt = { lat: candidate.lat, lng: candidate.lng };
      validatePoint(pt);
      return pt;
    }
    if (typeof candidate.latitude === 'number' && typeof candidate.longitude === 'number') {
      const pt = { lat: candidate.latitude, lng: candidate.longitude };
      validatePoint(pt);
      return pt;
    }
  }
  return parseGeographyPoint(input);
}

/**
 * Generates PostGIS SQL expression to cast a Point to extensions.geography(Point, 4326).
 * Critical: PostGIS ST_MakePoint requires (longitude, latitude) order!
 */
export function toGeography(point: Point) {
  validatePoint(point);
  return sql`extensions.ST_SetSRID(extensions.ST_MakePoint(${point.lng}, ${point.lat}), 4326)::extensions.geography`;
}

/**
 * Generates SQL expression to project a PostGIS geography column into a JSON { lat, lng } object.
 */
export function selectPoint(column: SQLWrapper | SQL) {
  return sql<{ lat: number; lng: number }>`json_build_object(
    'lat', extensions.ST_Y(${column}::extensions.geometry),
    'lng', extensions.ST_X(${column}::extensions.geometry)
  )`;
}

/**
 * Parses any incoming database representation of geography Point into canonical { lat, lng }.
 * Handles:
 * 1. PostGIS EWKB binary hex string (e.g. 0101000020e6100000...)
 * 2. PostGIS WKT string (e.g. "POINT(31.1105 29.9735)" or "SRID=4326;POINT(...)")
 * 3. GeoJSON Point ({ type: 'Point', coordinates: [lng, lat] })
 * 4. Structured object ({ lat, lng } or { latitude, longitude })
 * 5. Comma-separated fallback ("lat,lng")
 */
export function parseGeographyPoint(value: unknown): Point {
  if (!value) {
    throw new Error('Cannot parse null or undefined geography value');
  }

  // Case 1: Already an object
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.lat === 'number' && typeof obj.lng === 'number') {
      const pt = { lat: obj.lat, lng: obj.lng };
      validatePoint(pt);
      return pt;
    }
    if (typeof obj.latitude === 'number' && typeof obj.longitude === 'number') {
      const pt = { lat: obj.latitude, lng: obj.longitude };
      validatePoint(pt);
      return pt;
    }
    if (obj.type === 'Point' && Array.isArray(obj.coordinates) && obj.coordinates.length >= 2) {
      // GeoJSON is [longitude, latitude]
      const pt = { lat: Number(obj.coordinates[1]), lng: Number(obj.coordinates[0]) };
      validatePoint(pt);
      return pt;
    }
    if (typeof obj.x === 'number' && typeof obj.y === 'number') {
      const pt = { lat: obj.y, lng: obj.x };
      validatePoint(pt);
      return pt;
    }
  }

  // Case 2: String parsing
  if (typeof value === 'string') {
    const trimmed = value.trim();

    // 2a. EWKB Hex string (starts with 0101000020... for Point with SRID)
    if (/^[0-9a-fA-F]{42,50}$/.test(trimmed)) {
      try {
        const buf = Buffer.from(trimmed, 'hex');
        if (buf.length === 25) {
          // 25-byte Little-Endian EWKB: byte 0=order, 1..4=type, 5..8=srid, 9..16=X(lng), 17..24=Y(lat)
          const lng = buf.readDoubleLE(9);
          const lat = buf.readDoubleLE(17);
          const pt = { lat, lng };
          validatePoint(pt);
          return pt;
        } else if (buf.length === 21) {
          // 21-byte WKB without SRID: 1..4=type, 5..12=X, 13..20=Y
          const lng = buf.readDoubleLE(5);
          const lat = buf.readDoubleLE(13);
          const pt = { lat, lng };
          validatePoint(pt);
          return pt;
        }
      } catch {
        // Fallback to text parsing
      }
    }

    // 2b. WKT / EWKT: POINT(lng lat) or SRID=4326;POINT(lng lat)
    const wktMatch = trimmed.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
    if (wktMatch) {
      // First is X (longitude), second is Y (latitude)
      const lng = parseFloat(wktMatch[1]!);
      const lat = parseFloat(wktMatch[2]!);
      const pt = { lat, lng };
      validatePoint(pt);
      return pt;
    }

    // 2c. JSON string
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        return parseGeographyPoint(parsed);
      } catch {
        // Continue to fallback
      }
    }

    // 2d. Comma-separated legacy format "lat,lng"
    if (trimmed.includes(',')) {
      const parts = trimmed.split(',');
      if (parts.length >= 2) {
        const lat = parseFloat(parts[0]!.trim());
        const lng = parseFloat(parts[1]!.trim());
        const pt = { lat, lng };
        validatePoint(pt);
        return pt;
      }
    }
  }

  throw new Error(`Unsupported geography value format: ${JSON.stringify(value)}`);
}

/**
 * Drizzle ORM custom type for PostGIS `extensions.geography(Point, 4326)` column.
 */
export const geographyPoint = customType<{ data: Point; driverData: string | null }>({
  dataType() {
    return 'extensions.geography(Point, 4326)';
  },
  toDriver(value: Point | { latitude: number; longitude: number } | string | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    const pt = normalizePoint(value);
    return `SRID=4326;POINT(${pt.lng} ${pt.lat})`;
  },
  fromDriver(value: unknown): Point {
    return parseGeographyPoint(value);
  },
});

/**
 * Calculates geodesic great-circle distance between two points using the Haversine formula on WGS84 sphere.
 * Accurate within +-0.5% for local municipal logistics.
 */
export function calculateHaversineDistanceMeters(p1: Point, p2: Point): number {
  validatePoint(p1);
  validatePoint(p2);

  const R = 6371000; // Mean Earth radius in meters
  const lat1Rad = (p1.lat * Math.PI) / 180;
  const lat2Rad = (p2.lat * Math.PI) / 180;
  const deltaLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const deltaLng = ((p2.lng - p1.lng) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Ray casting algorithm to determine if a Point is strictly inside a GeoJSON Polygon or MultiPolygon.
 * In GeoJSON coordinates format: [longitude, latitude].
 */
export function isPointInsidePolygon(point: Point, polygonGeojson: unknown): boolean {
  validatePoint(point);

  if (!polygonGeojson || typeof polygonGeojson !== 'object') {
    return false;
  }

  const obj = polygonGeojson as {
    type?: string;
    coordinates?: unknown;
    geometry?: unknown;
  };

  const geomType = obj.type;
  if (geomType === 'Feature' && obj.geometry) {
    return isPointInsidePolygon(point, obj.geometry);
  }

  if (geomType === 'Polygon' && Array.isArray(obj.coordinates)) {
    return isPointInSinglePolygon(point.lng, point.lat, obj.coordinates as number[][][]);
  }

  if (geomType === 'MultiPolygon' && Array.isArray(obj.coordinates)) {
    const multiCoords = obj.coordinates as number[][][][];
    for (const polygonCoords of multiCoords) {
      if (Array.isArray(polygonCoords) && isPointInSinglePolygon(point.lng, point.lat, polygonCoords)) {
        return true;
      }
    }
    return false;
  }

  return false;
}

function isPointInSinglePolygon(x: number, y: number, rings: number[][][]): boolean {
  if (!rings || rings.length === 0) return false;

  // Exterior ring check
  const exterior = rings[0]!;
  let inside = false;

  for (let i = 0, j = exterior.length - 1; i < exterior.length; j = i++) {
    const xi = exterior[i]![0]!;
    const yi = exterior[i]![1]!;
    const xj = exterior[j]![0]!;
    const yj = exterior[j]![1]!;

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  if (!inside) return false;

  // Interior rings (holes) check
  for (let r = 1; r < rings.length; r++) {
    const hole = rings[r]!;
    let inHole = false;
    for (let i = 0, j = hole.length - 1; i < hole.length; j = i++) {
      const xi = hole[i]![0]!;
      const yi = hole[i]![1]!;
      const xj = hole[j]![0]!;
      const yj = hole[j]![1]!;

      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inHole = !inHole;
    }
    if (inHole) return false; // Inside a hole means outside the polygon
  }

  return true;
}

/**
 * Obfuscates geographic coordinates by snapping them to a coarse grid (~300m resolution)
 * to preserve customer privacy before a binding agreement is established.
 * ~300m corresponds to ~0.0027 degrees latitude (approx 111,132 meters / deg).
 * At Cairo/Giza (lat ~30°), 0.0027 deg lat is ~300m, and 0.0031 deg lng is ~300m.
 */
export function obfuscatePoint(point: Point, resolutionMeters: number = 300): Point {
  validatePoint(point);
  const latGridDeg = resolutionMeters / 111132;
  const lngGridDeg = resolutionMeters / (111320 * Math.cos((point.lat * Math.PI) / 180));
  return {
    lat: Number((Math.round(point.lat / latGridDeg) * latGridDeg).toFixed(6)),
    lng: Number((Math.round(point.lng / lngGridDeg) * lngGridDeg).toFixed(6)),
  };
}


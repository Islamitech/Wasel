# Wasel Spatial & Geodesic Architecture (WGS 84 & PostGIS)

## 1. Overview & Coordinate Conventions

Wasel is an Arabic-first hyper-local logistics and errand delivery marketplace. Geographic positioning is central to order assignment, multi-stop routing, fare calculation, and coverage boundaries.

To ensure consistency across client apps (PWA), backend APIs, and the database engine, Wasel enforces strict coordinate conventions:

| Layer | Representation | Order | Example |
| :--- | :--- | :--- | :--- |
| **API & DTOs** | JSON object `{ lat, lng }` (or `{ latitude, longitude }`) | **Latitude first**, Longitude second | `{"lat": 29.9735, "lng": 31.1105}` |
| **Client PWAs** | MapLibre / Leaflet `[lng, lat]` or `{ lat, lng }` | API normalized to `{ lat, lng }` | Cairo / Hadayek al-Ahram |
| **PostGIS / SQL** | `extensions.geography(Point, 4326)` | **Longitude (X) first**, **Latitude (Y) second** | `ST_SetSRID(ST_MakePoint(lng, lat), 4326)` |
| **GeoJSON** | RFC 7946 Standard | **[Longitude, Latitude]** | `[31.1105, 29.9735]` |

> [!IMPORTANT]
> **PostGIS Axis Order**: The PostGIS function `ST_MakePoint(x, y)` requires `x = longitude` and `y = latitude`. Inverting these parameters will place coordinates in Antarctica or the Indian Ocean instead of Egypt. Always use `apps/api/src/common/geo/toGeography(point)` or the `geographyPoint` customType to guarantee correct parameter ordering.

---

## 2. Spatial Reference System: EPSG 4326 (WGS 84)

All spatial data in Wasel is stored using the **WGS 84 (SRID 4326)** ellipsoidal coordinate reference system.

### Why `geography` over `geometry`?
- Wasel uses PostgreSQL's native `geography(Point, 4326)` type rather than planar `geometry`.
- The `geography` type performs calculations on the curved surface of the Earth (great-circle / geodesic distance).
- `ST_Distance(geo1, geo2)` directly returns distances in **meters** without requiring projection transformations (e.g. UTM).
- `ST_DWithin(geo1, geo2, radius_meters)` filters radius searches natively in meters using the spatial index.

---

## 3. High-Performance Spatial Indexing (GiST)

Every spatial column in the database is indexed with a Generalized Search Tree (GiST) index:

- `app.orders.customer_location` -> `USING GIST (customer_location)`
- `app.stops.location` -> `USING GIST (location)`
- `app.places.location` -> `USING GIST (location)`
- `app.driver_profiles.last_location` -> `USING GIST (last_location)`
- `app.driver_locations.location` -> `USING GIST (location)`
- `app.order_tracking_points.location` -> `USING GIST (location)`

This index enables sub-50ms candidate driver searches for 50+ concurrent captains within any configurable radius (`ST_DWithin`).

---

## 4. Operating Region Coverage & Boundary Enforcement

Operating regions (e.g., Hadayek al-Ahram / Giza) are stored in `app.regions` with GeoJSON polygons (`polygon_geojson`).

When a customer creates or updates a draft order:
1. The backend validates coordinates bounds: `lat ∈ [-90, 90]` and `lng ∈ [-180, 180]`.
2. The customer's location is checked against the region boundary polygon using `isPointInsidePolygon` / `ST_Covers`.
3. If the coordinate falls outside the authorized operating area, the API rejects the request with HTTP 400 and `ErrorCode.LOCATION_OUTSIDE_REGION`.

---

## 5. Drizzle ORM Integration: `geographyPoint`

The backend leverages a custom Drizzle ORM type defined in `apps/api/src/common/geo/index.ts`:

```typescript
import { geographyPoint, Point, normalizePoint } from '../common/geo/index.js';

// Schema Definition:
export const orders = appSchema.table('orders', {
  // ...
  customerLocation: geographyPoint('customer_location').notNull(),
});
```

- **Writing**: Accepts `{ lat, lng }` (or `{ latitude, longitude }`), formats to `SRID=4326;POINT(lng lat)`.
- **Reading**: Automatically parses PostGIS EWKB binary, WKT, or GeoJSON into a strongly-typed `Point` object `{ lat: number, lng: number }`.
- **No string splits (`split(',')`)** and **no hardcoded default coordinates** in application paths.

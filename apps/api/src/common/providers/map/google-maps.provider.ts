import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import {
  IMapProvider,
  Coordinates,
  GeocodeResult,
  RouteMatrixResult,
} from './map.provider.interface.js';
import { AppConfigService } from '../../../config/config.service.js';

interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GoogleGeocodeResult {
  status: string;
  results?: Array<{
    formatted_address: string;
    address_components?: GoogleAddressComponent[];
  }>;
}

interface GoogleDirectionsResult {
  status: string;
  routes?: Array<{
    overview_polyline?: { points: string };
    legs: Array<{
      distance: { value: number; text: string };
      duration: { value: number; text: string };
    }>;
  }>;
}

@Injectable()
export class GoogleMapsProvider implements IMapProvider {
  readonly providerName = 'google_maps';
  private readonly logger = new Logger(GoogleMapsProvider.name);

  constructor(@Optional() @Inject(AppConfigService) private readonly configService?: AppConfigService) {}

  /**
   * Reverse geocodes coordinates to address and district via Google Maps Geocoding API
   */
  async reverseGeocode(coords: Coordinates): Promise<GeocodeResult> {
    const apiKey =
      this.configService?.get('GOOGLE_MAPS_API_KEY') || process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      this.logger.debug(`[MOCK GOOGLE MAPS] Reverse geocoding (${coords.latitude}, ${coords.longitude})`);
      return {
        address: `حدائق الأهرام، البوابة الأولى (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`,
        coordinates: coords,
        district: 'حدائق الأهرام',
        city: 'الجيزة',
      };
    }

    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.latitude},${coords.longitude}&language=ar&key=${apiKey}`;
      const res = await fetch(url);
      const data = (await res.json()) as GoogleGeocodeResult;

      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const first = data.results[0];
        if (first) {
          let district: string | undefined;
          let city: string | undefined;

          for (const comp of first.address_components || []) {
            if (comp.types.includes('sublocality') || comp.types.includes('neighborhood')) {
              district = comp.long_name;
            }
            if (comp.types.includes('locality') || comp.types.includes('administrative_area_level_2')) {
              city = comp.long_name;
            }
          }

          return {
            address: first.formatted_address,
            coordinates: coords,
            district: district || 'حدائق الأهرام',
            city: city || 'الجيزة',
          };
        }
      }

      throw new Error(`Google Maps API error status: ${data.status}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Google Maps geocode failed (${msg}), using fallback.`);
      return {
        address: `موقع محدد (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`,
        coordinates: coords,
        district: 'حدائق الأهرام',
        city: 'الجيزة',
      };
    }
  }

  /**
   * Calculates driving route, distance, and duration via Google Maps Directions API
   */
  async calculateRoute(origin: Coordinates, destination: Coordinates): Promise<RouteMatrixResult> {
    const apiKey =
      this.configService?.get('GOOGLE_MAPS_API_KEY') || process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      // Mock calculation using Haversine approximation
      const R = 6371e3;
      const φ1 = (origin.latitude * Math.PI) / 180;
      const φ2 = (destination.latitude * Math.PI) / 180;
      const Δφ = ((destination.latitude - origin.latitude) * Math.PI) / 180;
      const Δλ = ((destination.longitude - origin.longitude) * Math.PI) / 180;
      const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const dist = Math.round(R * c * 1.3); // 1.3 road winding factor
      const durationSeconds = Math.round(dist / 6.94); // ~25 km/h urban speed

      return {
        distanceMeters: dist,
        durationSeconds,
      };
    }

    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&mode=driving&language=ar&key=${apiKey}`;
      const res = await fetch(url);
      const data = (await res.json()) as GoogleDirectionsResult;

      if (data.status === 'OK' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const leg = route?.legs?.[0];
        if (leg) {
          return {
            distanceMeters: leg.distance.value,
            durationSeconds: leg.duration.value,
            polyline: route?.overview_polyline?.points,
          };
        }
      }

      throw new Error(`Google Maps Directions error status: ${data.status}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Google Maps route calculation failed (${msg}), using fallback.`);
      return {
        distanceMeters: 2500,
        durationSeconds: 600,
      };
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { IMapProvider, Coordinates, GeocodeResult, RouteMatrixResult } from './map.provider.interface.js';

@Injectable()
export class DevMapProvider implements IMapProvider {
  readonly providerName = 'dev';
  private readonly logger = new Logger(DevMapProvider.name);

  async reverseGeocode(coords: Coordinates): Promise<GeocodeResult> {
    this.logger.debug(`[DEV MAP] reverseGeocode at ${coords.latitude},${coords.longitude}`);
    return {
      address: `حدائق الأهرام، البوابة الأولى، الجيزة (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`,
      coordinates: coords,
      district: 'حدائق الأهرام',
      city: 'الجيزة',
    };
  }

  async calculateRoute(origin: Coordinates, destination: Coordinates): Promise<RouteMatrixResult> {
    // Haversine distance estimation
    const toRad = (x: number) => (x * Math.PI) / 180;
    const R = 6371e3; // metres
    const φ1 = toRad(origin.latitude);
    const φ2 = toRad(destination.latitude);
    const Δφ = toRad(destination.latitude - origin.latitude);
    const Δλ = toRad(destination.longitude - origin.longitude);

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceMeters = Math.round(R * c);
    const durationSeconds = Math.round((distanceMeters / 1000 / 30) * 3600); // approx 30km/h

    return {
      distanceMeters,
      durationSeconds,
    };
  }
}

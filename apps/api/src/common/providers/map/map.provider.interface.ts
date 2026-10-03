export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeocodeResult {
  address: string;
  coordinates: Coordinates;
  district?: string;
  city?: string;
}

export interface RouteMatrixResult {
  distanceMeters: number;
  durationSeconds: number;
  polyline?: string;
}

export interface IMapProvider {
  readonly providerName: string;
  reverseGeocode(coords: Coordinates): Promise<GeocodeResult>;
  calculateRoute(origin: Coordinates, destination: Coordinates): Promise<RouteMatrixResult>;
}

export const MAP_PROVIDER_TOKEN = 'MAP_PROVIDER_TOKEN';

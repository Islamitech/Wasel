import { Coordinates } from '../../types/customer.js';

export interface MarkerOptions {
  id: string;
  position: Coordinates;
  title?: string;
  category?: string;
  icon?: string;
  isDraggable?: boolean;
  type: 'customer' | 'driver' | 'place' | 'stop';
  stopSeq?: number;
  onClick?: () => void;
  onDragEnd?: (coords: Coordinates) => void;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface MapMountOptions {
  center: Coordinates;
  zoom: number;
}

export interface MapProvider {
  mount(container: HTMLElement, options: MapMountOptions): Promise<void>;
  unmount(): void;
  setCenter(coords: Coordinates, zoom?: number): void;
  getCenter(): Coordinates;
  flyTo(coords: Coordinates, zoom?: number): void;
  fitBounds(bounds: MapBounds, padding?: number): void;
  addOrUpdateMarker(options: MarkerOptions): void;
  removeMarker(id: string): void;
  clearMarkers(): void;
  onLongPress(callback: (coords: Coordinates) => void): () => void;
  onMapClick(callback: (coords: Coordinates) => void): () => void;
  setRoute(coords: Coordinates[]): void;
  clearRoute(): void;
  reverseGeocode(coords: Coordinates): Promise<string>;
}

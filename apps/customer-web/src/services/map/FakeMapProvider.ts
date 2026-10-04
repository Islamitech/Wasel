import { Coordinates } from '../../types/customer.js';
import { MapBounds, MapMountOptions, MapProvider, MarkerOptions } from './MapProvider.js';

export class FakeMapProvider implements MapProvider {
  private container: HTMLElement | null = null;
  private center: Coordinates = { latitude: 29.975, longitude: 31.115 };
  private zoom = 14;
  private markers = new Map<string, MarkerOptions>();
  private route: Coordinates[] = [];
  private longPressListeners: Array<(coords: Coordinates) => void> = [];
  private clickListeners: Array<(coords: Coordinates) => void> = [];

  async mount(container: HTMLElement, options: MapMountOptions): Promise<void> {
    this.container = container;
    this.center = options.center;
    this.zoom = options.zoom;
    container.setAttribute('data-fake-map-mounted', 'true');
    container.innerHTML = '<div class="fake-map-viewport" style="width:100%;height:100%;background:#e5ece8;position:relative;"></div>';
  }

  unmount(): void {
    if (this.container) {
      this.container.removeAttribute('data-fake-map-mounted');
      this.container.innerHTML = '';
      this.container = null;
    }
    this.markers.clear();
    this.route = [];
    this.longPressListeners = [];
    this.clickListeners = [];
  }

  setCenter(coords: Coordinates, zoom?: number): void {
    this.center = coords;
    if (zoom !== undefined) this.zoom = zoom;
  }

  getZoom(): number {
    return this.zoom;
  }

  getCenter(): Coordinates {
    return { ...this.center };
  }

  flyTo(coords: Coordinates, zoom?: number): void {
    this.setCenter(coords, zoom);
  }

  fitBounds(_bounds: MapBounds, _padding = 20): void {
    // Deterministic mock
  }

  addOrUpdateMarker(options: MarkerOptions): void {
    this.markers.set(options.id, options);
    if (this.container) {
      let markerEl = this.container.querySelector(`[data-marker-id="${options.id}"]`) as HTMLElement;
      if (!markerEl) {
        markerEl = document.createElement('div');
        markerEl.setAttribute('data-marker-id', options.id);
        markerEl.setAttribute('data-marker-type', options.type);
        markerEl.className = `wasel-map-marker wasel-marker-${options.type}`;
        markerEl.addEventListener('click', () => {
          options.onClick?.();
        });
        const viewport = this.container.querySelector('.fake-map-viewport') || this.container;
        viewport.appendChild(markerEl);
      }
      markerEl.title = options.title || '';
    }
  }

  removeMarker(id: string): void {
    this.markers.delete(id);
    if (this.container) {
      const el = this.container.querySelector(`[data-marker-id="${id}"]`);
      el?.remove();
    }
  }

  clearMarkers(): void {
    this.markers.clear();
    if (this.container) {
      const els = this.container.querySelectorAll('[data-marker-id]');
      els.forEach((el) => el.remove());
    }
  }

  onLongPress(callback: (coords: Coordinates) => void): () => void {
    this.longPressListeners.push(callback);
    return () => {
      this.longPressListeners = this.longPressListeners.filter((cb) => cb !== callback);
    };
  }

  onMapClick(callback: (coords: Coordinates) => void): () => void {
    this.clickListeners.push(callback);
    return () => {
      this.clickListeners = this.clickListeners.filter((cb) => cb !== callback);
    };
  }

  setRoute(coords: Coordinates[]): void {
    this.route = [...coords];
  }

  clearRoute(): void {
    this.route = [];
  }

  async reverseGeocode(coords: Coordinates): Promise<string> {
    // Deterministic Egyptian labels for Hadayek al-Ahram
    if (Math.abs(coords.latitude - 29.975) < 0.005 && Math.abs(coords.longitude - 31.115) < 0.005) {
      return 'حدائق الأهرام - البوابة الأولى (خوفو)';
    }
    if (Math.abs(coords.latitude - 29.98) < 0.005 && Math.abs(coords.longitude - 31.12) < 0.005) {
      return 'حدائق الأهرام - شارع الثروة المعدنية';
    }
    return `موقع (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`;
  }

  // Testing helpers
  triggerLongPress(coords: Coordinates): void {
    this.longPressListeners.forEach((cb) => cb(coords));
  }

  triggerMapClick(coords: Coordinates): void {
    this.clickListeners.forEach((cb) => cb(coords));
  }

  triggerMarkerClick(id: string): void {
    const marker = this.markers.get(id);
    marker?.onClick?.();
  }

  triggerMarkerDrag(id: string, newCoords: Coordinates): void {
    const marker = this.markers.get(id);
    if (marker && marker.isDraggable) {
      marker.position = newCoords;
      marker.onDragEnd?.(newCoords);
    }
  }

  getMarkers(): MarkerOptions[] {
    return Array.from(this.markers.values());
  }

  getRoute(): Coordinates[] {
    return this.route;
  }
}

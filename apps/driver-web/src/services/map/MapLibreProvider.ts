import { Coordinates } from '../../types/driver.js';
import { MapBounds, MapMountOptions, MapProvider, MarkerOptions } from './MapProvider.js';

export class MapLibreProvider implements MapProvider {
  private map: any = null;
  private container: HTMLElement | null = null;
  private markersMap = new Map<string, any>();
  private longPressListeners: Array<(coords: Coordinates) => void> = [];
  private clickListeners: Array<(coords: Coordinates) => void> = [];
  private longPressTimer: any = null;
  private touchStartPos: { x: number; y: number } | null = null;

  async mount(container: HTMLElement, options: MapMountOptions): Promise<void> {
    this.container = container;
    const maplibregl = await import('maplibre-gl');

    // Inject MapLibre CSS if not already present
    if (!document.getElementById('maplibre-gl-css')) {
      const link = document.createElement('link');
      link.id = 'maplibre-gl-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      document.head.appendChild(link);
    }

    const envTileUrl = import.meta.env.VITE_MAP_TILE_URL as string;
    const isProd = import.meta.env.PROD;

    if (isProd && !envTileUrl) {
      console.warn(
        '⚠️ [PRODUCTION TILE WARNING] VITE_MAP_TILE_URL is not configured in production environment! Fallback Carto tiles are strictly reserved for local development.',
      );
    }

    const tileUrl =
      envTileUrl ||
      'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png';

    const style: any = {
      version: 8,
      sources: {
        'osm-tiles': {
          type: 'raster',
          tiles: [tileUrl],
          tileSize: 256,
          attribution: '&copy; OpenStreetMap contributors',
        },
      },
      layers: [
        {
          id: 'osm-tiles-layer',
          type: 'raster',
          source: 'osm-tiles',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    };

    this.map = new maplibregl.Map({
      container,
      style,
      center: [options.center.longitude, options.center.latitude],
      zoom: options.zoom,
      attributionControl: false,
    });

    this.map.on('load', () => {
      if (!this.map.getSource('route-source')) {
        this.map.addSource('route-source', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [],
            },
          },
        });
        this.map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route-source',
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#f2a20c',
            'line-width': 5,
          },
        });
      }
    });

    this.setupGestureListeners();
  }

  private setupGestureListeners(): void {
    if (!this.container) return;

    this.container.addEventListener('pointerdown', (e) => {
      this.touchStartPos = { x: e.clientX, y: e.clientY };
      this.longPressTimer = setTimeout(() => {
        if (!this.map) return;
        const rect = this.container!.getBoundingClientRect();
        const point = [e.clientX - rect.left, e.clientY - rect.top];
        const lngLat = this.map.unproject(point);

        if (navigator.vibrate) {
          navigator.vibrate(40);
        }

        const coords: Coordinates = {
          latitude: lngLat.lat,
          longitude: lngLat.lng,
        };
        this.longPressListeners.forEach((cb) => cb(coords));
      }, 500);
    });

    const cancelLongPress = (e: PointerEvent) => {
      if (this.longPressTimer && this.touchStartPos) {
        const dx = Math.abs(e.clientX - this.touchStartPos.x);
        const dy = Math.abs(e.clientY - this.touchStartPos.y);
        if (dx > 10 || dy > 10) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }
      }
    };

    this.container.addEventListener('pointermove', cancelLongPress);
    this.container.addEventListener('pointerup', () => {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
    });
    this.container.addEventListener('pointercancel', () => {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
    });

    this.container.addEventListener('click', (e) => {
      if (!this.map) return;
      const rect = this.container!.getBoundingClientRect();
      const point = [e.clientX - rect.left, e.clientY - rect.top];
      const lngLat = this.map.unproject(point);
      const coords: Coordinates = {
        latitude: lngLat.lat,
        longitude: lngLat.lng,
      };
      this.clickListeners.forEach((cb) => cb(coords));
    });
  }

  unmount(): void {
    this.clearMarkers();
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    this.container = null;
    this.longPressListeners = [];
    this.clickListeners = [];
  }

  setCenter(coords: Coordinates, zoom?: number): void {
    if (!this.map) return;
    this.map.setCenter([coords.longitude, coords.latitude]);
    if (zoom !== undefined) this.map.setZoom(zoom);
  }

  getCenter(): Coordinates {
    if (!this.map) return { latitude: 29.975, longitude: 31.115 };
    const center = this.map.getCenter();
    return { latitude: center.lat, longitude: center.lng };
  }

  flyTo(coords: Coordinates, zoom?: number): void {
    if (!this.map) return;
    this.map.flyTo({
      center: [coords.longitude, coords.latitude],
      zoom: zoom ?? this.map.getZoom(),
      speed: 1.2,
      curve: 1.4,
    });
  }

  fitBounds(bounds: MapBounds, padding = 40): void {
    if (!this.map) return;
    this.map.fitBounds(
      [
        [bounds.west, bounds.south],
        [bounds.east, bounds.north],
      ],
      { padding },
    );
  }

  async addOrUpdateMarker(options: MarkerOptions): Promise<void> {
    if (!this.map) return;
    const maplibregl = await import('maplibre-gl');

    let existing = this.markersMap.get(options.id);

    if (!existing) {
      const el = document.createElement('div');
      el.className = `wasel-map-marker wasel-marker-${options.type} ${options.isActive ? 'active' : ''}`;
      el.setAttribute('data-marker-id', options.id);
      el.setAttribute('data-marker-type', options.type);

      // Icon & styling depending on type
      if (options.type === 'driver') {
        el.innerHTML = `
          <div style="background:#1f8a5b;color:white;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(31,138,91,0.4);border:2px solid white;font-size:1.2rem;">
            🛵
          </div>
        `;
      } else if (options.type === 'customer') {
        el.innerHTML = `
          <div style="background:#12302b;color:white;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(18,48,43,0.4);border:2px solid white;font-size:1.1rem;">
            🏠
          </div>
        `;
      } else if (options.type === 'stop') {
        const bg = options.isActive ? '#f2a20c' : '#12302b';
        el.innerHTML = `
          <div style="background:${bg};color:white;min-width:34px;height:34px;border-radius:17px;display:flex;align-items:center;justify-content:center;padding:0 8px;box-shadow:0 3px 8px rgba(0,0,0,0.3);border:2px solid white;font-weight:bold;font-size:0.85rem;">
            ${options.stopSeq ?? '•'}
          </div>
        `;
      } else {
        el.innerHTML = `
          <div style="background:#4b5563;color:white;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.2);border:1.5px solid white;">
            📍
          </div>
        `;
      }

      if (options.onClick) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          options.onClick?.();
        });
      }

      const marker = new maplibregl.Marker({
        element: el,
        draggable: !!options.isDraggable,
      })
        .setLngLat([options.position.longitude, options.position.latitude])
        .addTo(this.map);

      if (options.onDragEnd) {
        marker.on('dragend', () => {
          const lngLat = marker.getLngLat();
          options.onDragEnd?.({
            latitude: lngLat.lat,
            longitude: lngLat.lng,
          });
        });
      }

      this.markersMap.set(options.id, marker);
    } else {
      existing.setLngLat([options.position.longitude, options.position.latitude]);
    }
  }

  removeMarker(id: string): void {
    const existing = this.markersMap.get(id);
    if (existing) {
      existing.remove();
      this.markersMap.delete(id);
    }
  }

  clearMarkers(): void {
    this.markersMap.forEach((marker) => marker.remove());
    this.markersMap.clear();
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
    if (!this.map) return;
    const source = this.map.getSource('route-source');
    if (source) {
      const geojsonCoordinates = coords.map((c) => [c.longitude, c.latitude]);
      source.setData({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: geojsonCoordinates,
        },
      });
    }
  }

  clearRoute(): void {
    this.setRoute([]);
  }

  async reverseGeocode(coords: Coordinates): Promise<string> {
    if (Math.abs(coords.latitude - 29.975) < 0.005 && Math.abs(coords.longitude - 31.115) < 0.005) {
      return 'حدائق الأهرام - البوابة الأولى (خوفو)';
    }
    if (Math.abs(coords.latitude - 29.98) < 0.005 && Math.abs(coords.longitude - 31.12) < 0.005) {
      return 'حدائق الأهرام - شارع الثروة المعدنية';
    }
    return `موقع (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`;
  }
}

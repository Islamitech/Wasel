import { Coordinates } from '../../types/customer.js';
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
    // Inject CSS if not already present
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

    const googleRoadmapTiles = [
      'https://mt0.google.com/vt/lyrs=m&hl=ar&x={x}&y={y}&z={z}',
      'https://mt1.google.com/vt/lyrs=m&hl=ar&x={x}&y={y}&z={z}',
      'https://mt2.google.com/vt/lyrs=m&hl=ar&x={x}&y={y}&z={z}',
      'https://mt3.google.com/vt/lyrs=m&hl=ar&x={x}&y={y}&z={z}',
    ];

    const osmTiles = [
      'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
    ];

    const defaultTiles =
      import.meta.env.VITE_MAP_PROVIDER === 'osm' ? osmTiles : googleRoadmapTiles;

    // Invalidate any legacy Carto URLs that trigger watermarked tiles
    const isCartoWithoutKey =
      Boolean(envTileUrl) &&
      (envTileUrl.includes('carto') || envTileUrl.includes('cartocdn')) &&
      !envTileUrl.includes('api_key') &&
      !envTileUrl.includes('key=');

    const effectiveTileUrl = envTileUrl && !isCartoWithoutKey ? envTileUrl : null;
    const tiles = effectiveTileUrl ? [effectiveTileUrl] : defaultTiles;

    const isGoogle = tiles === googleRoadmapTiles;

    const style: any = {
      version: 8,
      sources: {
        'google-roadmap-tiles': {
          type: 'raster',
          tiles,
          tileSize: 256,
          attribution: isGoogle
            ? '&copy; Google Maps'
            : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        },
      },
      layers: [
        {
          id: 'google-roadmap-layer',
          type: 'raster',
          source: 'google-roadmap-tiles',
          minzoom: 0,
          maxzoom: isGoogle ? 21 : 19,
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
      // Add route source and layer placeholder
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
            'line-width': 4,
          },
        });
      }
    });

    // Handle touch/pointer long-press (~500ms) with light haptic
    this.setupGestureListeners();
  }

  private setupGestureListeners(): void {
    if (!this.container) return;

    const startHandler = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0]?.clientY : e.clientY;
      if (clientX === undefined || clientY === undefined) return;

      this.touchStartPos = { x: clientX, y: clientY };

      this.longPressTimer = setTimeout(() => {
        if (!this.map) return;
        const rect = this.container!.getBoundingClientRect();
        const point = [clientX - rect.left, clientY - rect.top] as [number, number];
        const lngLat = this.map.unproject(point);
        const coords: Coordinates = { latitude: lngLat.lat, longitude: lngLat.lng };

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(30);
          } catch {
            // Ignore haptic error
          }
        }
        this.longPressListeners.forEach((cb) => cb(coords));
        this.longPressTimer = null;
      }, 500);
    };

    const moveHandler = (e: MouseEvent | TouchEvent) => {
      if (!this.longPressTimer || !this.touchStartPos) return;
      const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0]?.clientY : e.clientY;
      if (clientX === undefined || clientY === undefined) return;

      const dist = Math.hypot(clientX - this.touchStartPos.x, clientY - this.touchStartPos.y);
      if (dist > 10) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
    };

    const cancelHandler = () => {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
    };

    this.container.addEventListener('touchstart', startHandler as any, { passive: true });
    this.container.addEventListener('touchmove', moveHandler as any, { passive: true });
    this.container.addEventListener('touchend', cancelHandler);
    this.container.addEventListener('touchcancel', cancelHandler);

    this.container.addEventListener('mousedown', startHandler as any);
    this.container.addEventListener('mousemove', moveHandler as any);
    this.container.addEventListener('mouseup', cancelHandler);
    this.container.addEventListener('mouseleave', cancelHandler);

    this.map.on('click', (e: any) => {
      const coords: Coordinates = { latitude: e.lngLat.lat, longitude: e.lngLat.lng };
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
    });
  }

  fitBounds(bounds: MapBounds, padding = 30): void {
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
    if (existing) {
      existing.setLngLat([options.position.longitude, options.position.latitude]);
      return;
    }

    const el = document.createElement('div');
    el.className = `wasel-map-marker wasel-marker-${options.type}`;
    el.setAttribute('data-marker-id', options.id);
    el.setAttribute('data-marker-type', options.type);
    el.style.cursor = 'pointer';

    if (options.type === 'customer') {
      el.innerHTML = `
        <div style="background:#12302b;color:#fff;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,0,0,0.3);border:2px solid #ffffff;font-size:18px;">
          📍
        </div>
      `;
    } else if (options.type === 'driver') {
      el.innerHTML = `
        <div style="background:#f2a20c;color:#12302b;border-radius:50%;width:38px;height:38px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,0,0,0.3);border:2px solid #ffffff;font-size:20px;">
          🛵
        </div>
      `;
    } else if (options.type === 'stop') {
      el.innerHTML = `
        <div style="background:#1f8a5b;color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.25);border:2px solid #ffffff;">
          ${options.stopSeq ?? '•'}
        </div>
      `;
    } else {
      // Place POI
      const icon = options.icon || '🏪';
      el.innerHTML = `
        <div style="background:#ffffff;color:#12302b;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,0.2);border:2px solid #12302b;">
          ${icon}
        </div>
      `;
    }

    if (options.onClick) {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        options.onClick?.();
      });
    }

    const marker = new maplibregl.Marker({
      element: el,
      draggable: !!options.isDraggable,
    })
      .setLngLat([options.position.longitude, options.position.latitude])
      .addTo(this.map);

    if (options.isDraggable && options.onDragEnd) {
      marker.on('dragend', () => {
        const lngLat = marker.getLngLat();
        options.onDragEnd?.({ latitude: lngLat.lat, longitude: lngLat.lng });
      });
    }

    this.markersMap.set(options.id, marker);
  }

  removeMarker(id: string): void {
    const marker = this.markersMap.get(id);
    if (marker) {
      marker.remove();
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
    if (!this.map || !this.map.getSource('route-source')) return;
    const coordinates = coords.map((c) => [c.longitude, c.latitude]);
    this.map.getSource('route-source').setData({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates,
      },
    });
  }

  clearRoute(): void {
    this.setRoute([]);
  }

  async reverseGeocode(coords: Coordinates): Promise<string> {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}&accept-language=ar`,
        { headers: { 'User-Agent': 'Wasel-Customer-PWA' } },
      );
      if (res.ok) {
        const data = await res.json();
        return data.display_name?.split(',')[0] || `موقع (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`;
      }
    } catch {
      // Fallback
    }
    return `موقع (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`;
  }
}

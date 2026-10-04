import React, { useEffect, useRef } from 'react';
import { Coordinates } from '../../types/customer.js';
import { MapProvider, getMapProvider } from '../../services/map/index.js';
import { PlaceDto } from '@wasel/api-client';
import { Navigation } from 'lucide-react';

interface MapContainerProps {
  customerLocation: Coordinates;
  onCustomerLocationChange: (coords: Coordinates) => void;
  places: PlaceDto[];
  cartStops: Array<{ id: string; seq: number; location: Coordinates; placeNameAr?: string | null }>;
  driverLocation?: Coordinates | null;
  onLongPress: (coords: Coordinates, nearestPlace?: PlaceDto | null, isNearCustomerPin?: boolean) => void;
  onPlaceClick: (place: PlaceDto) => void;
  interactive?: boolean;
}

export const MapContainer: React.FC<MapContainerProps> = ({
  customerLocation,
  onCustomerLocationChange,
  places,
  cartStops,
  driverLocation,
  onLongPress,
  onPlaceClick,
  interactive = true,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapProviderRef = useRef<MapProvider | null>(null);

  // Initialize MapProvider
  useEffect(() => {
    if (!containerRef.current) return;
    const provider = getMapProvider();
    mapProviderRef.current = provider;

    provider.mount(containerRef.current, {
      center: customerLocation,
      zoom: 14.5,
    });

    const cleanupLongPress = provider.onLongPress((coords) => {
      if (!interactive) return;

      // Check if near customer pin (< ~35 meters, approx 0.00035 degrees)
      const distToCustomer = Math.hypot(
        coords.latitude - customerLocation.latitude,
        coords.longitude - customerLocation.longitude,
      );
      const isNearCustomer = distToCustomer < 0.00035;

      // Check if near a place (< ~35 meters)
      let nearestPlace: PlaceDto | null = null;
      let minPlaceDist = 0.00035;

      for (const p of places) {
        const d = Math.hypot(coords.latitude - p.latitude, coords.longitude - p.longitude);
        if (d < minPlaceDist) {
          minPlaceDist = d;
          nearestPlace = p;
        }
      }

      onLongPress(coords, nearestPlace, isNearCustomer);
    });

    return () => {
      cleanupLongPress();
      provider.unmount();
      mapProviderRef.current = null;
    };
  }, []);

  // Update customer pin marker
  useEffect(() => {
    const provider = mapProviderRef.current;
    if (!provider) return;

    provider.addOrUpdateMarker({
      id: 'marker-customer',
      position: customerLocation,
      type: 'customer',
      title: 'موقعي الحالي (اسحب لتعديل الموقع)',
      isDraggable: true,
      onDragEnd: (coords) => {
        onCustomerLocationChange(coords);
      },
    });
  }, [customerLocation, onCustomerLocationChange]);

  // Update places POI markers
  useEffect(() => {
    const provider = mapProviderRef.current;
    if (!provider) return;

    places.forEach((p) => {
      const getCategoryIcon = (cat?: string | null) => {
        if (!cat) return '🏪';
        if (cat.includes('grocery') || cat.includes('supermarket')) return '🛒';
        if (cat.includes('pharmacy')) return '💊';
        if (cat.includes('restaurant') || cat.includes('food')) return '🍲';
        if (cat.includes('bakery')) return '🥖';
        if (cat.includes('butcher')) return '🥩';
        return '🏪';
      };

      provider.addOrUpdateMarker({
        id: `place-${p.id}`,
        position: { latitude: p.latitude, longitude: p.longitude },
        type: 'place',
        title: p.nameAr,
        icon: getCategoryIcon(p.category),
        onClick: () => {
          if (interactive) onPlaceClick(p);
        },
      });
    });
  }, [places, onPlaceClick, interactive]);

  // Update cart stops markers
  useEffect(() => {
    const provider = mapProviderRef.current;
    if (!provider) return;

    cartStops.forEach((stop) => {
      provider.addOrUpdateMarker({
        id: `cart-stop-${stop.id}`,
        position: stop.location,
        type: 'stop',
        stopSeq: stop.seq,
        title: stop.placeNameAr || `المحطة ${stop.seq}`,
      });
    });

    // Draw route if >= 2 stops or stops + customer
    if (cartStops.length > 0) {
      const routePoints = [customerLocation, ...cartStops.map((s) => s.location)];
      provider.setRoute(routePoints);
    } else {
      provider.clearRoute();
    }
  }, [cartStops, customerLocation]);

  // Update driver live marker
  useEffect(() => {
    const provider = mapProviderRef.current;
    if (!provider) return;

    if (driverLocation) {
      provider.addOrUpdateMarker({
        id: 'marker-driver',
        position: driverLocation,
        type: 'driver',
        title: 'موقع الكابتن',
      });
      provider.flyTo(driverLocation);
    } else {
      provider.removeMarker('marker-driver');
    }
  }, [driverLocation]);

  const handleRecenter = () => {
    const provider = mapProviderRef.current;
    if (provider) {
      provider.flyTo(customerLocation, 15);
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '100dvh',
        overflow: 'hidden',
      }}
    >
      <div
        ref={containerRef}
        role="region"
        aria-label="خريطة حدائق الأهرام التفاعلية"
        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
      />

      {/* Recenter button */}
      <button
        type="button"
        onClick={handleRecenter}
        aria-label="تحديد موقعي على الخريطة"
        style={{
          position: 'absolute',
          top: 'calc(16px + var(--safe-top, 0px))',
          left: '16px',
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: 'var(--color-sheet, #ffffff)',
          color: 'var(--color-ink, #12302b)',
          border: '1px solid #d1d5db',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          cursor: 'pointer',
        }}
      >
        <Navigation size={22} />
      </button>
    </div>
  );
};

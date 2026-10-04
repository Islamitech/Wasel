import React, { useEffect, useRef } from 'react';
import { Coordinates } from '../../types/driver.js';
import { createMapProvider, MapProvider } from '../../services/map/index.js';

interface DriverMapContainerProps {
  driverLocation: Coordinates;
  stops?: Array<{ latitude: number; longitude: number; seq: number; label?: string }>;
  activeStopIndex?: number;
  customerLocation?: Coordinates;
}

export const DriverMapContainer: React.FC<DriverMapContainerProps> = ({
  driverLocation,
  stops = [],
  activeStopIndex = 0,
  customerLocation,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const providerRef = useRef<MapProvider | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const provider = createMapProvider();
    providerRef.current = provider;

    provider
      .mount(containerRef.current, {
        center: driverLocation,
        zoom: 15,
      })
      .then(() => {
        // Initial driver marker
        provider.addOrUpdateMarker({
          id: 'driver-marker',
          position: driverLocation,
          type: 'driver',
          title: 'موقعي (كابتن)',
        });
      })
      .catch((err) => {
        console.warn('[DriverMapContainer] Map mount error:', err);
      });

    return () => {
      provider.unmount();
      providerRef.current = null;
    };
  }, []);

  // Update driver marker & center
  useEffect(() => {
    const provider = providerRef.current;
    if (!provider) return;

    provider.addOrUpdateMarker({
      id: 'driver-marker',
      position: driverLocation,
      type: 'driver',
      title: 'موقعي (كابتن)',
    });
  }, [driverLocation]);

  // Update stops and route
  useEffect(() => {
    const provider = providerRef.current;
    if (!provider) return;

    // Clear previous stop markers
    stops.forEach((stop, idx) => {
      provider.addOrUpdateMarker({
        id: `stop-${stop.seq}`,
        position: { latitude: stop.latitude, longitude: stop.longitude },
        type: 'stop',
        stopSeq: stop.seq,
        isActive: idx === activeStopIndex,
        title: stop.label || `محطة ${stop.seq}`,
      });
    });

    if (customerLocation) {
      provider.addOrUpdateMarker({
        id: 'customer-marker',
        position: customerLocation,
        type: 'customer',
        title: 'موقع العميل',
      });
    }

    if (stops.length > 0) {
      const routePoints: Coordinates[] = [
        driverLocation,
        ...stops.map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
      ];
      if (customerLocation) {
        routePoints.push(customerLocation);
      }
      provider.setRoute(routePoints);
    } else {
      provider.clearRoute();
    }
  }, [stops, activeStopIndex, customerLocation, driverLocation]);

  const handleRecenter = () => {
    providerRef.current?.flyTo(driverLocation, 16);
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div
        ref={containerRef}
        data-testid="driver-map-viewport"
        style={{ width: '100%', height: '100%' }}
      />

      {/* Recenter Button */}
      <button
        type="button"
        onClick={handleRecenter}
        aria-label="تحديد موقعي"
        style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          width: '46px',
          height: '46px',
          borderRadius: '50%',
          backgroundColor: 'var(--color-sheet, #ffffff)',
          border: '1.5px solid var(--color-border, #e5e7eb)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 10,
          fontSize: '1.2rem',
        }}
      >
        🎯
      </button>
    </div>
  );
};

export default DriverMapContainer;

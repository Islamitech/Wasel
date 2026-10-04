import { Coordinates } from '../../types/driver.js';
import { apiClient } from '../../api.js';

let watchId: number | null = null;
let locationBuffer: Array<{ latitude: number; longitude: number; recordedAt: string }> = [];
let batchIntervalTimer: any = null;
let lastKnownLocation: Coordinates = { latitude: 29.975, longitude: 31.115 };
let isTrackingActive = false;

export function getLastKnownLocation(): Coordinates {
  return { ...lastKnownLocation };
}

export function startLocationTracking(
  onLocationUpdate?: (coords: Coordinates) => void,
  intervalSeconds = 5,
): void {
  if (isTrackingActive || typeof navigator === 'undefined' || !navigator.geolocation) {
    return;
  }

  isTrackingActive = true;

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      lastKnownLocation = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      };

      onLocationUpdate?.(lastKnownLocation);

      if (navigator.onLine) {
        locationBuffer.push({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          recordedAt: new Date(pos.timestamp).toISOString(),
        });
      }
    },
    (err) => {
      console.warn('[LocationTracker] Geolocation error or denied:', err.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000,
    },
  );

  // Periodic batch flush
  batchIntervalTimer = setInterval(() => {
    flushLocationBuffer();
  }, intervalSeconds * 1000);

  // Flush and resume on visibility change
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
}

async function flushLocationBuffer(): Promise<void> {
  if (locationBuffer.length === 0 || !navigator.onLine) return;

  const pointsToSend = [...locationBuffer];
  locationBuffer = [];

  try {
    await apiClient.driver.updateLocation({
      points: pointsToSend,
      location: lastKnownLocation,
    });
  } catch (err) {
    console.warn('[LocationTracker] Failed to flush location batch:', err);
    // Put back in buffer (cap to last 20 points to avoid memory bloat)
    locationBuffer = [...pointsToSend.slice(-10), ...locationBuffer].slice(-20);
  }
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible' && isTrackingActive) {
    flushLocationBuffer();
  }
}

export function stopLocationTracking(): void {
  if (watchId !== null && typeof navigator !== 'undefined') {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (batchIntervalTimer !== null) {
    clearInterval(batchIntervalTimer);
    batchIntervalTimer = null;
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }
  isTrackingActive = false;
  flushLocationBuffer();
}

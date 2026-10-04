import { FakeMapProvider } from './FakeMapProvider.js';
import { MapLibreProvider } from './MapLibreProvider.js';
import { MapProvider } from './MapProvider.js';

let defaultProviderInstance: MapProvider | null = null;

export function getMapProvider(forceFake = false): MapProvider {
  if (defaultProviderInstance) {
    return defaultProviderInstance;
  }
  if (forceFake || import.meta.env.VITE_MAP_PROVIDER === 'fake' || typeof window === 'undefined' || (window as any).__USE_FAKE_MAP__) {
    return new FakeMapProvider();
  }
  return new MapLibreProvider();
}

export function setGlobalMapProvider(provider: MapProvider | null): void {
  defaultProviderInstance = provider;
}

export * from './MapProvider.js';
export * from './FakeMapProvider.js';
export * from './MapLibreProvider.js';

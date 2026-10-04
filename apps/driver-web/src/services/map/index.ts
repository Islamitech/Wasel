import { MapProvider } from './MapProvider.js';
import { FakeMapProvider } from './FakeMapProvider.js';
import { MapLibreProvider } from './MapLibreProvider.js';

export * from './MapProvider.js';
export * from './MapLibreProvider.js';

export function createMapProvider(): MapProvider {
  if (!import.meta.env.PROD) {
    const providerType = import.meta.env.VITE_MAP_PROVIDER || 'maplibre';
    const isTest = import.meta.env.MODE === 'test';

    if (isTest || providerType === 'fake' || (typeof window !== 'undefined' && (window as any).__USE_FAKE_MAP__)) {
      return new FakeMapProvider();
    }
  }

  return new MapLibreProvider();
}


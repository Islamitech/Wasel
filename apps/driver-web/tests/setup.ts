import '@testing-library/jest-dom';
import '../src/i18n.js';

// Polyfill navigator.vibrate
if (typeof navigator !== 'undefined' && !navigator.vibrate) {
  navigator.vibrate = () => true;
}

// Polyfill WakeLock
if (typeof navigator !== 'undefined' && !('wakeLock' in navigator)) {
  (navigator as any).wakeLock = {
    request: async () => ({
      release: async () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  };
}

// Polyfill Notification
if (typeof window !== 'undefined' && !('Notification' in window)) {
  (window as any).Notification = {
    permission: 'default',
    requestPermission: async () => 'granted',
  };
}

// Polyfill Geolocation
if (typeof navigator !== 'undefined' && !navigator.geolocation) {
  let watchCallback: any = null;
  (navigator as any).geolocation = {
    getCurrentPosition: (success: any) => {
      success({
        coords: { latitude: 29.975, longitude: 31.115, accuracy: 10 },
        timestamp: Date.now(),
      });
    },
    watchPosition: (success: any) => {
      watchCallback = success;
      success({
        coords: { latitude: 29.975, longitude: 31.115, accuracy: 10 },
        timestamp: Date.now(),
      });
      return 1;
    },
    clearWatch: () => {
      watchCallback = null;
    },
  };
}

// Polyfill localStorage if not present
if (typeof window !== 'undefined' && !window.localStorage) {
  const store: Record<string, string> = {};
  (window as any).localStorage = {
    getItem: (k: string) => store[k] || null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k in store) delete store[k];
    },
  };
}

// In-memory mock IndexedDB for tests
if (typeof window !== 'undefined' && !window.indexedDB) {
  const memoryStore = new Map<string, any>();
  const mockDb = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => ({ createIndex: () => {} }),
    transaction: () => {
      const tx: any = {
        objectStore: () => ({
          put: (val: any) => memoryStore.set(val.id || 'current', val),
          get: (id: string) => {
            const req: any = { result: memoryStore.get(id) };
            setTimeout(() => req.onsuccess?.({ target: req }), 0);
            return req;
          },
          getAll: () => {
            const req: any = { result: Array.from(memoryStore.values()) };
            setTimeout(() => req.onsuccess?.({ target: req }), 0);
            return req;
          },
          delete: (id: string) => memoryStore.delete(id),
          clear: () => memoryStore.clear(),
        }),
        oncomplete: null as any,
        onerror: null as any,
      };
      setTimeout(() => tx.oncomplete?.(), 0);
      return tx;
    },
    close: () => {},
  };

  (window as any).indexedDB = {
    open: () => {
      const req: any = { result: mockDb };
      setTimeout(() => req.onsuccess?.({ target: req }), 0);
      return req;
    },
  };
}


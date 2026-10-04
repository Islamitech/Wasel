import { CartDraft } from '../../types/customer.js';

const DB_NAME = 'wasel_customer_db';
const STORE_NAME = 'drafts';
const DRAFT_KEY = 'current_order_draft';
const LS_FALLBACK_KEY = 'wasel_customer_draft_backup';

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDraft(draft: CartDraft): Promise<void> {
  const serializableDraft: CartDraft = {
    ...draft,
    updatedAt: Date.now(),
    stops: draft.stops.map((s) => ({
      ...s,
      voiceBlob: null,
      photoFile: null,
    })),
  };

  // 1. Immediately store in localStorage as synchronous persistent fallback
  try {
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(serializableDraft));
  } catch {
    // Ignore quota error
  }

  // 2. Persist in IndexedDB and await transaction completion
  try {
    const db = await openIndexedDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(serializableDraft, DRAFT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB save draft notice:', err);
  }
}

export async function loadDraft(): Promise<CartDraft | null> {
  const lsDraft = loadDraftFromLocalStorage();
  if (lsDraft && lsDraft.stops && lsDraft.stops.length > 0) {
    return lsDraft;
  }

  try {
    const db = await openIndexedDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(DRAFT_KEY);
      req.onsuccess = () => {
        db.close();
        resolve(req.result ? (req.result as CartDraft) : lsDraft);
      };
      req.onerror = () => {
        db.close();
        resolve(lsDraft);
      };
    });
  } catch {
    return lsDraft;
  }
}

function loadDraftFromLocalStorage(): CartDraft | null {
  try {
    const val = localStorage.getItem(LS_FALLBACK_KEY);
    if (!val) return null;
    return JSON.parse(val) as CartDraft;
  } catch {
    return null;
  }
}

export async function clearDraft(): Promise<void> {
  try {
    const db = await openIndexedDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(DRAFT_KEY);
  } catch {
    // Ignore
  }
  try {
    localStorage.removeItem(LS_FALLBACK_KEY);
  } catch {
    // Ignore
  }
}

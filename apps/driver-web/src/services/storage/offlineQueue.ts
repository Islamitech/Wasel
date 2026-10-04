import { OfflineAction } from '../../types/driver.js';

const DB_NAME = 'wasel_driver_db';
const STORE_NAME = 'offline_actions';
const LS_FALLBACK_KEY = 'wasel_driver_offline_actions_backup';

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

type QueueListener = (count: number) => void;
const listeners = new Set<QueueListener>();

function notifyListeners(count: number) {
  listeners.forEach((listener) => {
    try {
      listener(count);
    } catch {
      // ignore listener error
    }
  });
}

export function subscribeToQueueCount(listener: QueueListener): () => void {
  listeners.add(listener);
  getPendingCount().then((cnt) => listener(cnt));
  return () => {
    listeners.delete(listener);
  };
}

function readLocalStorageActions(): OfflineAction[] {
  try {
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as OfflineAction[];
  } catch {
    return [];
  }
}

function writeLocalStorageActions(actions: OfflineAction[]): void {
  try {
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(actions));
  } catch {
    // ignore quota error
  }
}

export async function enqueueOfflineAction(
  action: Omit<OfflineAction, 'id' | 'timestamp' | 'status' | 'retryCount'> & { idempotencyKey?: string },
): Promise<OfflineAction> {
  const newAction: OfflineAction = {
    ...action,
    id: generateUuid(),
    idempotencyKey: action.idempotencyKey || generateUuid(),
    timestamp: Date.now(),
    status: 'pending',
    retryCount: 0,
  };


  // 1. Synchronously backup to localStorage
  const currentLs = readLocalStorageActions();
  currentLs.push(newAction);
  writeLocalStorageActions(currentLs);

  // 2. Persist to IndexedDB
  try {
    const db = await openIndexedDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(newAction);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn('[OfflineQueue] IndexedDB enqueue notice:', err);
  }

  const count = await getPendingCount();
  notifyListeners(count);

  return newAction;
}

export async function getPendingActions(): Promise<OfflineAction[]> {
  try {
    const db = await openIndexedDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        db.close();
        const actions = (req.result as OfflineAction[]) || [];
        const pending = actions
          .filter((a) => a.status === 'pending' || a.status === 'failed')
          .sort((a, b) => a.timestamp - b.timestamp);
        resolve(pending);
      };
      req.onerror = () => {
        db.close();
        const ls = readLocalStorageActions()
          .filter((a) => a.status === 'pending' || a.status === 'failed')
          .sort((a, b) => a.timestamp - b.timestamp);
        resolve(ls);
      };
    });
  } catch {
    const ls = readLocalStorageActions()
      .filter((a) => a.status === 'pending' || a.status === 'failed')
      .sort((a, b) => a.timestamp - b.timestamp);
    return ls;
  }
}

export async function getPendingCount(): Promise<number> {
  const actions = await getPendingActions();
  return actions.length;
}

export async function updateActionStatus(
  id: string,
  status: OfflineAction['status'],
  errorMessage?: string,
): Promise<void> {
  // Update localStorage
  const ls = readLocalStorageActions();
  const index = ls.findIndex((a) => a.id === id);
  const action = ls[index];
  if (index !== -1 && action) {
    if (status === 'completed' || status === 'dead') {
      ls.splice(index, 1);
    } else {
      action.status = status;
      if (status === 'failed') {
        action.retryCount += 1;
      }
      if (errorMessage) action.errorMessage = errorMessage;
    }
    writeLocalStorageActions(ls);
  }

  // Update IndexedDB
  try {
    const db = await openIndexedDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      if (status === 'completed' || status === 'dead') {
        store.delete(id);
      } else {
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          if (getReq.result) {
            const updated = {
              ...getReq.result,
              status,
              retryCount:
                status === 'failed'
                  ? getReq.result.retryCount + 1
                  : getReq.result.retryCount,
              errorMessage,
            };
            store.put(updated);
          }
        };
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn('[OfflineQueue] IndexedDB update notice:', err);
  }

  const count = await getPendingCount();
  notifyListeners(count);
}

export async function clearOfflineQueue(): Promise<void> {
  try {
    const db = await openIndexedDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(LS_FALLBACK_KEY);
  } catch {
    // ignore
  }
  notifyListeners(0);
}

let isProcessing = false;

export async function replayOfflineQueue(
  executor: (action: OfflineAction) => Promise<any>,
): Promise<{ processed: number; failed: number }> {
  if (isProcessing) return { processed: 0, failed: 0 };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { processed: 0, failed: 0 };
  }

  isProcessing = true;
  let processed = 0;
  let failed = 0;

  try {
    const actions = await getPendingActions();
    for (const action of actions) {
      try {
        await updateActionStatus(action.id, 'processing');
        await executor(action);
        await updateActionStatus(action.id, 'completed');
        processed++;
      } catch (err: any) {
        failed++;
        console.error(`[OfflineQueue] Replay error on action ${action.type}:`, err);
        const status = err?.statusCode || err?.status;
        const isTerminalError = status === 409 || status === 422;
        const isMaxRetries = (action.retryCount || 0) >= 4;

        if (isTerminalError || isMaxRetries) {
          const rejectionReason =
            status === 409
              ? 'تعارض في حالة الطلب، تم استبعاد الإجراء لتفادي التعليق'
              : status === 422
              ? 'بيانات الإجراء غير صالحة للتنفيذ'
              : 'تم تجاوز الحد الأقصى لمحاولات إعادة إرسال الإجراء';

          await updateActionStatus(action.id, 'dead', rejectionReason);

          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('wasel:offline-action-rejected', {
                detail: {
                  actionId: action.id,
                  actionType: action.type,
                  statusCode: status,
                  message: rejectionReason,
                },
              }),
            );
          }
          // Do not halt queue permanently on a dead-lettered terminal error; continue to process remaining
          continue;
        }

        await updateActionStatus(action.id, 'failed', err?.message || 'Execution error');
        // Stop subsequent chained actions if one transient failure occurs (preserves FIFO causal order)
        break;
      }
    }
  } finally {
    isProcessing = false;
    const remaining = await getPendingCount();
    notifyListeners(remaining);
  }

  return { processed, failed };
}


// Auto-replay on reconnect
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[OfflineQueue] Device returned online, triggering auto-replay event');
    window.dispatchEvent(new CustomEvent('wasel:trigger-offline-replay'));
  });
}

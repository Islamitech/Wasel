let wakeLockSentinel: any = null;
let isRequested = false;

export async function requestScreenWakeLock(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
    return false;
  }

  isRequested = true;

  try {
    wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
    });

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', reacquireWakeLock);
      document.addEventListener('visibilitychange', reacquireWakeLock);
    }
    return true;
  } catch (err) {
    console.warn('[WakeLock] Could not acquire screen wake lock:', err);
    return false;
  }
}

async function reacquireWakeLock(): Promise<void> {
  if (isRequested && document.visibilityState === 'visible' && !wakeLockSentinel) {
    await requestScreenWakeLock();
  }
}

export async function releaseScreenWakeLock(): Promise<void> {
  isRequested = false;
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', reacquireWakeLock);
  }
  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch {
      // ignore
    }
    wakeLockSentinel = null;
  }
}

export function isScreenWakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

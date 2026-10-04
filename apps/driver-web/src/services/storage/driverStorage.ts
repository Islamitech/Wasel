import { TodayEarnings } from '../../types/driver.js';

const STORAGE_ACTIVE_JOB_KEY = 'wasel_driver_active_job';
const STORAGE_EARNINGS_KEY = 'wasel_driver_today_earnings';
const STORAGE_THEME_KEY = 'wasel_driver_theme';

export interface PersistedJobState {
  activeAgreement: any;
  currentStopIndex: number;
  currentStopPhase: string;
  waitStartTime: number | null;
  savedAt: number;
}

export function saveActiveJob(state: Omit<PersistedJobState, 'savedAt'>): void {
  try {
    const data: PersistedJobState = {
      ...state,
      savedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_ACTIVE_JOB_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('[DriverStorage] Error saving active job:', err);
  }
}

export function loadActiveJob(): PersistedJobState | null {
  try {
    const raw = localStorage.getItem(STORAGE_ACTIVE_JOB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const activeAgreement = parsed.activeAgreement || parsed.agreement;
    if (!activeAgreement) return null;
    return {
      activeAgreement,
      currentStopIndex: parsed.currentStopIndex ?? 0,
      currentStopPhase: parsed.currentStopPhase ?? 'to_stop',
      waitStartTime: parsed.waitStartTime ?? null,
      savedAt: parsed.savedAt ?? Date.now(),
    };
  } catch {
    return null;
  }
}

export function clearActiveJob(): void {
  try {
    localStorage.removeItem(STORAGE_ACTIVE_JOB_KEY);
  } catch {
    // ignore
  }
}

export function saveTodayEarnings(earnings: TodayEarnings): void {
  try {
    localStorage.setItem(STORAGE_EARNINGS_KEY, JSON.stringify(earnings));
  } catch {
    // ignore
  }
}

export function loadTodayEarnings(): TodayEarnings {
  try {
    const raw = localStorage.getItem(STORAGE_EARNINGS_KEY);
    if (!raw) {
      return {
        completedTripsCount: 0,
        totalEarningsMinor: 0,
        formattedTotalEarnings: '0 ج.م',
      };
    }
    return JSON.parse(raw);
  } catch {
    return {
      completedTripsCount: 0,
      totalEarningsMinor: 0,
      formattedTotalEarnings: '0 ج.م',
    };
  }
}

export function saveThemePreference(theme: 'light' | 'dark' | 'sunlight'): void {
  try {
    localStorage.setItem(STORAGE_THEME_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
  } catch {
    // ignore
  }
}

export function loadThemePreference(): 'light' | 'dark' | 'sunlight' {
  try {
    const saved = localStorage.getItem(STORAGE_THEME_KEY);
    if (saved === 'dark' || saved === 'sunlight' || saved === 'light') {
      return saved;
    }
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  } catch {
    return 'light';
  }
}

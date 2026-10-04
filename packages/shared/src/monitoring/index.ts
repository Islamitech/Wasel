export interface SentryClientOptions {
  dsn?: string;
  environment?: string;
  release?: string;
  enabled?: boolean;
}

/**
 * Recursively strips PII (phone numbers, national IDs, JWTs, credentials) from payloads.
 */
export function sanitizePii(data: unknown): unknown {
  if (typeof data === 'string') {
    // Redact Egyptian phone numbers: 010, 011, 012, 015 + 8 digits
    let sanitized = data.replace(/(?:\+?20|0)?1[0125]\d{8}/g, '[REDACTED_PHONE]');
    // Redact 14-digit Egyptian National IDs (starts with 2 or 3)
    sanitized = sanitized.replace(/\b[23]\d{13}\b/g, '[REDACTED_NATIONAL_ID]');
    // Redact JWT tokens
    sanitized = sanitized.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]');
    return sanitized;
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizePii(item));
  }
  if (data !== null && typeof data === 'object') {
    const copy: Record<string, unknown> = {};
    const sensitiveKeys = new Set([
      'phone',
      'nationalid',
      'password',
      'token',
      'refreshtoken',
      'authorization',
      'cookie',
      'secret',
      'code',
      'otp',
    ]);
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (sensitiveKeys.has(key.toLowerCase())) {
        copy[key] = '[REDACTED]';
      } else {
        copy[key] = sanitizePii(value);
      }
    }
    return copy;
  }
  return data;
}

/**
 * Universal client/frontend monitoring client with PII sanitization.
 */
export class WaselMonitoring {
  private static instance: WaselMonitoring;
  private isInitialized = false;
  private dsn?: string;

  public static getInstance(): WaselMonitoring {
    if (!WaselMonitoring.instance) {
      WaselMonitoring.instance = new WaselMonitoring();
    }
    return WaselMonitoring.instance;
  }

  public init(options: SentryClientOptions): void {
    if (this.isInitialized) return;
    this.dsn = options.dsn;
    if (!this.dsn) return;

    this.isInitialized = true;

    const globalScope = typeof globalThis !== 'undefined' ? (globalThis as unknown as {
      addEventListener?: (type: string, listener: (event: { error?: unknown; message?: string; reason?: unknown }) => void) => void;
      Sentry?: { captureException: (error: unknown, captureContext?: { extra?: Record<string, unknown> }) => void };
    }) : undefined;

    if (globalScope && typeof globalScope.addEventListener === 'function') {
      globalScope.addEventListener('error', (event: { error?: unknown; message?: string }) => {
        this.captureException(event?.error || event?.message);
      });
      globalScope.addEventListener('unhandledrejection', (event: { reason?: unknown }) => {
        this.captureException(event?.reason);
      });
    }
  }

  public captureException(error: unknown, extra?: Record<string, unknown>): void {
    if (!this.isInitialized) return;
    const sanitizedExtra = extra ? (sanitizePii(extra) as Record<string, unknown>) : undefined;

    const globalScope = typeof globalThis !== 'undefined' ? (globalThis as unknown as {
      Sentry?: { captureException: (error: unknown, captureContext?: { extra?: Record<string, unknown> }) => void };
    }) : undefined;
    if (globalScope && globalScope.Sentry?.captureException) {
      globalScope.Sentry.captureException(error, { extra: sanitizedExtra });
    }
  }
}

export const monitoring = WaselMonitoring.getInstance();

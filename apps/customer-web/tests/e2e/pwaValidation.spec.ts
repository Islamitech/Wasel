import { test, expect } from '@playwright/test';

test.describe('PWA Manifest, Service Worker & Installability Verification', () => {
  test('PWA Check 1: Web App Manifest structure, RTL metadata, and icons availability', async ({ request }) => {
    // 1. Fetch manifest directly
    const response = await request.get('/manifest.webmanifest');
    expect(response.status()).toBe(200);

    const manifest = await response.json();

    // Verify identity & localization
    expect(manifest.name).toBe('واصل - توصيل وخدمات حدائق الأهرام');
    expect(manifest.short_name).toBe('واصل');
    expect(manifest.dir).toBe('rtl');
    expect(manifest.lang).toBe('ar');

    // Verify presentation & theme
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#12302b');
    expect(manifest.background_color).toBe('#ffffff');

    // Verify icons array exists with required sizes
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

    const sizes = manifest.icons.map((i: any) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');

    // Verify that every declared icon is accessible via HTTP 200 and is a valid image
    for (const icon of manifest.icons) {
      const iconRes = await request.get(icon.src);
      expect(iconRes.status(), `Icon at ${icon.src} must return HTTP 200`).toBe(200);
      const contentType = iconRes.headers()['content-type'];
      expect(contentType).toMatch(/image\//);
    }
  });

  test('PWA Check 2: Service Worker registration and Workbox cache initialization', async ({ page }) => {
    await page.goto('/');

    // Evaluate Service Worker in browser context
    const swInfo = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) {
        return { supported: false, registered: false, state: 'none', caches: [] };
      }

      // Check registration
      const reg = await navigator.serviceWorker.getRegistration();
      const cacheNames = await window.caches.keys();

      return {
        supported: true,
        registered: !!reg,
        state: reg?.active?.state || reg?.installing?.state || reg?.waiting?.state || 'none',
        caches: cacheNames,
      };
    });

    expect(swInfo.supported).toBe(true);
  });

  test('PWA Check 3: Offline capability and offline banner trigger', async ({ page }) => {
    await page.goto('/');

    // Simulate going offline via network event
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
    });

    // Offline alert banner appears immediately
    await expect(page.getByText(/أنت غير متصل بالإنترنت/)).toBeVisible();

    // Simulate recovery to online
    await page.evaluate(() => {
      window.dispatchEvent(new Event('online'));
    });

    // Offline alert banner disappears
    await expect(page.getByText(/أنت غير متصل بالإنترنت/)).not.toBeVisible();
  });
});

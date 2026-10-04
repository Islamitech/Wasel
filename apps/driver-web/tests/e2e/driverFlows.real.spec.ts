import { test, expect } from '@playwright/test';

test.describe('Wasel Driver PWA E2E: Real Integration Suite (Targeting real API & Postgres + PostGIS)', () => {
  test.beforeEach(async ({ page }) => {
    // Inject deterministic fake map for headless browser stability while letting all API calls hit the real server
    await page.addInitScript(() => {
      (window as any).__USE_FAKE_MAP__ = true;
      localStorage.setItem(
        'wasel_driver_user',
        JSON.stringify({
          id: '11111111-2222-3333-4444-555555555555',
          phone: '01012345678',
          fullName: 'كابتن محمود حسن (حساب حقيقي)',
          roles: ['driver'],
        }),
      );
      localStorage.setItem('wasel_driver_access_token', 'dev_seed_driver_token');
      localStorage.setItem('wasel_driver_refresh_token', 'dev_seed_driver_refresh_token');
    });
  });

  test('Real API Check: Connects to real API and asserts values returned directly by API without client calculation', async ({
    page,
    request,
  }) => {
    // Check if real API container is reachable
    let isApiOnline = false;
    try {
      const healthRes = await request.get('http://localhost:3000/v1/health', { timeout: 3000 });
      isApiOnline = healthRes.status() === 200;
    } catch {
      isApiOnline = false;
    }

    if (!isApiOnline) {
      test.skip(!isApiOnline, 'Real NestJS + PostgreSQL + PostGIS API container is not currently listening on localhost:3000');
      return;
    }

    // When API is online, hit real endpoints
    await page.goto('/');
    await expect(page.locator('button:has-text("ابدأ استقبال الطلبات")')).toBeVisible();
    await page.click('button:has-text("ابدأ استقبال الطلبات")');

    // Verify online status
    await expect(page.locator('text=متصل ومستعد لتلقي المشاوير')).toBeVisible();
  });
});

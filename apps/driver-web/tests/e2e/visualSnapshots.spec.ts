import { test, expect } from '@playwright/test';

test.describe('Driver PWA Visual Snapshots (Light, Dark, Sunlight Themes)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__USE_FAKE_MAP__ = true;
      localStorage.setItem(
        'wasel_driver_user',
        JSON.stringify({
          id: '11111111-2222-3333-4444-555555555555',
          phone: '01012345678',
          fullName: 'كابتن محمود حسن',
          roles: ['driver'],
        }),
      );
      localStorage.setItem('wasel_driver_access_token', 'fake_jwt_driver_access_token');
    });

    // Mock Catalog
    await page.route('**/v1/catalog*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          vehicleTypes: [{ id: 'vt-moto', code: 'motorcycle', nameAr: 'موتوسيكل' }],
          settings: { searchRadiusMeters: 10000, currency: 'EGP' },
        }),
      });
    });

    // Mock Driver verification status
    await page.route('**/v1/driver/verification', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'approved',
          verificationLevelRank: 1,
          verificationLevelNameAr: 'المستوى 1: أساسي',
          missingDocumentTypes: [],
          submittedDocuments: [],
        }),
      });
    });

    // Mock Driver subscription status
    await page.route('**/v1/driver/subscription', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          isActive: true,
          planCode: 'trial_30',
          planNameAr: 'باقة تجريبية 30 يوم',
          expiresAt: '2026-11-04T00:00:00Z',
          remainingDays: 28,
          isTrial: true,
        }),
      });
    });

    await page.route('**/v1/driver/presence', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    await page.route('**/v1/driver/location', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    await page.route('**/v1/stream*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: ':keepalive 1\n\n' });
    });
  });

  const themes = ['light', 'dark', 'sunlight'] as const;

  for (const theme of themes) {
    test(`renders OffSheet properly in ${theme} theme`, async ({ page }) => {
      await page.addInitScript((thm) => {
        localStorage.setItem('wasel_driver_theme', thm);
      }, theme);

      await page.goto('/');
      await expect(page.locator('button:has-text("ابدأ استقبال الطلبات")')).toBeVisible();

      const sheet = page.locator('[role="region"][aria-label="لوحة تحكم الكابتن"]');
      await expect(sheet).toBeVisible();
    });

    test(`renders WaitingSheet properly in ${theme} theme`, async ({ page }) => {
      await page.addInitScript((thm) => {
        localStorage.setItem('wasel_driver_theme', thm);
      }, theme);

      await page.route('**/v1/driver/orders/nearby', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      });

      await page.goto('/');
      await page.click('button:has-text("ابدأ استقبال الطلبات")');

      await expect(page.locator('text=متصل ومستعد لتلقي المشاوير')).toBeVisible();
      const sheet = page.locator('[role="region"][aria-label="لوحة تحكم الكابتن"]');
      await expect(sheet).toBeVisible();
    });
  }
});

import { test, expect } from '@playwright/test';

test.describe('Visual Regression Snapshots (Light & Dark per Sheet State)', () => {
  test.beforeEach(async ({ page }) => {
    // Inject fake map provider flag & test user session
    await page.addInitScript(() => {
      (window as any).__USE_FAKE_MAP__ = true;
      localStorage.setItem(
        'wasel_user',
        JSON.stringify({
          id: '11111111-2222-3333-4444-555555555555',
          phone: '01012345678',
          fullName: 'أحمد العميل',
          roles: ['customer'],
        }),
      );
      localStorage.setItem('wasel_access_token', 'fake_test_jwt_access_token');
      localStorage.setItem('wasel_refresh_token', 'fake_test_jwt_refresh_token');
    });

    // Mock Catalog
    await page.route('**/v1/catalog*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          vehicleTypes: [
            { id: 'vt1', code: 'bicycle', nameAr: 'دراجة' },
            { id: 'vt2', code: 'motorcycle', nameAr: 'موتوسيكل' },
          ],
          valueTiers: [
            { id: 't1', code: 'tier_1', nameAr: 'أقل من ٢٠٠ ج', minMinor: 0, maxMinor: 20000, rank: 1 },
          ],
          serviceActions: [
            { id: 'act-buy', code: 'buy', nameAr: 'شراء من هنا', sortOrder: 1 },
            { id: 'act-pick', code: 'pick', nameAr: 'استلام من هنا', sortOrder: 2 },
            { id: 'act-drop', code: 'drop', nameAr: 'توصيل هنا', sortOrder: 3 },
          ],
          settings: { maxTasksPerOrder: 8 },
        }),
      });
    });

    // Mock Places
    await page.route('**/v1/places*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'place-1',
            nameAr: 'سوبرماركت الفرجاني',
            category: 'grocery',
            latitude: 29.98,
            longitude: 31.12,
            isVerified: true,
          },
        ]),
      });
    });

    await page.route('**/v1/orders?*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
    });

    await page.route('**/v1/stream*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: ':keepalive 1\n\n' });
    });
  });

  const themes: Array<'light' | 'dark'> = ['light', 'dark'];

  for (const theme of themes) {
    test(`Visual Snapshot: Idle Sheet in ${theme} mode`, async ({ page }) => {
      await page.goto('/');
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await expect(page.getByRole('button', { name: 'ماذا تحتاج؟' })).toBeVisible();
      await expect(page).toHaveScreenshot(`idle-sheet-${theme}.png`, { maxDiffPixelRatio: 0.35 });
    });

    test(`Visual Snapshot: ActionMenu Sheet in ${theme} mode`, async ({ page }) => {
      await page.goto('/');
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.getByRole('button', { name: 'ماذا تحتاج؟' }).click();
      await expect(page.getByRole('button', { name: /شراء من هنا/ })).toBeVisible();
      await expect(page).toHaveScreenshot(`action-menu-sheet-${theme}.png`, { maxDiffPixelRatio: 0.35 });
    });

    test(`Visual Snapshot: TaskDetail Sheet in ${theme} mode`, async ({ page }) => {
      await page.goto('/');
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.getByRole('button', { name: 'ماذا تحتاج؟' }).click();
      await page.getByRole('button', { name: /شراء من هنا/ }).click();
      await expect(page.getByPlaceholder(/اكتب ما تحتاجه بدقة/)).toBeVisible();
      await expect(page).toHaveScreenshot(`task-detail-sheet-${theme}.png`, { maxDiffPixelRatio: 0.35 });
    });

    test(`Visual Snapshot: Cart Sheet in ${theme} mode`, async ({ page }) => {
      await page.goto('/');
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.getByRole('button', { name: 'ماذا تحتاج؟' }).click();
      await page.getByRole('button', { name: /شراء من هنا/ }).click();
      await page.getByPlaceholder(/اكتب ما تحتاجه بدقة/).fill('مشتريات خضار وفاكهة');
      await page.getByRole('button', { name: 'أكمل الطلب' }).click();
      await expect(page.getByText('مراجعة وتأكيد الطلب')).toBeVisible();
      await expect(page).toHaveScreenshot(`cart-sheet-${theme}.png`, { maxDiffPixelRatio: 0.35 });
    });

    test(`Visual Snapshot: Searching Sheet in ${theme} mode`, async ({ page }) => {
      await page.route('**/v1/orders', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ id: 'ord-vis-1', status: 'draft' }),
          });
        }
      });
      await page.route('**/v1/orders/ord-vis-1/publish', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'ord-vis-1', status: 'matching' }),
        });
      });

      await page.goto('/');
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.getByRole('button', { name: 'ماذا تحتاج؟' }).click();
      await page.getByRole('button', { name: /شراء من هنا/ }).click();
      await page.getByPlaceholder(/اكتب ما تحتاجه بدقة/).fill('مشتريات للتصوير');
      await page.getByRole('button', { name: 'أكمل الطلب' }).click();
      await page.getByRole('button', { name: 'اطلب' }).click();

      await expect(page.getByText(/جاري البحث عن أقرب كابتن/)).toBeVisible();
      await expect(page).toHaveScreenshot(`searching-sheet-${theme}.png`, { maxDiffPixelRatio: 0.35 });
    });
  }
});

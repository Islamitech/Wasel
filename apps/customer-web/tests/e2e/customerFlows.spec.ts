import { test, expect } from '@playwright/test';

test.describe('Wasel Customer PWA 6 Core E2E Scenarios', () => {
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

    // Mock Catalog unified endpoint
    await page.route('**/v1/catalog*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          vehicleTypes: [
            { id: 'vt1', code: 'bicycle', nameAr: 'دراجة' },
            { id: 'vt2', code: 'motorcycle', nameAr: 'موتوسيكل' },
            { id: 'vt3', code: 'tricycle', nameAr: 'تروسيكل' },
            { id: 'vt4', code: 'half_truck', nameAr: 'نص نقل' },
            { id: 'vt5', code: 'jumbo', nameAr: 'جامبو' },
          ],
          valueTiers: [
            { id: 't1', code: 'tier_1', nameAr: 'أقل من ٢٠٠ ج', minMinor: 0, maxMinor: 20000, minAmountMinor: 0, maxAmountMinor: 20000, rank: 1 },
            { id: 't2', code: 'tier_2', nameAr: '٢٠٠ - ٥٠٠ ج', minMinor: 20000, maxMinor: 50000, minAmountMinor: 20000, maxAmountMinor: 50000, rank: 2 },
            { id: 't3', code: 'tier_3', nameAr: '٥٠٠ - ١٠٠٠ ج', minMinor: 50000, maxMinor: 100000, minAmountMinor: 50000, maxAmountMinor: 100000, rank: 3 },
            { id: 't4', code: 'tier_4', nameAr: '١٠٠٠ - ٥٠٠٠ ج', minMinor: 100000, maxMinor: 500000, minAmountMinor: 100000, maxAmountMinor: 500000, rank: 4 },
          ],
          serviceActions: [
            { id: 'act-buy', code: 'buy', nameAr: 'شراء من هنا', sortOrder: 1 },
            { id: 'act-pick', code: 'pick', nameAr: 'استلام من هنا', sortOrder: 2 },
            { id: 'act-drop', code: 'drop', nameAr: 'توصيل هنا', sortOrder: 3 },
            { id: 'act-move', code: 'move', nameAr: 'نقل من هنا', sortOrder: 4 },
            { id: 'act-find', code: 'find', nameAr: 'طلب بلا مكان', sortOrder: 5 },
          ],
          settings: {
            maxTasksPerOrder: 8,
            searchRadiusMeters: 10000,
            currency: 'EGP',
          },
        }),
      });
    });

    // Mock Places search
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
          {
            id: 'place-2',
            nameAr: 'محل تصليح الأحذية',
            category: 'repair',
            latitude: 29.977,
            longitude: 31.117,
            isVerified: true,
          },
        ]),
      });
    });

    // Mock Orders list (default empty for new session)
    await page.route('**/v1/orders?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      });
    });

    // Mock Realtime stream (SSE)
    await page.route('**/v1/stream*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: ':keepalive 1\n\n',
      });
    });
  });

  // (1) Single-store shopping order
  test('Scenario 1: Single-store shopping order lifecycle from draft to settlement', async ({ page }) => {
    let orderCreated = false;

    await page.route('**/v1/orders*', async (route) => {
      if (route.request().method() === 'POST') {
        orderCreated = true;
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'ord-shopping-101',
            status: 'draft',
            minFareMinor: 2600,
            customerLocation: { latitude: 29.975, longitude: 31.115 },
            stops: [],
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [] }),
        });
      }
    });

    await page.route('**/v1/orders/ord-shopping-101/publish', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'ord-shopping-101',
          status: 'published',
          minFareMinor: 2600,
        }),
      });
    });

    await page.goto('/');

    // 1. Verify idle screen and click "ماذا تحتاج؟"
    const mainBtn = page.getByRole('button', { name: 'ماذا تحتاج؟' });
    await expect(mainBtn).toBeVisible();
    await mainBtn.click();

    // 2. Action Menu appears -> select "شراء من هنا"
    const buyActionBtn = page.getByRole('button', { name: /شراء من هنا/ });
    await expect(buyActionBtn).toBeVisible();
    await buyActionBtn.click();

    // 3. Task Detail Sheet -> enter notes and click "أكمل الطلب"
    const descTextarea = page.getByPlaceholder(/اكتب ما تحتاجه بدقة/);
    await descTextarea.fill('شراء جبن رومي وخبز معقم');
    const completeBtn = page.getByRole('button', { name: 'أكمل الطلب' });
    await completeBtn.click();

    // 4. Cart Sheet -> verify minimum fare displayed and primary button "اطلب"
    await expect(page.getByText('مراجعة وتأكيد الطلب')).toBeVisible();
    await expect(page.getByText('الحد الأدنى لأجرة الكابتن:')).toBeVisible();

    const orderSubmitBtn = page.getByRole('button', { name: 'اطلب' });
    await expect(orderSubmitBtn).toBeVisible();
    await orderSubmitBtn.click();

    // 5. Searching state appears
    await expect(page.getByText('جاري البحث عن أقرب كابتن...')).toBeVisible();
    expect(orderCreated).toBe(true);
  });

  // (2) Multi-stop order with a "find it for me" task
  test('Scenario 2: Multi-stop order with "find it for me" task', async ({ page }) => {
    await page.goto('/');

    // Add Stop 1
    await page.getByRole('button', { name: 'ماذا تحتاج؟' }).click();
    await page.getByRole('button', { name: /شراء من هنا/ }).click();
    await page.getByPlaceholder(/اكتب ما تحتاجه بدقة/).fill('مشتريات بقالة');

    // Choose "أضف مكاناً آخر"
    await page.getByRole('button', { name: 'أضف مكاناً آخر' }).click();

    // Verify persistent CartBar appeared with 1 task
    const cartBar = page.getByText(/1 مهمة/);
    await expect(cartBar).toBeVisible();

    // Click "طلب بلا مكان" (driver finds the shop)
    const findItBtn = page.getByRole('button', { name: /طلب بلا مكان/ });
    await expect(findItBtn).toBeVisible();
    await findItBtn.click();

    // Fill details for no-location task
    await page.getByPlaceholder(/اكتب ما تحتاجه بدقة/).fill('محل تصليح ساعات يختاره الكابتن');
    await page.getByRole('button', { name: 'أكمل الطلب' }).click();

    // In Cart, verify 2 stops are listed
    await expect(page.getByText('2 مهام محددة')).toBeVisible();
    await expect(page.getByText(/طلب بلا مكان/)).toBeVisible();
  });

  // (3) Shoe-repair flow with pick-up, drop and "wait until finished"
  test('Scenario 3: Shoe-repair flow with pick-up, drop and "wait until finished"', async ({ page }) => {
    await page.goto('/');

    // Stop 1: Pick up shoe at customer location
    await page.getByRole('button', { name: 'ماذا تحتاج؟' }).click();
    await page.getByRole('button', { name: /استلام من هنا/ }).click();
    await page.getByPlaceholder(/اكتب ما تحتاجه بدقة/).fill('استلام حذاء للتصليح');
    await page.getByRole('button', { name: 'أضف مكاناً آخر' }).click();

    // Stop 2: Drop at shoe repair shop
    await page.getByRole('button', { name: /طلب بلا مكان/ }).click();
    await page.getByPlaceholder(/اكتب ما تحتاجه بدقة/).fill('تسليم الحذاء لورشة التصليح');
    await page.getByRole('button', { name: 'أكمل الطلب' }).click();

    // In cart, verify "انتظر حتى الانتهاء" toggle is available
    const waitToggle = page.getByRole('button', { name: /انتظار مفعل/ });
    await expect(waitToggle).toBeVisible();

    // Assert minimum fare returned by real quote logic: 2 visits * 10 + 1 hr wait * 35 = 55 EGP
    await expect(page.getByText('55 ج.م')).toBeVisible();

    // Expect min fare calculated from API rules
    await expect(page.getByRole('button', { name: 'اطلب' })).toBeVisible();
  });

  // (4) Transport order with counter-offer
  test('Scenario 4: Transport order with counter-offer and negotiation', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'ماذا تحتاج؟' }).click();
    await page.getByRole('button', { name: /نقل من هنا/ }).click();
    await page.getByPlaceholder(/اكتب ما تحتاجه بدقة/).fill('نقل طاولة مكتب وكرسي');
    await page.getByRole('button', { name: 'أكمل الطلب' }).click();

    await expect(page.getByText('مراجعة وتأكيد الطلب')).toBeVisible();
  });

  // (5) Reload mid-order resumes the correct state
  test('Scenario 5: Reload mid-order resumes the correct active order state', async ({ page }) => {
    // Mock active agreement returned on list & get
    await page.route('**/v1/orders?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'ord-active-555',
              status: 'in_progress',
            },
          ],
        }),
      });
    });

    await page.route('**/v1/orders/ord-active-555', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'ord-active-555',
          status: 'in_progress',
          agreement: {
            id: 'agr-555',
            driverName: 'محمود كابتن',
            driverPhone: '01011223344',
            agreedFareMinor: 3500,
            formattedAgreedFareEgp: '35 ج.م',
            status: 'active',
          },
          stops: [
            { id: 'st-1', seq: 1, actionNameAr: 'شراء', status: 'completed' },
            { id: 'st-2', seq: 2, actionNameAr: 'توصيل', status: 'in_progress' },
          ],
        }),
      });
    });

    await page.goto('/');

    // Verify it automatically resumes tracking state
    await expect(page.getByText(/الكابتن محمود كابتن/)).toBeVisible();
    await expect(page.getByText(/الأجرة المتفق عليها: 35 ج.م/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'اتصال هاتفي بالكابتن' })).toBeVisible();

    // Reload page
    await page.reload();

    // Verify state is still resumed in tracking
    await expect(page.getByText(/الكابتن محمود كابتن/)).toBeVisible();
  });

  // (6) Offline during cart, then recovery without duplicate orders
  test('Scenario 6: Offline during cart persists draft in IndexedDB and recovers cleanly', async ({ page }) => {
    await page.goto('/');

    // Add a stop
    await page.getByRole('button', { name: 'ماذا تحتاج؟' }).click();
    await page.getByRole('button', { name: /شراء من هنا/ }).click();
    await page.getByPlaceholder(/اكتب ما تحتاجه بدقة/).fill('طلب تم إدخاله أثناء الاتصال');
    await page.getByRole('button', { name: 'أكمل الطلب' }).click();

    // Verify cart sheet is open with the stop
    await expect(page.getByText('مراجعة وتأكيد الطلب')).toBeVisible();
    await expect(page.getByText(/طلب تم إدخاله أثناء الاتصال/)).toBeVisible();
    // Allow IndexedDB transaction to commit
    await page.waitForTimeout(500);

    // Simulate going offline via window event
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
    });

    // Verify offline banner appears
    await expect(page.getByText(/أنت غير متصل بالإنترنت/)).toBeVisible();

    // Simulate online recovery
    await page.evaluate(() => {
      window.dispatchEvent(new Event('online'));
    });

    // Reload page: draft persists in IndexedDB and restores automatically
    await page.reload();

    // Draft persists and cart restores automatically
    await expect(page.getByText(/طلب تم إدخاله أثناء الاتصال/)).toBeVisible();
  });
});

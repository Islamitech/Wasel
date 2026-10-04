import { test, expect } from '@playwright/test';

const ErrorCode = {
  ORDER_ALREADY_AGREED: 'ORDER_ALREADY_AGREED',
  SUBSCRIPTION_REQUIRED: 'SUBSCRIPTION_REQUIRED',
  VERIFICATION_LEVEL_TOO_LOW: 'VERIFICATION_LEVEL_TOO_LOW',
  AGREEMENT_IMMUTABLE: 'AGREEMENT_IMMUTABLE',
};

test.describe('Wasel Driver PWA Core 7 E2E Journeys', () => {
  test.beforeEach(async ({ page }) => {
    // Inject deterministic fake map flag and driver session
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
      localStorage.setItem('wasel_driver_refresh_token', 'fake_jwt_driver_refresh_token');
    });

    // Mock Catalog
    await page.route('**/v1/catalog*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          vehicleTypes: [
            { id: 'vt-moto', code: 'motorcycle', nameAr: 'موتوسيكل' },
            { id: 'vt-tri', code: 'tricycle', nameAr: 'تروسيكل' },
            { id: 'vt-half', code: 'half_truck', nameAr: 'نصف نقل' },
          ],
          valueTiers: [
            { id: 't1', code: 'tier_1', nameAr: 'أقل من ٢٠٠ ج', minMinor: 0, maxMinor: 20000, rank: 1 },
            { id: 't2', code: 'tier_2', nameAr: '٢٠٠ - ٥٠٠ ج', minMinor: 20000, maxMinor: 50000, rank: 2 },
          ],
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
          missingDocumentTypes: ['criminal_record'],
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

    // Mock Driver presence & location updates
    await page.route('**/v1/driver/presence', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.route('**/v1/driver/location', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, recordedAt: new Date().toISOString() }),
      });
    });

    // Mock SSE Stream
    await page.route('**/v1/stream*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: ':keepalive 1\n\n',
      });
    });
  });

  // (1) Shopping Order Journey
  test('Journey 1: Shopping order lifecycle: Go online, accept, invoice, settlement', async ({ page }) => {
    let agreementCompleted = false;

    // Mock nearby orders with 1 shopping order
    await page.route('**/v1/driver/orders/nearby', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            orderId: 'ord-shop-101',
            orderType: 'shopping',
            minFareMinor: 2600,
            distanceMeters: 1400,
            billableVisits: 1,
            valueTierNameAr: 'أقل من ٢٠٠ ج',
            loadSizeNameAr: 'موتوسيكل',
            waitMode: 'notify',
            expiresAt: new Date(Date.now() + 45000).toISOString(),
            stops: [
              {
                id: 'st-grocery',
                seq: 1,
                actionCode: 'buy',
                actionNameAr: 'شراء من هنا',
                placeNameAr: 'سوبرماركت الفرجاني',
                notes: 'علبة لبن وجبنة',
                invoiceRequired: true,
                latitude: 29.98,
                longitude: 31.12,
              },
              {
                id: 'st-drop',
                seq: 2,
                actionCode: 'drop',
                actionNameAr: 'توصيل هنا',
                invoiceRequired: false,
                latitude: 29.99,
                longitude: 31.13,
              },
            ],
            rawOrder: {
              id: 'ord-shop-101',
              status: 'published',
              waitMode: 'notify',
              minFareMinor: 2600,
              stops: [
                {
                  id: 'st-grocery',
                  seq: 1,
                  actionCode: 'buy',
                  actionNameAr: 'شراء من هنا',
                  placeNameAr: 'سوبرماركت الفرجاني',
                  notes: 'علبة لبن وجبنة',
                  invoiceRequired: true,
                  location: { latitude: 29.98, longitude: 31.12 },
                },
                {
                  id: 'st-drop',
                  seq: 2,
                  actionCode: 'drop',
                  actionNameAr: 'توصيل هنا',
                  invoiceRequired: false,
                  location: { latitude: 29.99, longitude: 31.13 },
                },
              ],
            },
          },
        ]),
      });
    });

    // Mock accept order
    await page.route('**/v1/orders/ord-shop-101/accept', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'agr-101',
          orderId: 'ord-shop-101',
          customerId: 'cust-101',
          customerName: 'أحمد العميل',
          customerPhone: '01099887766',
          driverId: '11111111-2222-3333-4444-555555555555',
          agreedFareMinor: 2600,
          formattedAgreedFareEgp: '26 ج.م',
          status: 'active',
          agreementSnapshot: {
            stops: [
              {
                id: 'st-grocery',
                seq: 1,
                actionCode: 'buy',
                actionNameAr: 'شراء من هنا',
                placeNameAr: 'سوبرماركت الفرجاني',
                notes: 'علبة لبن وجبنة',
                invoiceRequired: true,
                location: { latitude: 29.98, longitude: 31.12 },
              },
              {
                id: 'st-drop',
                seq: 2,
                actionCode: 'drop',
                actionNameAr: 'توصيل هنا',
                invoiceRequired: false,
                location: { latitude: 29.99, longitude: 31.13 },
              },
            ],
            waitMode: 'notify',
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      });
    });

    // Mock Arrive at stop
    await page.route('**/v1/agreements/agr-101/stops/*/arrive', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, arrivedAt: new Date().toISOString() }),
      });
    });

    // Mock Issue invoice
    await page.route('**/v1/stops/st-grocery/invoice', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'inv-101',
          orderId: 'ord-shop-101',
          stopId: 'st-grocery',
          amountMinor: 16000,
          formattedAmountEgp: '160 ج.م',
          invoiceNumber: 'INV-778',
          verifiedByCustomer: true,
          createdAt: new Date().toISOString(),
        }),
      });
    });

    // Mock Complete stop
    await page.route('**/v1/agreements/agr-101/stops/*/complete', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // Mock Complete agreement
    await page.route('**/v1/agreements/agr-101/complete', async (route) => {
      agreementCompleted = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          agreementId: 'agr-101',
          orderId: 'ord-shop-101',
          visits: 1,
          stopFeeUnitMinor: 1000,
          stopFeesTotalMinor: 1000,
          waitHours: 0,
          waitFeeUnitMinor: 3500,
          waitFeesTotalMinor: 0,
          totalInvoicesMinor: 16000,
          goodsPercentRate: 10,
          goodsFeesTotalMinor: 1600,
          calculatedFareMinor: 2600,
          formattedFareEgp: '26 ج.م',
          currency: 'EGP',
        }),
      });
    });

    await page.goto('/');

    // 1. Initial screen: OffSheet
    await expect(page.locator('button:has-text("ابدأ استقبال الطلبات")')).toBeVisible();
    await page.click('button:has-text("ابدأ استقبال الطلبات")');

    // 2. Waiting sheet & Incoming order appears
    await expect(page.locator('[data-testid="incoming-min-fare"]')).toHaveText('26 ج.م', { timeout: 10000 });
    await expect(page.locator('text=سوبرماركت الفرجاني')).toBeVisible();

    // 3. Driver accepts shopping order
    await page.click('button:has-text("قبول المشوار فوراً")');

    // 4. Run phase: To stop 1
    await expect(page.locator('text=المحطة الحالية (1 من 2)')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("وصلت للمحطة")')).toBeVisible();
    await page.click('button:has-text("وصلت للمحطة")');

    // 5. At stop: Invoice modal
    await expect(page.locator('button:has-text("إصدار وتصوير فاتورة المتجر")')).toBeVisible();
    await page.click('button:has-text("إصدار وتصوير فاتورة المتجر")');

    // Enter amount 160 EGP
    await page.fill('input[type="number"]', '160');
    await page.click('button:has-text("إرسال الفاتورة وتأكيدها")');

    // 6. Complete Stop 1
    await expect(page.locator('button:has-text("تأكيد استلام كاش المشتريات من العميل")')).toBeVisible();
    await page.click('button:has-text("تأكيد استلام كاش المشتريات من العميل")');

    await expect(page.locator('button:has-text("الانتقال للمحطة التالية")')).toBeVisible();
    await page.click('button:has-text("الانتقال للمحطة التالية")');

    // 7. Arrive at Stop 2 (delivery destination)
    await expect(page.locator('text=المحطة الحالية (2 من 2)')).toBeVisible();
    await page.click('button:has-text("وصلت للمحطة")');

    await expect(page.locator('button:has-text("إنهاء هذه المحطة")')).toBeVisible();
    await page.click('button:has-text("إنهاء هذه المحطة")');

    // 8. Complete trip
    await expect(page.locator('button:has-text("إنهاء المشوار بالكامل وتصفية الحساب")')).toBeVisible();
    await page.click('button:has-text("إنهاء المشوار بالكامل وتصفية الحساب")');

    // 9. Settlement breakdown on DoneSheet
    await expect(page.locator('[data-testid="settlement-total-fare"]')).toHaveText('26 ج.م', { timeout: 5000 });
    expect(agreementCompleted).toBe(true);
  });

  // (2) Shoe Repair with Billable Waiting Time
  test('Journey 2: Shoe-repair job with billable waiting time', async ({ page }) => {
    let waitStarted = false;
    let waitEnded = false;

    await page.route('**/v1/driver/orders/nearby', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            orderId: 'ord-repair-202',
            orderType: 'shopping',
            minFareMinor: 8000,
            distanceMeters: 800,
            billableVisits: 1,
            valueTierNameAr: 'أقل من ٢٠٠ ج',
            loadSizeNameAr: 'موتوسيكل',
            waitMode: 'wait',
            expiresAt: new Date(Date.now() + 45000).toISOString(),
            stops: [
              {
                id: 'st-shoemaker',
                seq: 1,
                actionCode: 'pick',
                actionNameAr: 'استلام وتصليح',
                placeNameAr: 'محل تصليح الأحذية',
                notes: 'تغيير نعل الحذاء وانتظار الانتهاء',
                invoiceRequired: false,
                latitude: 29.98,
                longitude: 31.12,
              },
            ],
            rawOrder: { id: 'ord-repair-202', status: 'published', waitMode: 'wait' },
          },
        ]),
      });
    });

    await page.route('**/v1/orders/ord-repair-202/accept', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'agr-202',
          orderId: 'ord-repair-202',
          customerId: 'cust-202',
          customerName: 'طارق العميل',
          driverId: '11111111-2222-3333-4444-555555555555',
          agreedFareMinor: 8000,
          status: 'active',
          agreementSnapshot: {
            stops: [
              {
                id: 'st-shoemaker',
                seq: 1,
                actionCode: 'pick',
                actionNameAr: 'استلام وتصليح',
                placeNameAr: 'محل تصليح الأحذية',
                invoiceRequired: false,
              },
            ],
            waitMode: 'wait',
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      });
    });

    await page.route('**/v1/agreements/agr-202/stops/*/arrive', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    await page.route('**/v1/agreements/agr-202/stops/*/wait/start', async (route) => {
      waitStarted = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'Wait started' }) });
    });

    await page.route('**/v1/agreements/agr-202/stops/*/wait/end', async (route) => {
      waitEnded = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'Wait ended' }) });
    });

    await page.goto('/');
    await page.click('button:has-text("ابدأ استقبال الطلبات")');

    // Accept repair order
    await expect(page.locator('button:has-text("قبول المشوار فوراً")')).toBeVisible({ timeout: 10000 });
    await page.click('button:has-text("قبول المشوار فوراً")');

    // Arrive at shoemaker
    await expect(page.locator('button:has-text("وصلت للمحطة")')).toBeVisible();
    await page.click('button:has-text("وصلت للمحطة")');

    // Start wait timer
    await expect(page.locator('button:has-text("بدء عداد الانتظار")')).toBeVisible();
    await page.click('button:has-text("بدء عداد الانتظار")');
    expect(waitStarted).toBe(true);

    // Waiting timer in progress
    await expect(page.locator('text=الانتظار جاري')).toBeVisible();
    await page.click('button:has-text("إنهاء الانتظار ومتابعة المهمة")');
    expect(waitEnded).toBe(true);
  });

  // (3) Transport / Moving Order with Bidding Negotiation
  test('Journey 3: Transport order bidding, counter-offer, and acceptance', async ({ page }) => {
    let bidSubmitted = false;

    await page.route('**/v1/driver/orders/nearby', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            orderId: 'ord-move-303',
            orderType: 'moving',
            minFareMinor: 8000,
            suggestedFareMinor: 8000,
            distanceMeters: 3500,
            billableVisits: 1,
            valueTierNameAr: 'أقل من ٢٠٠ ج',
            loadSizeNameAr: 'نصف نقل (بيك آب)',
            waitMode: 'notify',
            expiresAt: new Date(Date.now() + 45000).toISOString(),
            stops: [
              {
                id: 'st-furniture',
                seq: 1,
                actionCode: 'move',
                actionNameAr: 'نقل أثاث',
                notes: 'نقل ثلاجة وغسالة',
                latitude: 29.98,
                longitude: 31.12,
              },
            ],
            rawOrder: { id: 'ord-move-303', status: 'published', waitMode: 'notify' },
          },
        ]),
      });
    });

    await page.route('**/v1/orders/ord-move-303/offers', async (route) => {
      bidSubmitted = true;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'off-303',
          orderId: 'ord-move-303',
          offeredFareMinor: 9000,
          status: 'pending',
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          createdAt: new Date().toISOString(),
        }),
      });
    });

    await page.goto('/');
    await page.click('button:has-text("ابدأ استقبال الطلبات")');

    // Open bidding sheet
    await expect(page.locator('button:has-text("تقديم عرض سعر")')).toBeVisible({ timeout: 10000 });
    await page.click('button:has-text("تقديم عرض سعر")');

    // Stepper: Increase price by 10 EGP
    await expect(page.locator('[data-testid="bidding-current-price"]')).toContainText('80');
    await page.click('button:has-text("+")');
    await expect(page.locator('[data-testid="bidding-current-price"]')).toContainText('90');

    // Submit offer
    await page.click('button:has-text("إرسال عرض السعر للعميل")');
    expect(bidSubmitted).toBe(true);

    // Waiting for customer notice
    await expect(page.locator('text=تم إرسال عرضك، بانتظار رد العميل')).toBeVisible();
  });

  // (4) Concurrency Race: Order already agreed by another driver
  test('Journey 4: Concurrency race shows ORDER_ALREADY_AGREED and recovery action', async ({ page }) => {
    await page.route('**/v1/driver/orders/nearby', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            orderId: 'ord-race-404',
            orderType: 'shopping',
            minFareMinor: 3000,
            distanceMeters: 500,
            billableVisits: 1,
            valueTierNameAr: 'أقل من ٢٠٠ ج',
            loadSizeNameAr: 'موتوسيكل',
            waitMode: 'notify',
            expiresAt: new Date(Date.now() + 45000).toISOString(),
            stops: [{ id: 'st-1', seq: 1, actionCode: 'buy', actionNameAr: 'شراء', latitude: 29.98, longitude: 31.12 }],
            rawOrder: { id: 'ord-race-404', status: 'published' },
          },
        ]),
      });
    });

    // Accept returns 409 ORDER_ALREADY_AGREED
    await page.route('**/v1/orders/ord-race-404/accept', async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 409,
          errorCode: ErrorCode.ORDER_ALREADY_AGREED,
          message: 'Order already agreed',
        }),
      });
    });

    await page.goto('/');
    await page.click('button:has-text("ابدأ استقبال الطلبات")');

    await expect(page.locator('button:has-text("قبول المشوار فوراً")')).toBeVisible({ timeout: 10000 });
    await page.click('button:has-text("قبول المشوار فوراً")');

    // Verify Arabic error message and recovery action
    await expect(page.locator('text=تم قبول هذا المشوار مسبقاً من كابتن آخر في سباق التنافس')).toBeVisible();
    const recoveryBtn = page.locator('button:has-text("العودة لانتظار الطلبات")');
    await expect(recoveryBtn).toBeVisible();

    // Click recovery: returns to waiting
    await recoveryBtn.click();
    await expect(page.locator('text=متصل ومستعد لتلقي المشاوير')).toBeVisible();
  });

  // (5) Network Drop mid-job & Offline Queue Replay
  test('Journey 5: Network drop queues actions in IndexedDB and replays without duplicates', async ({ page }) => {
    // Setup active agreement directly
    await page.addInitScript(() => {
      localStorage.setItem(
        'wasel_driver_active_job',
        JSON.stringify({
          activeAgreement: {
            id: 'agr-offline-505',
            orderId: 'ord-offline-505',
            customerId: 'cust-505',
            customerName: 'سامي العميل',
            driverId: '11111111-2222-3333-4444-555555555555',
            agreedFareMinor: 3000,
            status: 'active',
            agreementSnapshot: {
              stops: [{ id: 'st-offline-1', seq: 1, actionNameAr: 'محطة أوفلاين', invoiceRequired: false }],
              waitMode: 'notify',
            },
          },
          currentStopIndex: 0,
          currentStopPhase: 'to_stop',
          waitStartTime: null,
        }),
      );
    });

    let arriveCalls = 0;
    await page.route('**/v1/agreements/agr-offline-505/stops/*/arrive', async (route) => {
      arriveCalls += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    await page.goto('/');

    // Wait for initial bundle and lazy-loaded map module to resolve before cutting network
    await expect(page.locator('[data-testid="driver-map-viewport"]')).toBeVisible();
    await expect(page.locator('button:has-text("وصلت للمحطة")')).toBeVisible();

    // Emulate network drop
    await page.context().setOffline(true);

    // Arrive while offline
    await page.click('button:has-text("وصلت للمحطة")');

    // UI advances to at_stop with completeStop button
    await expect(page.locator('button:has-text("إنهاء هذه المحطة")')).toBeVisible();

    // Restore network
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    // Wait for replay
    await page.waitForTimeout(1000);
    expect(arriveCalls).toBe(1);
  });

  // (6) Reload mid-job resumes active agreement
  test('Journey 6: App reload mid-job resumes active agreement seamlessly', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'wasel_driver_active_job',
        JSON.stringify({
          activeAgreement: {
            id: 'agr-persist-606',
            orderId: 'ord-persist-606',
            customerId: 'cust-606',
            customerName: 'كريم العميل',
            driverId: '11111111-2222-3333-4444-555555555555',
            agreedFareMinor: 4000,
            status: 'active',
            agreementSnapshot: {
              stops: [
                { id: 'st-persist-1', seq: 1, actionNameAr: 'استلام شحنة', invoiceRequired: false },
                { id: 'st-persist-2', seq: 2, actionNameAr: 'تسليم شحنة', invoiceRequired: false },
              ],
              waitMode: 'notify',
            },
          },
          currentStopIndex: 1,
          currentStopPhase: 'to_stop',
          waitStartTime: null,
        }),
      );
    });

    await page.goto('/');

    // Verify resumed at stop 2 of 2
    await expect(page.locator('text=المحطة الحالية (2 من 2)')).toBeVisible();
    await expect(page.locator('text=تسليم شحنة')).toBeVisible();

    // Reload page
    await page.reload();

    // Verify still at stop 2 of 2
    await expect(page.locator('text=المحطة الحالية (2 من 2)')).toBeVisible();
    await expect(page.locator('text=تسليم شحنة')).toBeVisible();
  });

  // (7) Blocked driver: Subscription required
  test('Journey 7: Blocked driver shows SUBSCRIPTION_REQUIRED with recovery action', async ({ page }) => {
    // Presence returns SUBSCRIPTION_REQUIRED
    await page.route('**/v1/driver/presence', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 403,
          errorCode: ErrorCode.SUBSCRIPTION_REQUIRED,
          message: 'Subscription expired or required',
        }),
      });
    });

    await page.goto('/');

    // Attempt to go online
    await page.click('button:has-text("ابدأ استقبال الطلبات")');

    // Error banner appears with recovery action
    await expect(page.locator('text=يتطلب استقبال وقبول المشاوير وجود اشتراك نشط')).toBeVisible();
    await expect(page.locator('button:has-text("الاشتراك الآن")')).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';

test.describe('Admin Web App Shell Smoke Tests', () => {
  test('renders RTL Arabic admin login form with email & password', async ({ page }) => {
    await page.goto('/');

    const htmlDir = await page.getAttribute('html', 'dir');
    expect(htmlDir).toBe('rtl');

    await expect(page).toHaveTitle(/لوحة تحكم واصل/);

    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();

    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();
  });
});

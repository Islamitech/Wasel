import { test, expect } from '@playwright/test';

test.describe('Driver Web App Shell & PWA Smoke Tests', () => {
  test('renders RTL Arabic title and captain login screen', async ({ page }) => {
    await page.goto('/');

    const htmlDir = await page.getAttribute('html', 'dir');
    expect(htmlDir).toBe('rtl');

    await expect(page).toHaveTitle(/واصل كابتن/);

    const phoneInput = page.locator('input[type="tel"]');
    await expect(phoneInput).toBeVisible();

    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
  });
});

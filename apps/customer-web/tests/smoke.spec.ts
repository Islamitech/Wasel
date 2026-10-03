import { test, expect } from '@playwright/test';

test.describe('Customer Web App Shell & PWA Smoke Tests', () => {
  test('renders RTL Arabic title and phone authentication screen', async ({ page }) => {
    await page.goto('/');

    // Check RTL direction
    const htmlDir = await page.getAttribute('html', 'dir');
    expect(htmlDir).toBe('rtl');

    // Check title
    await expect(page).toHaveTitle(/واصل/);

    // Verify phone input field exists
    const phoneInput = page.locator('input[type="tel"]');
    await expect(phoneInput).toBeVisible();

    // Verify 52px button exists
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
    const box = await submitButton.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(50);
  });
});

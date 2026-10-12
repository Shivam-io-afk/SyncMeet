import { test, expect } from '@playwright/test';

test('unknown routes show the custom not-found page', async ({ page }) => {
  await page.goto('/this-page-does-not-exist');

  await expect(page.getByRole('heading', { name: 'We can’t find that page' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to SyncMeet' })).toHaveAttribute('href', '/');
});

test('connection loss shows the offline page and restores the app when online', async ({ page, context }) => {
  await page.goto('/');
  await context.setOffline(true);
  await expect(page.getByRole('heading', { name: 'You’re offline' })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'You’re offline' })).toHaveCount(0);
});

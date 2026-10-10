import { test, expect } from '@playwright/test';

test('Google sign-in reports when its popup closes without returning a response', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await context.route('**/api/auth/google', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><script>setTimeout(() => window.close(), 100)</script>',
  }));

  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Google sign-in window closed before returning to SyncMeet',
      { timeout: 10000 }
    );
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  } finally {
    await context.close();
  }
});

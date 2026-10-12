import { test, expect } from '@playwright/test';

test('Google sign-in waits for the OAuth result when the popup reports closed during account selection', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.open = () => {
      window.setTimeout(() => {
        const channel = new BroadcastChannel('syncmeet-google-auth');
        channel.postMessage({
          type: 'syncmeet-google-auth',
          token: 'test-access-token',
          user: {
            id: 'google-user-1',
            name: 'Google User',
            email: 'google-user@example.test',
            role: 'participant',
          },
        });
        channel.close();
      }, 2500);
      return { closed: true, close() {} };
    };
  });

  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    const googleButton = page.getByRole('button', { name: 'Connecting to Google…' });
    await expect(googleButton).toBeVisible();
    await page.waitForTimeout(2000);
    await expect(page.getByRole('alert')).toHaveCount(0);

    await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0, {
      timeout: 5000,
    });
  } finally {
    await context.close();
  }
});

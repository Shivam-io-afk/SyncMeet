import { test, expect } from '@playwright/test';

test.describe('Meeting Archives Account Isolation', () => {
  test('A newly logged-in user never sees another user meetings in DB Archives', async ({ page }) => {
    // 1. Navigate to the app
    await page.goto('/');

    // Check if on login page or lobby
    const onLogin = await page.locator('#auth-email').isVisible().catch(() => false);
    if (!onLogin) {
      // If user menu is open, sign out first to get a clean state
      const userMenuBtn = page.locator('header button').filter({ has: page.locator('div.rounded-full') }).first();
      if (await userMenuBtn.isVisible().catch(() => false)) {
        await userMenuBtn.click();
        const signOutBtn = page.locator('button:has-text("Sign out")');
        if (await signOutBtn.isVisible().catch(() => false)) {
          await signOutBtn.click();
        }
      }
    }

    // 2. Register User Alice
    const aliceEmail = `alice_${Date.now()}@syncmeet.ai`;
    await page.goto('/');

    // Ensure we are on login view
    const emailInput = page.locator('#auth-email');
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });

    // Switch to create account tab
    const createAccountTab = page.locator('button:has-text("Create account")');
    if (await createAccountTab.isVisible().catch(() => false)) {
      await createAccountTab.click();
    }

    await page.fill('#auth-name', 'Alice Tester');
    await page.fill('#auth-email', aliceEmail);
    await page.fill('#auth-password', 'password123');
    await page.click('button[type="submit"]');

    // Wait until Alice lands on the setup lobby
    await expect(page.locator('text=Meeting setup')).toBeVisible({ timeout: 15000 });

    // 3. User Alice opens DB Archives (should be empty for new account)
    const dbArchivesBtn = page.locator('button:has-text("DB Archives")');
    await expect(dbArchivesBtn).toBeVisible();
    await dbArchivesBtn.click();

    // Verify modal appears and displays 0 meetings saved
    const archivesModal = page.locator('div[role="dialog"]');
    await expect(archivesModal).toBeVisible();
    await expect(page.locator('text=0 meetings saved')).toBeVisible();
    await expect(page.locator('text=No saved meetings yet')).toBeVisible();

    // Close archives modal
    await page.locator('button[aria-label="Close meeting archives"]').click();
    await expect(archivesModal).not.toBeVisible();

    // 4. Alice starts an instant meeting
    const startMeetingBtn = page.locator('button:has-text("Start meeting now")');
    await startMeetingBtn.click();

    // Wait for meeting room stage: leave button in control dock
    const leaveBtn = page.locator('button[title="Leave Meeting"]').first();
    await expect(leaveBtn).toBeVisible({ timeout: 25000 });

    // Alice leaves the meeting
    await leaveBtn.click();
    await page.locator('button:has-text("Yes, Leave")').click();

    // Wait for return to lobby
    await expect(page.locator('text=Meeting setup')).toBeVisible({ timeout: 15000 });

    // 5. Alice signs out
    const aliceMenu = page.locator('header button').filter({ has: page.locator('div') }).last();
    await aliceMenu.click();
    await page.locator('button:has-text("Sign out")').click();

    // Verify Alice is logged out and back to login page
    await expect(page.locator('#auth-email')).toBeVisible({ timeout: 15000 });

    // 6. Now Bob (brand new user) registers
    const bobEmail = `bob_${Date.now()}@syncmeet.ai`;
    const bobCreateTab = page.locator('button:has-text("Create account")');
    if (await bobCreateTab.isVisible().catch(() => false)) {
      await bobCreateTab.click();
    }

    await page.fill('#auth-name', 'Bob Newbie');
    await page.fill('#auth-email', bobEmail);
    await page.fill('#auth-password', 'password123');
    await page.click('button[type="submit"]');

    // Bob lands on lobby
    await expect(page.locator('text=Meeting setup')).toBeVisible({ timeout: 15000 });

    // 7. Bob clicks "DB Archives" button!
    await page.locator('button:has-text("DB Archives")').click();

    // Verify modal is open
    await expect(archivesModal).toBeVisible();

    // 8. CRITICAL ASSERTION: Bob MUST see 0 meetings saved and "No saved meetings yet"!
    // Bob MUST NOT see Alice's meeting or any other user's meeting!
    await expect(page.locator('text=0 meetings saved')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=No saved meetings yet')).toBeVisible();
    await expect(page.locator('text=Alice Tester')).not.toBeVisible();
  });
});


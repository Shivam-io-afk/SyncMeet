import { test, expect } from '@playwright/test';

test.describe('Meeting Participant Reload and Rejoin Lifecycle', () => {
  test('Host sees exactly one participant tile before and after participant reloads page', async ({ browser }) => {
    // 1. Create two isolated browser contexts with fake media permissions
    const hostContext = await browser.newContext({
      permissions: ['camera', 'microphone'],
    });
    const participantContext = await browser.newContext({
      permissions: ['camera', 'microphone'],
    });

    const hostPage = await hostContext.newPage();
    const participantPage = await participantContext.newPage();

    try {
      // 2. Host signs up and starts an instant meeting
      await hostPage.goto('/');
      const hostEmail = `host_reload_${Date.now()}@syncmeet.ai`;

      const emailInput = hostPage.locator('#auth-email');
      await emailInput.waitFor({ state: 'visible', timeout: 10000 });
      const createAccountTab = hostPage.locator('button:has-text("Create account")');
      if (await createAccountTab.isVisible().catch(() => false)) {
        await createAccountTab.click();
      }

      await hostPage.fill('#auth-name', 'Host Reload Tester');
      await hostPage.fill('#auth-email', hostEmail);
      await hostPage.fill('#auth-password', 'password123');
      await hostPage.click('button[type="submit"]');

      await expect(hostPage.locator('text=Meeting setup')).toBeVisible({ timeout: 15000 });

      // Start meeting
      await hostPage.click('button:has-text("Start meeting now")');
      await expect(hostPage.locator('button[aria-label="End meeting"]')).toBeVisible({ timeout: 15000 });

      // Read Room ID from HeaderBar
      const roomIdBadge = hostPage.locator('header span.font-mono').first();
      await expect(roomIdBadge).toBeVisible();
      const roomIdText = (await roomIdBadge.textContent() || '').trim();
      expect(roomIdText.length).toBeGreaterThan(0);

      // 3. Participant signs up and joins the same meeting
      await participantPage.goto('/');
      const participantEmail = `attendee_reload_${Date.now()}@syncmeet.ai`;

      const partEmailInput = participantPage.locator('#auth-email');
      await partEmailInput.waitFor({ state: 'visible', timeout: 10000 });
      const partCreateTab = participantPage.locator('button:has-text("Create account")');
      if (await partCreateTab.isVisible().catch(() => false)) {
        await partCreateTab.click();
      }

      await participantPage.fill('#auth-name', 'Attendee Reload Tester');
      await participantPage.fill('#auth-email', participantEmail);
      await participantPage.fill('#auth-password', 'password123');
      await participantPage.click('button[type="submit"]');

      await expect(participantPage.locator('text=Meeting setup')).toBeVisible({ timeout: 15000 });

      // Switch to Join tab or enter room code
      const enterCodeInput = participantPage.locator('input[placeholder*="room code" i], input[placeholder*="meeting code" i], input[placeholder*="room ID" i]').first();
      if (await enterCodeInput.isVisible().catch(() => false)) {
        await enterCodeInput.fill(roomIdText);
        await participantPage.click('button:has-text("Join with code"), button:has-text("Join meeting")');
      }

      // Check if in meeting
      await expect(participantPage.locator('button[aria-label="Leave meeting"], button[aria-label="End meeting"]')).toBeVisible({ timeout: 15000 });

      // 4. Verify Host sees the participant tile
      const participantNameOnHost = hostPage.locator('text=Attendee Reload Tester');
      await expect(participantNameOnHost).toBeVisible({ timeout: 15000 });

      // Count remote participant tiles on Host screen (must be exactly 1)
      const participantTilesBefore = await hostPage.locator('text=Attendee Reload Tester').count();
      expect(participantTilesBefore).toBe(1);

      // 5. Participant reloads the page
      await participantPage.reload();

      // Participant should restore meeting session and reconnect
      await expect(participantPage.locator('button[aria-label="Leave meeting"], button[aria-label="End meeting"]')).toBeVisible({ timeout: 15000 });

      // Wait a moment for reconnection signaling to settle
      await hostPage.waitForTimeout(2000);

      // 6. Assert Host STILL sees exactly ONE participant tile (no ghost tile, no disappearance)
      const participantTilesAfter = await hostPage.locator('text=Attendee Reload Tester').count();
      expect(participantTilesAfter).toBe(1);
    } finally {
      await hostContext.close();
      await participantContext.close();
    }
  });
});


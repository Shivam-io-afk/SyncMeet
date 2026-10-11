import { test, expect } from '@playwright/test';

test.describe('Meeting Participant Reload and Rejoin Lifecycle', () => {
  test('both peers restore live video after either participant reloads', async ({ browser }) => {
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

      await expect(hostPage.getByRole('button', { name: 'Meeting setup' })).toBeVisible({ timeout: 15000 });

      // Start meeting
      await hostPage.click('button:has-text("Start meeting now")');
      await expect(hostPage.locator('button[title="Leave Meeting"]')).toBeVisible({ timeout: 15000 });

      // Read the room ID from the meeting sidebar
      const roomIdBadge = hostPage.locator('p.font-mono').first();
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

      await expect(participantPage.getByRole('button', { name: 'Meeting setup' })).toBeVisible({ timeout: 15000 });

      // Switch to Join tab or enter room code
      await participantPage.getByRole('button', { name: 'Join with code' }).click();
      await participantPage.locator('#meeting-room-code').fill(roomIdText);
      await participantPage.getByRole('button', { name: 'Enter meeting room' }).click();

      await expect(participantPage.getByRole('heading', { name: 'Asking to be let in...' })).toBeVisible({ timeout: 15000 });
      await hostPage.getByRole('button', { name: 'Admit', exact: true }).click();
      await expect(participantPage.locator('button[title="Leave Meeting"]')).toBeVisible({ timeout: 15000 });

      // 4. Verify Host sees the participant tile
      const participantNameOnHost = hostPage.locator('main').getByText('Attendee Reload Tester', { exact: true });
      await expect(participantNameOnHost).toBeVisible({ timeout: 15000 });
      const hostNameOnParticipant = participantPage.locator('main').getByText('Host Reload Tester', { exact: true });
      await expect(hostNameOnParticipant).toBeVisible({ timeout: 15000 });

      const expectLiveRemoteVideo = async (page) => {
        const video = page.getByTestId('remote-video').first();
        await expect(video).toBeVisible({ timeout: 15000 });
        await expect.poll(
          () => video.evaluate((element) => element.videoWidth > 0 && element.videoHeight > 0),
          { timeout: 15000 }
        ).toBe(true);
      };
      await expectLiveRemoteVideo(hostPage);
      await expectLiveRemoteVideo(participantPage);

      // Hand raises and emoji reactions must be visible to the other participant.
      await participantPage.getByRole('button', { name: 'Raise Hand' }).click();
      await expect(hostPage.locator('main').getByText('Hand Raised', { exact: true })).toBeVisible();

      await participantPage.getByRole('button', { name: 'Lower Hand' }).click();
      await expect(hostPage.locator('main').getByText('Hand Raised', { exact: true })).not.toBeVisible();

      await participantPage.getByRole('button', { name: 'Send emoji reaction' }).click();
      await participantPage.getByRole('menuitem', { name: 'Send 👏 reaction' }).click();
      await expect(hostPage.locator('.fixed.inset-0.pointer-events-none').getByText('👏', { exact: true })).toBeVisible();

      // 5. Participant reloads the page
      await participantPage.reload();

      // Participant should restore meeting session and reconnect
      await expect(participantPage.locator('button[title="Leave Meeting"]')).toBeVisible({ timeout: 15000 });
      await expectLiveRemoteVideo(participantPage);
      await expectLiveRemoteVideo(hostPage);

      // 6. Refresh the host too and verify both directions recover again.
      await hostPage.reload();
      await expect(hostPage.locator('button[title="Leave Meeting"]')).toBeVisible({ timeout: 15000 });
      await expectLiveRemoteVideo(hostPage);
      await expectLiveRemoteVideo(participantPage);
    } finally {
      await hostContext.close();
      await participantContext.close();
    }
  });
});

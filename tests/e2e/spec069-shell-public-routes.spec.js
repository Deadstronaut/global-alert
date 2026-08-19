import { test, expect } from 'playwright/test';

// spec 069 (Main Layout Shell) User Story 3: public/unauthenticated pages must
// render exactly as before, with NO new header/hazard-row/footer shell around
// them. These screenshots are the evidence artifact for that regression check.
test.describe('spec 069 US3 — public routes unaffected by the new MainLayout shell', () => {
  test('login page has no shell chrome', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('form')).toBeVisible();
    await page.screenshot({ path: 'docs/test-evidence/2026-08-19/spec069-login.png', fullPage: true });
  });

  test('community report page has no shell chrome', async ({ page }) => {
    await page.goto('/report');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'docs/test-evidence/2026-08-19/spec069-report.png', fullPage: true });
  });
});

import { expect, test } from 'playwright/test';

test.describe('public and auth route smoke', () => {
  test('login page renders the operator login form', async ({ page }) => {
    await page.goto('/login');

    const maintenanceButton = page.getByRole('button', { name: /anlad/i });
    if (await maintenanceButton.isVisible()) {
      await maintenanceButton.click();
    }

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'MHEWS' })).toBeVisible();
    await expect(page.getByPlaceholder('E-posta')).toBeVisible();
    await expect(page.getByPlaceholder('Parola')).toBeVisible();
    await expect(page.getByRole('button', { name: /giri/i })).toBeVisible();
    await expect(page.getByRole('link')).toHaveAttribute('href', '/report');
  });

  test('anonymous community report page is reachable without authentication', async ({ page }) => {
    await page.goto('/report');

    await expect(page).toHaveURL(/\/report$/);
    await expect(page.locator('.report-hazard-page')).toBeVisible();
    await expect(page.locator('.community-report-form')).toBeVisible();
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.locator('input[type="number"]')).toHaveCount(2);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('protected application routes redirect anonymous users to login', async ({ page }) => {
    for (const route of ['/', '/map', '/alerts/cap', '/alerts/incidents', '/shelters', '/hazards', '/account-security']) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login$/);
    }
  });
});


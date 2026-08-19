import { test, expect } from 'playwright/test';

// Live authenticated pass for spec 069 (MainLayout shell) and spec 070 (wind
// spread prediction), using a real super_admin test account. Credentials are
// read from env vars only (never hardcoded) — this file is not meant to be
// committed with real creds baked in.
const EMAIL = process.env.MHEWS_TEST_EMAIL;
const PASSWORD = process.env.MHEWS_TEST_PASSWORD;

// Headless chromium's GPU/WebGL path stalls and can crash the page under the
// 3D globe's rendering load in this environment — force software rendering
// (swiftshader) instead, which is slower but far more stable for scripted
// screenshot capture than letting the real GPU path hang.
test.use({
  launchOptions: {
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--disable-gpu-compositing', '--enable-unsafe-swiftshader'],
  },
});

// The "Sistem Bakımda" (maintenance) overlay is currently reappearing on
// EVERY fresh route mount (site-wide maintenance flag), not just on /login —
// so it has to be dismissed after every navigation, not just once.
async function dismissMaintenance(page) {
  const dismiss = page.getByRole('button', { name: 'Anladım' });
  for (let a = 0; a < 6; a++) {
    if (!(await dismiss.count())) return;
    await dismiss.click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
  }
}

// Robust login: retries the submit click (a single click can silently miss
// if it fires before Vue's handler is attached, e.g. right after the
// maintenance-overlay dismiss re-render) and hard-fails if it never lands,
// rather than silently continuing on a still-filled login form.
async function login(page) {
  await page.goto('/login');
  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.waitFor({ state: 'attached', timeout: 15000 });
  await dismissMaintenance(page);
  await page.waitForTimeout(500);

  await emailInput.fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);

  for (let attempt = 0; attempt < 5; attempt++) {
    await page.locator('button[type="submit"]').first().click({ force: true }).catch(() => {});
    const loggedIn = await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 6000 }).then(() => true).catch(() => false);
    if (loggedIn) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(2000);
  await dismissMaintenance(page);

  if (page.url().includes('/login')) {
    throw new Error('Login did not complete — still on /login');
  }
}

test.describe('spec 069/070 — live authenticated shell + wind spread', () => {
  test.skip(!EMAIL || !PASSWORD, 'MHEWS_TEST_EMAIL / MHEWS_TEST_PASSWORD not set');

  test('login, then capture the shell on the map view', async ({ page }) => {
    await login(page);
    await page.screenshot({ path: 'docs/test-evidence/2026-08-19/01-post-login.png', fullPage: true });

    // Navigate explicitly to the map/home shell.
    await page.goto('/');
    await page.waitForTimeout(2500);
    await dismissMaintenance(page);
    await page.screenshot({ path: 'docs/test-evidence/2026-08-19/02-shell-map-view.png', fullPage: true });

    // spec 069 US1: shell should persist across authenticated pages.
    await page.goto('/alerts/cap');
    await page.waitForTimeout(2000);
    await dismissMaintenance(page);
    await page.screenshot({ path: 'docs/test-evidence/2026-08-19/03-shell-cap-view.png', fullPage: true });

    // /admin was removed 2026-08-19 — admin functionality now lives in the
    // Dashboard panel (opened from the header, not a standalone route), so
    // there's no route to navigate to for this shell-persistence screenshot.

    // spec 070: switch to 2D (easier hit-testing than the 3D globe), filter to
    // wildfire only, then try clicking a marker to see if a wind-spread overlay appears.
    await page.goto('/map');
    await page.waitForTimeout(2000);
    await dismissMaintenance(page);
    const toggle2D = page.getByText('2B', { exact: true }).first();
    if (await toggle2D.count()) await toggle2D.click({ force: true }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'docs/test-evidence/2026-08-19/05-2d-map-view.png', fullPage: true });

    const wildfireChip = page.getByText('Yangın', { exact: false }).first();
    if (await wildfireChip.count()) await wildfireChip.click({ force: true }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'docs/test-evidence/2026-08-19/06-2d-map-wildfire-filtered.png', fullPage: true });

    // NOTE: verifying the spec 070 wind-spread overlay itself requires selecting
    // a country + clicking an active wind-affected event marker on the map
    // canvas — WebGL/MapLibre hit-testing is too fragile to script reliably
    // headless (a goto('/map') after this point was observed to drop the
    // session back to the login/maintenance screen). Left for a manual pass.
  });
});

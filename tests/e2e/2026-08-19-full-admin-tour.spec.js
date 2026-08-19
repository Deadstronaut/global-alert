import { test } from 'playwright/test';

const EMAIL = process.env.MHEWS_TEST_EMAIL;
const PASSWORD = process.env.MHEWS_TEST_PASSWORD;
const DIR = 'docs/test-evidence/2026-08-19';

test.use({
  launchOptions: {
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--disable-gpu-compositing', '--enable-unsafe-swiftshader'],
  },
});

async function dismissMaintenance(page) {
  const dismiss = page.getByRole('button', { name: 'Anladım' });
  for (let a = 0; a < 6; a++) {
    if (!(await dismiss.count())) return;
    await dismiss.click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
  }
}

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

// spec 069 follow-up (2026-08-19): /admin and AdminView.vue were removed —
// all admin categories/tabs now render INLINE inside the header's "Panel"
// (Dashboard) dialog via AppSidebar.vue's INLINE_ADMIN_TABS + DashboardPlaceholder.vue.
test.describe('2026-08-19 full admin tour (post /admin-removal, via header Panel)', () => {
  test.skip(!EMAIL || !PASSWORD, 'MHEWS_TEST_EMAIL / MHEWS_TEST_PASSWORD not set');

  test('open Panel, walk every admin category tab', async ({ page }) => {
    await login(page);
    await page.waitForTimeout(1500);
    await dismissMaintenance(page);

    // Open the Dashboard/Panel dialog from the header.
    const panelBtn = page.getByText('Panel', { exact: true }).first();
    await panelBtn.waitFor({ state: 'visible', timeout: 20000 });
    await panelBtn.click({ force: true });
    await page.waitForTimeout(1500);
    await dismissMaintenance(page);
    await page.screenshot({ path: `${DIR}/40-panel-opened.png`, fullPage: true });

    // Every admin tab (label text, id) — matches AppSidebar.vue's adminCategories,
    // all categories are default-open so every tab link is already visible.
    const tabs = [
      ['Kullanıcılar', 'users'],
      ['Organizasyonlar', 'orgs'],
      ['Alarm Alıcıları', 'contacts'],
      ['Uydu Görüntüsü', 'satelliteImagery'],
      ['Veri Kaynakları', 'sources'],
      ['Dosya Yükle', 'csv'],
      ['Manuel Giriş', 'manual'],
      ['Sınır Verisi', 'boundaries'],
      ['Harita Katmanları', 'mapLayers'],
      ['Etkilenme Verisi', 'exposure'],
      ['Tatbikat', 'drill'],
      ['Dispatch İzleme', 'dispatch'],
      ['Vatandaş Bildirimleri', 'communityReports'],
      ['Risk ve Senaryo Modelleme', 'risk'],
      ['Kaynak Envanteri', 'resourceInventory'],
      ['Hazard Taksonomisi', 'hazardTaxonomy'],
      ['SOP Deposu', 'sopRepository'],
      ['Gelen CAP', 'capInbound'],
      ['AI Yardımı', 'aiAssistance'],
      ['Entegrasyonlar', 'integrations'],
      ['Denetim', 'audit'],
    ];

    let i = 41;
    for (const [label, id] of tabs) {
      const link = page.getByText(label, { exact: false }).first();
      if (!(await link.count())) {
        console.log('NOT FOUND:', label);
        continue;
      }
      await link.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
      await dismissMaintenance(page);
      await page.screenshot({ path: `${DIR}/${i}-panel-${id}.png`, fullPage: true });
      i++;
    }
  });
});

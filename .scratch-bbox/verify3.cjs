const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', () => {});
  await page.goto('http://localhost:5195/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.locator('input').nth(0).fill('mgoktugd@gmail.com');
  await page.locator('input').nth(1).fill('Password1234!');
  await page.click('button:has-text("Giriş Yap")');
  await page.waitForTimeout(3000);
  const switchLabel = page.locator('label.switch-3d-cyan');
  await switchLabel.click({ timeout: 5000, force: true }).catch(() => {});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '.scratch-bbox/full_before.png' });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

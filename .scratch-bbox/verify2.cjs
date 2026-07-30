const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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

  await page.screenshot({ path: '.scratch-bbox/before_select.png', clip: { x: 0, y: 170, width: 280, height: 110 } });

  await page.mouse.move(730, 340);
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -200); await page.waitForTimeout(100); }
  await page.waitForTimeout(1500);
  await page.mouse.click(730, 400);
  await page.waitForTimeout(2500);

  await page.screenshot({ path: '.scratch-bbox/after_select.png', clip: { x: 0, y: 170, width: 280, height: 110 } });

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

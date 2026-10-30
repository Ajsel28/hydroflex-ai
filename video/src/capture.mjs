// Captures REAL footage of the running HydroFlex AI web app for the demo video.
// Every optimisation result shown is produced live by the local FastAPI + HiGHS backend during capture.
//
// Prerequisites: API on http://127.0.0.1:8000, built web app served on http://127.0.0.1:4173
// Usage (from apps/web so @playwright/test resolves):  node ../../video/src/capture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { chromium } = require('@playwright/test');

const BASE = process.env.HYDROFLEX_WEB ?? 'http://127.0.0.1:4173';
const OUT = new URL('../build/shots/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const shot = (page, name, opts = {}) => page.screenshot({ path: new URL(`${name}.png`, OUT).pathname.replace(/^\/([A-Za-z]:)/, '$1'), ...opts });
const log = {};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, colorScheme: 'dark' });
await ctx.addInitScript(() => {
  try { localStorage.setItem('hydroflex.theme', 'dark'); } catch { /* ignore */ }
});
const page = await ctx.newPage();
const settle = (ms = 3500) => page.waitForTimeout(ms);
const hideToasts = () => page.addStyleTag({ content: '[role="status"][aria-live], .toast, [data-sonner-toaster] { display: none !important; }' }).catch(() => undefined);

async function go(path, wait = 6000) {
  await page.goto(BASE + path, { waitUntil: 'load', timeout: 120_000 });
  await settle(wait);
}

// 1. Landing + Mission Control (reference experiment ref-A)
await go('/', 4500);
await shot(page, '01_landing');
await go('/mission', 9000);
await shot(page, '02_mission');
await page.mouse.wheel(0, 700);
await settle(2500);
await shot(page, '03_mission_scrolled');

// 2. Climate Stress Laboratory — three live runs (168 h winter week, day 14)
async function runLab(tag) {
  const t0 = Date.now();
  await page.getByTestId('lab-run-button').click();
  await settle(250);
  await shot(page, `${tag}_running`);
  await page.getByTestId('lab-status').filter({ hasText: /Optimal|Infeasible|error/i }).first().waitFor({ timeout: 120_000 });
  log[tag] = { status: await page.getByTestId('lab-status').innerText(), wall_seconds: (Date.now() - t0) / 1000 };
  await settle(5000);
  await hideToasts();
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(800);
  await shot(page, `${tag}_result`);
  await page.mouse.wheel(0, 650);
  await settle(2500);
  await shot(page, `${tag}_result_scrolled`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(600);
}

await go('/lab', 5000);
await shot(page, '04_lab_initial');
await runLab('05_lab_normal');

await page.getByLabel('Preset', { exact: true }).selectOption('severe_drought');
await settle(800);
await shot(page, '06_lab_severe_set');
await runLab('07_lab_severe');

await page.getByLabel(/^Battery power/).fill('300');
await page.getByLabel(/^Battery energy/).fill('1200');
await settle(600);
await runLab('08_lab_battery');

// 3. Reference-experiment pages
await go('/storage', 8000);
await shot(page, '09_storage');
await go('/frontier', 8000);
await shot(page, '10_frontier');
await go('/risk', 8000);
await shot(page, '11_risk');
await page.mouse.wheel(0, 900);
await settle(2500);
await shot(page, '12_risk_scrolled');
await go('/notebook', 8000);
await shot(page, '13_notebook');

writeFileSync(new URL('capture_log.json', OUT), JSON.stringify(log, null, 2));
console.log(JSON.stringify(log, null, 2));
await browser.close();

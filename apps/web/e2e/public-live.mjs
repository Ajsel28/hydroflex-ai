// End-to-end check of the PUBLIC deployment: Netlify frontend + Render live solver.
// Usage (apps/web):  node e2e/public-live.mjs [https://hydroflex-ai.netlify.app]
import { chromium } from '@playwright/test';

const SITE = process.argv[2] ?? 'https://hydroflex-ai.netlify.app';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const calls = [];
const problems = [];
page.on('request', (r) => { if (r.url().includes('/api/')) calls.push(`${r.method()} ${r.url()}`); });
page.on('console', (m) => { if (m.type() === 'error' && /CORS|blocked|Failed to fetch/i.test(m.text())) problems.push(m.text()); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

await page.goto(SITE + '/mission', { waitUntil: 'load' });
await page.getByText(/Reference experiment/).first().waitFor({ timeout: 60_000 });
const missionDemand = await page.locator('main').innerText();
await page.goto(SITE + '/lab', { waitUntil: 'load' });
// wait until the live API reports healthy (Run button enabled); free instances may need to wake up
await page.waitForFunction(() => {
  const b = document.querySelector('[data-testid="lab-run-button"]');
  return b && !b.hasAttribute('disabled');
}, null, { timeout: 180_000 });
await page.getByTestId('lab-hours').fill('168');
const t0 = Date.now();
await page.getByTestId('lab-run-button').click();
await page.getByTestId('lab-status').filter({ hasText: /Optimal|Infeasible|error/i }).first().waitFor({ timeout: 180_000 });
const status = await page.getByTestId('lab-status').innerText();
const tag = await page.getByTestId('run-tag').first().innerText();
const kpis = (await page.locator('main').innerText()).match(/IMPORTS[\s\S]{0,40}/i)?.[0]?.replace(/\s+/g, ' ');
console.log(JSON.stringify({
  mission_loaded: /TOTAL DEMAND/i.test(missionDemand),
  lab_status: status.replace(/\s+/g, ' '), run_tag: tag.replace(/\s+/g, ' '), imports_kpi: kpis,
  wall_seconds: (Date.now() - t0) / 1000,
  live_calls: calls.filter((c) => c.includes('onrender.com')),
  static_calls: calls.filter((c) => c.includes('netlify.app')).slice(0, 6),
  problems,
}, null, 2));
await browser.close();

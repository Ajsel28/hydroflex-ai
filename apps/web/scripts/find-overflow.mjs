// Debug helper: prints the ancestor chain of a select ending just beyond a 390 px viewport.
// Usage: node scripts/find-overflow.mjs [baseUrl] [route-without-leading-slash]
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
await page.goto(base + '/' + (process.argv[3] ?? 'mission'), { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
const rows = await page.evaluate(() => {
  const el = [...document.querySelectorAll('select')].find((e) => e.getBoundingClientRect().right > 390.5);
  const out = [];
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    const r = n.getBoundingClientRect();
    out.push(n.tagName.toLowerCase() + ' right=' + Math.round(r.right) + ' w=' + Math.round(r.width) + ' :: ' + String(n.className).slice(0, 110));
  }
  return out;
});
console.log(rows.join('\n'));
await browser.close();

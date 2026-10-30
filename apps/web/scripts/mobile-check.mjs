// Mobile layout check: 390×844 screenshots + horizontal-overflow detection.
// Usage: node scripts/mobile-check.mjs [baseUrl] [outDir]
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const out = process.argv[3] ?? '../../docs/screenshots/mobile';
mkdirSync(out, { recursive: true });
const pages = [['landing', '/'], ['mission', '/mission'], ['lab', '/lab'], ['frontier', '/frontier'], ['risk', '/risk']];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark', isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
for (const [name, path] of pages) {
  await page.goto(base + path, { waitUntil: 'networkidle', timeout: 120_000 }).catch(() => undefined);
  await page.waitForTimeout(5000);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  if (sw > 392) problems.push(`${name}: horizontal overflow (${sw}px)`);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('captured', name, sw);
}
console.log(problems.length ? `PROBLEMS\n${problems.join('\n')}` : 'no mobile problems');
await browser.close();

// Captures dark-theme 1440×900 screenshots of every page into docs/screenshots/<page>.png.
// Usage: build + `npm run preview`, then `node scripts/screenshots.mjs [baseUrl] [outDir] [--full]`
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const out = resolve(process.argv[3] ?? new URL('../../../docs/screenshots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const full = process.argv.includes('--full');
mkdirSync(out, { recursive: true });

const PAGES = [
  ['landing', '/'],
  ['mission', '/mission'],
  ['lab', '/lab'],
  ['dispatch', '/dispatch'],
  ['storage', '/storage'],
  ['frontier', '/frontier'],
  ['risk', '/risk'],
  ['notebook', '/notebook'],
  ['about', '/about'],
  ['present', '/present'],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('hydroflex.theme', 'dark');
  } catch {
    /* ignore */
  }
});
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && !/404/.test(m.text()) && problems.push(`console: ${m.text()}`));
for (const [name, path] of PAGES) {
  await page.goto(base + path, { waitUntil: 'networkidle', timeout: 120_000 }).catch(() => undefined);
  await page.waitForTimeout(name === 'mission' || name === 'dispatch' || name === 'storage' ? 9000 : 5000);
  const failed = await page.getByText('This view failed to render').count();
  if (failed) problems.push(`${name}: error boundary shown`);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  if (sw > 1440) problems.push(`${name}: horizontal overflow (${sw}px)`);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: full });
  console.log('captured', name);
}
console.log(problems.length ? `PROBLEMS\n${problems.join('\n')}` : 'no page errors');
await browser.close();

// Renders the deterministic composition (video/src/scenes.html) frame by frame with Playwright.
// Usage (repo root):  node video/src/render.mjs [fps=30] [only=t1,t2,...]
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const fps = Number(process.argv[2] ?? 30);
const only = process.argv[3] ? process.argv[3].split(',').map(Number) : null;
const outDir = fileURLToPath(new URL(only ? '../build/preview/' : '../build/frames/', import.meta.url));
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(pathToFileURL(fileURLToPath(new URL('./scenes.html', import.meta.url))).href, { waitUntil: 'load' });
await page.evaluate(() => window.ready);
await page.waitForTimeout(1500);
const duration = await page.evaluate(() => window.DURATION);
const times = only ?? Array.from({ length: Math.round(duration * fps) }, (_, i) => i / fps);
const stage = page.locator('#stage');
const t0 = Date.now();
for (let i = 0; i < times.length; i++) {
  await page.evaluate((t) => window.render(t), times[i]);
  const name = only ? `t${String(times[i]).replace('.', '_')}.jpg` : `${String(i).padStart(5, '0')}.jpg`;
  await stage.screenshot({ path: outDir + name, type: 'jpeg', quality: 90 });
  if (i % 300 === 0) console.log(`frame ${i}/${times.length}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
console.log(`done: ${times.length} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${outDir}`);
await browser.close();

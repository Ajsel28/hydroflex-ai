import { expect, test } from '@playwright/test';

const API = process.env.VITE_API_BASE ?? 'http://127.0.0.1:8000';

const PAGES: [string, RegExp][] = [
  ['/', /Climate Intelligence/i],
  ['/mission', /Mission Control/i],
  ['/lab', /Climate Stress/i],
  ['/dispatch', /Grid Dispatch/i],
  ['/storage', /Reservoir/i],
  ['/frontier', /Investment Frontier/i],
  ['/risk', /Risk/i],
  ['/notebook', /Research Notebook/i],
  ['/about', /About|motivation/i],
];

test('landing loads and every page renders without crashing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText(/SYNTHETIC/).first()).toBeVisible();
  for (const [path, re] of PAGES) {
    await page.goto(path);
    await expect(page.locator('main')).toContainText(re);
    await expect(page.getByText('This view failed to render')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('navigation via sidebar works', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Research Notebook' }).click();
  await expect(page).toHaveURL(/\/notebook$/);
});

test('Lab runs a real 48 h simulation against the live API', async ({ page, request }) => {
  const health = await request.get(`${API}/api/health`).catch(() => null);
  test.skip(!health || !health.ok(), `live API not reachable at ${API}`);
  await page.goto('/lab');
  const hours = page.getByTestId('lab-hours');
  await hours.fill('48');
  await page.getByTestId('lab-run-button').click();
  await expect(page.getByTestId('lab-status')).toContainText('Optimal', { timeout: 90_000 });
  await expect(page.getByTestId('run-tag').first()).toContainText('Live run');
});

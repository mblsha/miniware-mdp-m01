import { test, expect } from '@playwright/test';

test('loads the app shell and shows disconnected state', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });

  await page.goto('/');
  await page.waitForTimeout(1000);
  if (errors.length) {
    throw new Error(`Console errors:\n${errors.join('\n')}`);
  }

  await expect(page.getByRole('heading', { name: 'MDP-WebUI' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible();
  await expect(page.getByText('Connect to your MDP device to begin')).toBeVisible();

  expect(errors).toEqual([]);
});

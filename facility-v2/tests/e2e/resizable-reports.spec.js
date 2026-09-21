import { expect, test } from '@playwright/test';

test('Indberetninger kan ændre og huske kolonnebredder med mus og tastatur', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/facility/indberetninger');

  const workspace = page.locator('.facility-three-panel');
  await expect(workspace).toBeVisible();
  const separators = page.getByRole('separator');
  await expect(separators).toHaveCount(2);

  const firstSeparator = separators.first();
  const before = Number(await firstSeparator.getAttribute('aria-valuenow'));
  const handle = await firstSeparator.boundingBox();
  expect(handle).not.toBeNull();
  await page.mouse.move(handle.x + (handle.width / 2), handle.y + 80);
  await page.mouse.down();
  await page.mouse.move(handle.x + (handle.width / 2) + 35, handle.y + 80, { steps: 4 });
  await page.mouse.up();
  const dragged = Number(await firstSeparator.getAttribute('aria-valuenow'));
  expect(dragged).toBeGreaterThan(before);

  await firstSeparator.press('ArrowRight');
  const keyboardAdjusted = Number(await firstSeparator.getAttribute('aria-valuenow'));
  expect(keyboardAdjusted).toBeGreaterThan(dragged);
  await page.reload();
  await expect(page.getByRole('separator').first()).toHaveAttribute(
    'aria-valuenow',
    String(keyboardAdjusted),
  );
});

test('Indberetninger beholder mobilvisningen uden vandret sidescroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/facility/indberetninger');

  await expect(page.locator('.facility-three-panel')).toBeVisible();
  const separators = page.locator('[role="separator"]');
  await expect(separators).toHaveCount(2);
  await expect(separators.first()).toBeHidden();
  const overflow = await page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ));
  expect(overflow).toBeLessThanOrEqual(1);
});

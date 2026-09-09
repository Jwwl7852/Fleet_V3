import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/facility');
  await expect(page.getByRole('heading', { name: 'Overblik' })).toBeVisible();
});

test('produktpakker, foldetilstand og genindlæsning', async ({ page }) => {
  await expect(page.getByRole('link', { name: 'FLEET' })).toHaveCount(0);
  await page.getByLabel('Vælg produktpakke').selectOption('combined');
  await expect(page.getByRole('link', { name: 'FLEET' })).toBeVisible();
  const costValue = page.getByText('186.500 kr.');
  await expect(costValue).toBeVisible();
  await page.getByRole('button', { name: /FACILITY/ }).click();
  await expect(page.locator('.sidebar-subnav').getByRole('link', { name: 'Ejendomme', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('link', { name: 'FLEET' })).toBeVisible();
  await expect(page.locator('.sidebar-subnav').getByRole('link', { name: 'Ejendomme', exact: true })).toHaveCount(0);
  await expect(costValue).toBeVisible();
});

test('direkte rute kan genindlæses', async ({ page }) => {
  await page.goto('/facility/service');
  await expect(page.getByRole('heading', { name: 'Service', exact: true })).toBeVisible();
  await expect(page.getByText(/Varslingsmotor/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Service', exact: true })).toBeVisible();
});

for (const width of [1440, 1024, 390]) {
  test(`responsivt layout ved ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Overblik' })).toBeVisible();
    if (width === 390) {
      await expect(page.getByRole('button', { name: 'Åbn menu' })).toBeVisible();
      await page.getByRole('button', { name: 'Åbn menu' }).click();
      await expect(page.getByRole('link', { name: 'Overblik', exact: true })).toBeVisible();
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test('database og data er isoleret og bevares', async ({ page }) => {
  const databaseNames = await page.evaluate(async () => (await indexedDB.databases()).map((item) => item.name));
  expect(databaseNames).toContain('veyro-facility-v2-test-e2e');
  expect(databaseNames).not.toContain('veyro-facility-v2');
  await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('veyro-facility-v2-test-e2e', 8);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = database.transaction('tenant-datasets', 'readwrite');
    const store = tx.objectStore('tenant-datasets');
    const dataset = await new Promise((resolve, reject) => {
      const request = store.get('tenant-veyro-demo-ejendomme');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    dataset.properties.push({ id: 'property-persisted-test', number: 'EJ-TEST', name: 'Bevaret testejendom', registeredAt: '2026-09-08' });
    store.put(dataset);
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    database.close();
  });
  await page.reload();
  await expect(page.locator('.kpi-card').first().locator('.kpi-copy > strong')).toHaveText('5');
  await page.getByLabel('Vælg produktpakke').selectOption('combined');
  await expect(page.locator('.kpi-card').first().locator('.kpi-copy > strong')).toHaveText('5');
});

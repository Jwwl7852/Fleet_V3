import { expect, test } from '@playwright/test';

test('mobil indberetning opretter én fælles sag, der kan triageres', async ({ page }) => {
  await page.goto('/facility/mobil-indberetning');
  await page.getByLabel('Kort titel *').fill('E2E bygningsfejl uden installation');
  await page.getByLabel('Beskrivelse *').fill('Facadeplade sidder løst ved hovedindgangen.');
  await page.getByLabel('Sted').selectOption('location-nordparken-building-a');
  await expect(page.locator('.form-field').filter({ hasText: /^Installation/ }).locator('select')).toHaveValue('');
  await page.getByRole('button', { name: 'Indsend indberetning' }).click();
  await expect(page.getByText('Indberetningen er modtaget')).toBeVisible();
  const reference = await page.locator('.report-success > strong').innerText();
  expect(reference).toContain('FAC-');
  await page.getByRole('link', { name: 'Åbn sag' }).click();
  await expect(page.getByRole('heading', { name: 'Sagsmappe og lukning' })).toBeVisible();
  await expect(page.getByText('Oprettet fra indberetning')).toBeVisible();
  const caseUrl = page.url();
  await page.goto('/facility/indberetninger');
  await page.getByRole('button', { name: /E2E bygningsfejl uden installation/ }).click();
  await page.locator('.triage-editor label').filter({ hasText: /^Status/ }).locator('select').selectOption('ready');
  await page.getByLabel('Begrund statusændring').fill('Vurderet og klar til udførelse');
  await page.getByRole('button', { name: 'Gem vurdering' }).click();
  await expect(page.getByText('Vurderingen er gemt på den fælles sag.')).toBeVisible();
  await page.goto(caseUrl);
  await expect(page.getByText('Klar til udførelse').first()).toBeVisible();
});

test('opgaveudførelse afslutter ikke automatisk sagen', async ({ page }) => {
  await page.goto('/facility/opgaver/task-00042');
  await page.getByRole('button', { name: 'Start arbejde' }).click();
  await expect(page.getByText('I gang').first()).toBeVisible();
  await page.getByRole('button', { name: 'Afslut arbejde' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Løsningsbeskrivelse *').fill('Rem og leje er kontrolleret og justeret.');
  await dialog.getByLabel('Resterende begrænsninger').selectOption('none');
  await dialog.getByRole('button', { name: 'Gem' }).click();
  await expect(page.getByText(/Sagen er fortsat åben/)).toBeVisible();
  await page.getByRole('link', { name: 'FAC-00042' }).click();
  await expect(page.getByText('Fakturacenter ikke tilsluttet')).toBeVisible();
});

test('kalender overlapper kun konkret ressource og kan redigeres uden drag-and-drop', async ({ page }) => {
  await page.goto('/facility/kalender');
  await page.getByRole('button', { name: '+ Opret aftale' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Opgave').selectOption('task-00042');
  await dialog.getByLabel('Konkret ressource').selectOption('resource-dennis');
  await dialog.getByLabel('Start').fill('2026-09-10T08:00');
  await dialog.getByLabel('Slut').fill('2026-09-10T10:00');
  await dialog.getByRole('button', { name: 'Gem aftale' }).click();
  await page.getByRole('button', { name: '+ Opret aftale' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Opgave').selectOption('task-filter');
  await dialog.getByLabel('Konkret ressource').selectOption('resource-dennis');
  await dialog.getByLabel('Start').fill('2026-09-10T09:00');
  await dialog.getByLabel('Slut').fill('2026-09-10T11:00');
  await dialog.getByRole('button', { name: 'Gem aftale' }).click();
  await page.getByRole('button', { name: /OPG-00050-1/ }).click();
  await expect(page.getByText('Overlap fundet')).toBeVisible();
  await page.getByRole('button', { name: 'Luk detaljepanel' }).click();
});

test('alle hovedruter og ukendte IDer kan åbnes direkte', async ({ page }) => {
  const routes = [
    ['/facility', 'Overblik'], ['/facility/ejendomme', 'Ejendomme'], ['/facility/installationer', 'Installationer'],
    ['/facility/indberetninger', 'Indberetninger og triage'], ['/facility/arbejdsko', 'Arbejdskø'], ['/facility/opgaver', 'Opgaver'],
    ['/facility/kalender', 'Vedligeholdelseskalender'], ['/facility/service', 'Service'], ['/facility/dokumenter', 'Dokumenter'],
    ['/facility/ejendomskort', 'Ejendomskort'], ['/facility/mobil-indberetning', 'Mobil indberetning'], ['/facility/oekonomi', 'Økonomi og ejendomsstatistik'],
  ];
  for (const [url, heading] of routes) {
    await page.goto(url); await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible(); await page.reload(); await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await page.goto('/facility/sager/findes-ikke'); await expect(page.getByRole('heading', { name: 'Sagen blev ikke fundet' })).toBeVisible();
  await page.goto('/facility/opgaver/findes-ikke'); await expect(page.getByRole('heading', { name: 'Opgaven blev ikke fundet' })).toBeVisible();
});

for (const width of [1920, 1440, 1024, 390]) {
  test(`arbejdsskærme kan betjenes ved ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/facility/indberetninger', '/facility/arbejdsko', '/facility/kalender', '/facility/dokumenter', '/facility/oekonomi']) {
      await page.goto(route); await expect(page.locator('h1')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} må ikke give vandret sidescroll ved ${width}px`).toBeLessThanOrEqual(1);
    }
    if (width === 390) await expect(page.getByRole('button', { name: 'Åbn menu' })).toBeVisible();
  });
}

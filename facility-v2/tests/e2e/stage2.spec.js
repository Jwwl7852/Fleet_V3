import { expect, test } from '@playwright/test';

async function createProperty(page, suffix = 'Test') {
  await page.goto('/facility/ejendomme');
  await page.getByRole('button', { name: '+ Tilføj ejendom' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Navn *').fill(`Testejendom ${suffix}`);
  await dialog.getByLabel('Registreret areal (m²)').fill('1.250,5');
  await dialog.getByLabel('By').fill('Aarhus');
  await dialog.getByRole('button', { name: 'Gem ejendom' }).click();
  await expect(page.getByRole('heading', { name: `Testejendom ${suffix}`, exact: true })).toBeVisible();
}

test('ejendomssøgning og tilbage-navigation bevarer URL-tilstand', async ({ page }) => {
  await page.goto('/facility/ejendomme?q=Nordparken&city=Aarhus+C');
  await expect(page.getByText('Viser').locator('..')).toContainText('1');
  await page.getByRole('link', { name: 'Åbn' }).click();
  await expect(page.getByRole('heading', { name: 'Nordparken 14', exact: true })).toBeVisible();
  await page.getByRole('link', { name: /Tilbage til Ejendomme/ }).click();
  await expect(page).toHaveURL(/q=Nordparken/);
  await expect(page.getByLabel('Søg i ejendomme')).toHaveValue('Nordparken');
});

test('opretter og redigerer ejendom med dansk decimalkomma og persistens', async ({ page }) => {
  await createProperty(page, 'Decimal');
  await expect(page.getByText('1.250,5 m²')).toBeVisible();
  await page.getByRole('button', { name: 'Rediger ejendom' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Navn *').fill('Testejendom bevaret');
  await dialog.getByRole('button', { name: 'Gem ejendom' }).click();
  await expect(page.getByRole('heading', { name: 'Testejendom bevaret', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Testejendom bevaret', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Historik' }).click();
  await expect(page.getByText('Redigeret')).toBeVisible();
});

test('viser forståelige valideringsfejl og afviser dubletnummer', async ({ page }) => {
  await page.goto('/facility/ejendomme');
  await page.getByRole('button', { name: '+ Tilføj ejendom' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Ejendomsnummer *').fill('EJ-014');
  await dialog.getByLabel('Navn *').fill('Dublet');
  await dialog.getByLabel('Registreret areal (m²)').fill('12,3,4');
  await dialog.getByRole('button', { name: 'Gem ejendom' }).click();
  await expect(dialog.getByText(/bruges allerede/)).toBeVisible();
  await expect(dialog.getByRole('alert').filter({ hasText: /dansk decimalkomma/ })).toBeVisible();
});

test('bygger fleksibel struktur og opretter installation med placering og betjening', async ({ page }) => {
  await createProperty(page, 'Struktur');
  await page.getByRole('button', { name: '+ Tilføj øverst' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Type *').selectOption('building');
  await dialog.getByLabel('Navn *').fill('Bygning Test');
  await dialog.getByRole('button', { name: 'Gem lokation' }).click();
  await page.getByRole('button', { name: /Bygning Test/ }).click();
  await page.getByRole('button', { name: 'Tilføj underpost' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Type *').selectOption('room');
  await dialog.getByLabel('Navn *').fill('Teknikrum Test');
  await dialog.getByRole('button', { name: 'Gem lokation' }).click();
  await page.getByRole('link', { name: 'Installationer', exact: true }).click();
  await page.getByRole('button', { name: '+ Ny installation' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Installationsnummer *').fill('TEST-01');
  await dialog.getByLabel('Navn *').fill('Testventilation');
  const propertySelect = dialog.getByLabel('Ejendom *');
  const propertyValue = await propertySelect.locator('option').filter({ hasText: 'Testejendom Struktur' }).getAttribute('value');
  await propertySelect.selectOption(propertyValue);
  const locationSelect = dialog.getByLabel('Fysisk placering');
  const locationValue = await locationSelect.locator('option').filter({ hasText: 'Teknikrum Test' }).getAttribute('value');
  await locationSelect.selectOption(locationValue);
  await dialog.getByRole('checkbox', { name: 'Bygning Test → Teknikrum Test', exact: true }).check();
  await dialog.getByRole('button', { name: 'Gem installation' }).click();
  await expect(page.getByRole('heading', { name: /TEST-01 · Testventilation/ })).toBeVisible();
  await expect(page.locator('.placement-card').getByText('Bygning Test → Teknikrum Test', { exact: true })).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.placement-card').getByText('Bygning Test → Teknikrum Test', { exact: true })).toHaveCount(2);
});

test('billedupload gemmes som Blob og overlever genindlæsning', async ({ page }) => {
  await page.goto('/facility/ejendomme/property-nordparken-14');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  await page.locator('input[type="file"]').setInputFiles({ name: 'ejendom-test.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByText('ejendom-test.png')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('img', { name: 'ejendom-test.png' }).first()).toBeVisible();
  const record = await page.evaluate(async () => {
    const request = indexedDB.open('veyro-facility-v2-test-e2e', 8);
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction('media-blobs', 'readonly'); const get = tx.objectStore('media-blobs').getAll();
    return new Promise((resolve, reject) => { get.onsuccess = () => resolve(get.result.map((item) => ({ id: item.id, isBlob: item.blob instanceof Blob }))); get.onerror = () => reject(get.error); });
  });
  expect(record.some((item) => item.isBlob)).toBe(true);
});

test('arkivering viser konkrete blokeringer og tom ejendom kan gendannes', async ({ page }) => {
  await page.goto('/facility/ejendomme/property-nordparken-14');
  await page.getByRole('button', { name: 'Arkivér' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Begrundelse *').fill('Test af blokering');
  await dialog.getByRole('button', { name: 'Arkivér' }).click();
  await expect(dialog.getByText(/ikke-arkiverede lokationsposter/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Annuller' }).click();
  await createProperty(page, 'Arkiv');
  await page.getByRole('button', { name: 'Arkivér' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Begrundelse *').fill('Ikke længere i porteføljen');
  await dialog.getByRole('button', { name: 'Arkivér' }).click();
  await expect(page.getByText('Ejendommen er arkiveret')).toBeVisible();
  await page.getByRole('button', { name: 'Gendan ejendom' }).click();
  await expect(page.getByText('Ejendommen er arkiveret')).toHaveCount(0);
});

test('samtidige faner giver synlig revisionskonflikt og bevarer input', async ({ context, page }) => {
  const second = await context.newPage();
  await page.goto('/facility/ejendomme/property-havnepladsen-1');
  await second.goto('/facility/ejendomme/property-havnepladsen-1');
  await page.getByRole('button', { name: 'Rediger ejendom' }).click();
  await second.getByRole('button', { name: 'Rediger ejendom' }).click();
  await page.getByRole('dialog').getByLabel('Navn *').fill('Første fanes navn');
  await second.getByRole('dialog').getByLabel('Navn *').fill('Anden fanes bevarede input');
  await page.getByRole('dialog').getByRole('button', { name: 'Gem ejendom' }).click();
  await second.getByRole('dialog').getByRole('button', { name: 'Gem ejendom' }).click();
  await expect(second.getByRole('dialog').getByText(/ændret i en anden fane/)).toBeVisible();
  await expect(second.getByRole('dialog').getByLabel('Navn *')).toHaveValue('Anden fanes bevarede input');
  await expect(page.getByRole('heading', { name: 'Første fanes navn', exact: true })).toBeVisible();
});

test('ukendte profil-IDer giver en tydelig vej tilbage', async ({ page }) => {
  await page.goto('/facility/ejendomme/findes-ikke');
  await expect(page.getByRole('heading', { name: 'Ejendommen blev ikke fundet' })).toBeVisible();
  await page.goto('/facility/installationer/findes-ikke');
  await expect(page.getByRole('heading', { name: 'Installationen blev ikke fundet' })).toBeVisible();
});

for (const width of [1920, 1440, 1024, 390]) {
  test(`etape 2-layout uden sidescroll ved ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/facility/ejendomme');
    await expect(page.getByRole('heading', { name: 'Ejendomme' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.goto('/facility/installationer');
    await expect(page.getByRole('heading', { name: 'Installationer', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
}

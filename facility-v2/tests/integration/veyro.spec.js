import { expect, test } from '@playwright/test';

const password = process.env.VEYRO_INTEGRATION_TEST_PASSWORD;
const adminEmail = process.env.VEYRO_INTEGRATION_ADMIN_EMAIL;
const noAccessEmail = process.env.VEYRO_INTEGRATION_NO_ACCESS_EMAIL;

async function login(page, email) {
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Adgangskode').fill(password);
  await page.getByRole('button', { name: 'Log ind' }).click();
}

test.beforeAll(() => {
  if (!password || !adminEmail || !noAccessEmail) {
    throw new Error('Angiv de tre Veyro integrationstest-variabler; legitim emulatorlogin må ikke omgås.');
  }
});

test('ikke-logget-ind og bruger uden FACILITY-adgang afvises ved direkte URL', async ({ browser }) => {
  const anonymous = await browser.newPage();
  await anonymous.goto('/facility-v2/dokumenter');
  await expect(anonymous).toHaveURL(/\/login$/);
  await expect(anonymous.getByText('/facility-v2/dokumenter')).toBeVisible();
  await anonymous.close();

  const denied = await browser.newPage();
  await denied.goto('/facility-v2/dokumenter');
  await login(denied, noAccessEmail);
  await expect(denied).toHaveURL(/\/facility-v2\/dokumenter$/);
  await expect(denied.getByRole('heading', { name: 'Ingen adgang til FACILITY' })).toBeVisible();
  await expect(denied.getByText('Ruten kræver permissionen facility.skriv.')).toBeVisible();
  await expect(denied.getByRole('link', { name: 'Facility' })).toHaveCount(0);
  await denied.reload();
  await expect(denied.getByRole('heading', { name: 'Ingen adgang til FACILITY' })).toBeVisible();
  await denied.close();
});

test('FACILITY virker i én AppShell med FLEET og Fakturacenter', async ({ page }) => {
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const location = message.location();
      browserErrors.push(`${message.text()}${location.url ? ` @ ${location.url}` : ''}`);
    }
  });
  page.on('requestfailed', (request) => {
    browserErrors.push(`Request failed on ${page.url()}: ${request.url()} (${request.failure()?.errorText})`);
  });

  await page.goto('/facility-v2');
  await login(page, adminEmail);
  await expect(page).toHaveURL(/\/facility-v2$/);
  await expect(page.getByRole('heading', { name: 'Overblik', exact: true })).toBeVisible();
  await expect(page.locator('.fc-side')).toHaveCount(1);
  await expect(page.locator('.app-shell')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Facility' })).toBeVisible();

  await page.goto('/facility-v2/mobil-indberetning');
  await page.getByLabel('Kort titel *').fill('Automatisk integreret FACILITY-kontrol');
  await page.getByLabel('Beskrivelse *').fill('Syntetisk browserdata til integrationstesten.');
  await page.getByLabel('Sted').selectOption('location-nordparken-building-a');
  await page.getByRole('button', { name: 'Indsend indberetning' }).click();
  await expect(page.getByText('Indberetningen er modtaget')).toBeVisible();
  const caseReference = (await page.locator('.report-success > strong').innerText()).split(' · ')[0];
  await page.getByRole('link', { name: 'Åbn sag' }).click();
  await expect(page.getByRole('heading', { name: 'Sagsmappe og lukning' })).toBeVisible();
  const caseUrl = page.url();

  await page.goto('/facility-v2/indberetninger');
  await page.getByRole('button', { name: /Automatisk integreret FACILITY-kontrol/ }).click();
  await page.locator('.triage-editor label').filter({ hasText: /^Status/ }).locator('select').selectOption('ready');
  await page.getByLabel('Begrund statusændring').fill('Kontrolleret i integreret browserforløb');
  await page.getByRole('button', { name: 'Gem vurdering' }).click();
  await expect(page.getByText('Vurderingen er gemt på den fælles sag.')).toBeVisible();

  await page.goto(caseUrl);
  await page.getByRole('button', { name: '+ Opret opgave' }).first().click();
  const taskDialog = page.getByRole('dialog');
  await taskDialog.getByLabel('Titel *').fill('Automatisk FACILITY-opgave');
  await taskDialog.getByLabel('Intern ressource *').selectOption({ index: 1 });
  await taskDialog.getByRole('button', { name: 'Gem opgave' }).click();
  const taskRow = page.locator('tr').filter({ hasText: 'Automatisk FACILITY-opgave' });
  await taskRow.getByRole('link', { name: 'Åbn' }).click();
  await page.getByRole('button', { name: 'Start arbejde' }).click();
  await page.getByRole('button', { name: 'Afslut arbejde' }).click();
  const completion = page.getByRole('dialog');
  await completion.getByLabel('Løsningsbeskrivelse *').fill('Syntetisk udførelse dokumenteret.');
  await completion.getByLabel('Resterende begrænsninger').selectOption('none');
  await completion.getByRole('button', { name: 'Gem' }).click();
  await expect(page.getByText('Arbejdet er afsluttet. Sagen er fortsat åben.')).toBeVisible();

  await page.getByRole('link', { name: caseReference }).click();
  await page.getByLabel('Luk uden forventet faktura').check();
  await page.getByPlaceholder('Obligatorisk begrundelse, fx internt arbejde eller garanti').fill('Syntetisk test uden faktura');
  await page.getByLabel('Jeg bekræfter aktivt, at sagen skal lukkes').check();
  await page.getByRole('button', { name: 'Luk sag' }).click();
  await expect(page.getByText('Sagen er lukket')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept('Syntetisk genåbningstest'));
  await page.getByRole('button', { name: 'Genåbn sag' }).click();
  await expect(page.getByRole('button', { name: 'Luk sag' })).toBeVisible();
  await expect(page.getByText('Fakturacenter ikke tilsluttet').first()).toBeVisible();

  await page.goto('/facility-v2/ejendomme/property-nordparken-14');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  await page.locator('input[type="file"]').setInputFiles({ name: 'integration-facility.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByText('integration-facility.png')).toBeVisible();
  let uploadedImages = page.getByRole('img', { name: 'integration-facility.png' });
  await expect.poll(() => uploadedImages.evaluateAll((images) => (
    images.length > 0 && images.every((image) => image.complete && image.naturalWidth > 0)
  ))).toBe(true);
  await page.reload();
  uploadedImages = page.getByRole('img', { name: 'integration-facility.png' });
  await expect(uploadedImages.first()).toBeVisible();
  await expect.poll(() => uploadedImages.evaluateAll((images) => (
    images.length > 0 && images.every((image) => image.complete && image.naturalWidth > 0)
  ))).toBe(true);

  for (const [route, heading] of [
    ['/facility-v2/kalender', 'Vedligeholdelseskalender'],
    ['/facility-v2/service', 'Service'],
    ['/facility-v2/dokumenter', 'Dokumenter'],
  ]) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }

  await page.getByRole('link', { name: 'Fleet' }).click();
  await expect(page.getByRole('heading', { name: 'FLEET – overblik' })).toBeVisible();
  await page.getByRole('link', { name: 'Fakturaer & bilag' }).click();
  await expect(page).toHaveURL(/\/oekonomi\/fakturacenter/);
  await expect(page.locator('.fic-workspace')).toBeVisible();
  await page.getByRole('link', { name: 'Facility' }).click();
  await expect(page.getByRole('heading', { name: 'Overblik', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.locator('.fic-workspace')).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Overblik', exact: true })).toBeVisible();
  await expect(page.locator('.fc-side')).toHaveCount(1);
  await expect(page.locator('.app-shell')).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

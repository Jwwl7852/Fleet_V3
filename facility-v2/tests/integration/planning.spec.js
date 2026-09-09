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

test('ikke-logget-ind og bruger uden PLANNING-adgang afvises ved direkte URL', async ({ browser }) => {
  const anonymous = await browser.newPage();
  await anonymous.goto('/planning-v2/planlaegning');
  await expect(anonymous).toHaveURL(/\/login$/);
  await expect(anonymous.getByText('/planning-v2/planlaegning')).toBeVisible();
  await anonymous.close();

  const denied = await browser.newPage();
  await denied.goto('/planning-v2/planlaegning');
  await login(denied, noAccessEmail);
  await expect(denied).toHaveURL(/\/planning-v2\/planlaegning$/);
  await expect(denied.getByRole('heading', { name: 'Ingen adgang til PLANNING' })).toBeVisible();
  await expect(denied.getByText('Ruten kræver permissionen booking.laes.')).toBeVisible();
  await expect(denied.getByRole('link', { name: 'Planning' })).toHaveCount(0);
  await denied.reload();
  await expect(denied.getByRole('heading', { name: 'Ingen adgang til PLANNING' })).toBeVisible();
  await denied.close();
});

test('PLANNINGs fem arbejdsflader, historik og de fire moduler deler én AppShell', async ({ page }) => {
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    browserErrors.push(`Request failed: ${request.url()} (${request.failure()?.errorText})`);
  });

  await page.goto('/planning-v2');
  await login(page, adminEmail);
  await expect(page.getByRole('heading', { name: 'Dagens drift', exact: true })).toBeVisible();
  await expect(page.locator('.fc-side')).toHaveCount(1);
  await expect(page.locator('.pr-sidebar')).toHaveCount(0);
  await expect(page.locator('iframe')).toHaveCount(0);

  for (const [route, heading] of [
    ['/planning-v2/livekalender', 'Livekalender'],
    ['/planning-v2/opgaver', 'Opgaver'],
    ['/planning-v2/optimering', 'Optimering'],
    ['/planning-v2/planlaegning', 'Planlægning'],
  ]) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
  }

  await page.getByRole('link', { name: 'Fleet' }).click();
  await expect(page.getByRole('heading', { name: 'FLEET – overblik' })).toBeVisible();
  await page.getByRole('link', { name: 'Facility' }).click();
  await expect(page.getByRole('heading', { name: 'Overblik', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Fakturaer & bilag' }).click();
  await expect(page.locator('.fic-workspace')).toBeVisible();
  await page.getByRole('link', { name: 'Planning' }).click();
  await expect(page.getByRole('heading', { name: 'Dagens drift', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.locator('.fic-workspace')).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Dagens drift', exact: true })).toBeVisible();
  await expect(page.locator('.fc-side')).toHaveCount(1);
  await expect(page.locator('.pr-sidebar')).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

test('syntetisk import gennemfører browserflowet og bevarer flerstop', async ({ page }) => {
  await page.goto('/planning-v2/opgaver');
  await login(page, adminEmail);
  await page.getByRole('button', { name: 'Importér opgaver' }).click();
  const importPanel = page.getByRole('complementary', { name: 'Importér opgaver' });
  await importPanel.getByRole('button', { name: 'Forhåndsvis rå data' }).click();
  await importPanel.getByRole('button', { name: 'Match kolonner' }).click();
  await importPanel.getByRole('button', { name: 'Validér mapping' }).click();
  await importPanel.getByRole('button', { name: 'Kør lokal validering' }).click();
  await expect(importPanel.getByRole('heading', { name: 'Fejl og dubletter' })).toBeVisible();
  await importPanel.getByRole('button', { name: 'Godkend gyldige opgaver' }).click();
  await expect(importPanel.getByRole('heading', { name: 'Batch behandlet lokalt' })).toBeVisible();
  await importPanel.getByRole('button', { name: 'Til indbakken' }).click();
  const multiStopRow = page.getByRole('row').filter({ hasText: 'Fiktiv importopgave 30' });
  await expect(multiStopRow).toContainText('2');
  await expect(multiStopRow).toContainText('AFHENTNING · Demoby / LEVERING · Demoby');
});

test('manuel intake går til planlægningspulje og tilstand ryddes ved logout', async ({ page }) => {
  const taskName = 'Syntetisk integrationsopgave';
  await page.goto('/planning-v2/opgaver');
  await login(page, adminEmail);
  await page.getByRole('button', { name: 'Opret opgave' }).click();
  const panel = page.getByRole('complementary', { name: 'Opret opgave' });
  await panel.getByLabel('Ekstern reference').fill('INTEGRATION-PLAN-001');
  await panel.getByLabel('Opgavenavn').fill(taskName);
  await panel.getByLabel('Periodetype').selectOption('ISO_UGE');
  await panel.getByLabel('Navn', { exact: true }).fill('Syntetisk stop');
  await panel.getByLabel('Adresse').fill('Testvej 1');
  await panel.getByLabel('Stopvarighed').fill('30');
  await panel.getByRole('button', { name: 'Gem lokal opgave' }).click();

  await expect(page.getByRole('button', { name: taskName, exact: true })).toBeVisible();
  const workPanel = page.getByRole('complementary', { name: taskName });
  const approve = workPanel.getByRole('button', { name: 'Godkend' });
  if (await approve.isEnabled()) await approve.click();
  await workPanel.getByRole('button', { name: 'Send til dagsplan' }).click();

  await page.getByRole('link', { name: 'Optimering' }).click();
  await expect(page.getByRole('button', { name: 'Lokal planlægningspulje (1)' })).toBeVisible();
  await page.getByRole('button', { name: 'Lokal planlægningspulje (1)' }).click();
  await expect(page.locator('.po-summary').getByText('1', { exact: true }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Planlægning' }).click();
  await expect(page.getByRole('heading', { name: 'Planlægning', exact: true }).first()).toBeVisible();
  const queueTask = page.locator('.ps-inbox-task').first();
  await expect(queueTask).toBeVisible();
  await queueTask.focus();
  await page.keyboard.press('Enter');
  const taskWindow = page.locator('.ps-floating-task');
  await expect(taskWindow).toBeVisible();
  const keyboardCell = page.locator('.ps-drop-cell[data-resource-id="week-route-nord"][data-date="2032-09-13"]');
  await keyboardCell.focus();
  await page.keyboard.press('Enter');
  await taskWindow.getByRole('button', { name: 'Gem kladde' }).click();
  await taskWindow.getByRole('button', { name: 'Send til bekræftelse' }).click();
  await expect(page.getByText(/Forslag version 1 er sendt til den lokale bestillervisning/)).toBeVisible();
  await taskWindow.getByRole('button', { name: /Luk opgavevindue/ }).click();

  const dragTask = page.locator('.ps-inbox-task').first();
  const dragCell = page.locator('.ps-drop-cell[data-resource-id="week-route-syd"][data-date="2032-09-14"]');
  await dragTask.dragTo(dragCell);
  await expect(taskWindow).toBeVisible();
  await taskWindow.getByRole('button', { name: /Luk opgavevindue/ }).click();

  await page.getByRole('button', { name: 'Log ud' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, adminEmail);
  await page.goto('/planning-v2/opgaver');
  await expect(page.getByRole('button', { name: taskName, exact: true })).toHaveCount(0);
});

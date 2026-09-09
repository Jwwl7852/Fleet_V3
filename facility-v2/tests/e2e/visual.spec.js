import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const screens = [
  ['01-overblik', '/facility', 'Overblik'],
  ['02-ejendomme', '/facility/ejendomme', 'Ejendomme'],
  ['03-ejendomsprofil', '/facility/ejendomme/property-nordparken-14', 'Nordparken 14'],
  ['04-installationer', '/facility/installationer', 'Installationer'],
  ['05-mobil-indberetning', '/facility/mobil-indberetning', 'Mobil indberetning'],
  ['06-indberetninger-triage', '/facility/indberetninger', 'Indberetninger og triage'],
  ['07-arbejdskoe', '/facility/arbejdsko', 'Arbejdskø'],
  ['09-opgave-udfoerelse', '/facility/opgaver/task-00042', 'Opgave og udførelse'],
  ['10-vedligeholdelseskalender', '/facility/kalender', 'Vedligeholdelseskalender'],
  ['11-service', '/facility/service', 'Service'],
  ['12-dokumenter', '/facility/dokumenter', 'Dokumenter'],
  ['13-sagsmappe-lukning', '/facility/sager/case-ventilation-noise', 'Sagsmappe og lukning'],
  ['14-oekonomi-statistik', '/facility/oekonomi', 'Økonomi og ejendomsstatistik'],
];

test('gemmer desktop-referencekontrol for de 14 skærme', async ({ page }) => {
  const output = path.resolve('docs/visual-check'); fs.mkdirSync(output, { recursive: true }); await page.setViewportSize({ width: 1680, height: 1050 });
  for (const [name, url, heading] of screens) { await page.goto(url); await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible(); await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true }); }
  await page.goto('/facility/sager/case-ventilation-noise'); await page.getByRole('button', { name: '+ Opret opgave' }).first().click(); const dialog = page.getByRole('dialog'); await dialog.getByLabel('Tildeling').selectOption('external'); await dialog.getByLabel('Leverandør *').selectOption('supplier-nordklima'); await dialog.getByLabel('Kontakt').selectOption('contact-nordklima-morten'); await dialog.getByRole('button', { name: 'Gem opgave' }).click(); const row = page.locator('tbody tr').filter({ hasText: 'Nordklima Service' }).last(); await row.getByRole('link', { name: 'Åbn' }).click(); await page.getByRole('button', { name: 'Klargør mail' }).click(); await expect(page.getByRole('heading', { name: 'Tildeling og mailklargøring' }).first()).toBeVisible(); await page.screenshot({ path: path.join(output, '08-tildeling-mailkladde.png'), fullPage: true });
});

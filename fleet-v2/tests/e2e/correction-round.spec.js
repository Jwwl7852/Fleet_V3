import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const prefix = process.env.FLEET_E2E_ROUTE_PREFIX || "";
const route = (path) => `${prefix}${path}`;
const evidenceDir = fileURLToPath(new URL("../../../docs/screenshots/veyro-rettelsesrunde-2026-09-14/etape-1/", import.meta.url));

const openUrlAuthenticated = async (page, url) => {
  await page.goto(url);
  const login = page.getByRole("button", { name: "Log ind", exact: true });
  if (await login.isVisible()) {
    const email = page.getByLabel("E-mail");
    const password = page.getByLabel("Adgangskode");
    const emailValue = await email.inputValue();
    const passwordValue = await password.inputValue();
    await email.fill("");
    await email.fill(emailValue);
    await password.fill("");
    await password.fill(passwordValue);
    await login.click();
  }
};
const openAuthenticated = (page, path) => openUrlAuthenticated(page, route(path));
const openRootAuthenticated = (page, path) => openUrlAuthenticated(page, path);

const dialogMeasurements = (page) => page.locator(".fleet-route-dialog").evaluate((dialog) => {
  const rect = dialog.getBoundingClientRect();
  const close = dialog.querySelector(".fleet-route-dialog-head > button")?.getBoundingClientRect();
  const backdrop = dialog.closest(".fleet-dialog-backdrop")?.getBoundingClientRect();
  const workspace = document.querySelector("[data-workspace-zoom], .fc-workspace-zoom, .workspace-zoom")?.getBoundingClientRect();
  return {
    viewport: { width: innerWidth, height: innerHeight },
    dialog: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
    close: close ? { left: close.left, right: close.right, top: close.top, bottom: close.bottom } : null,
    backdrop: backdrop ? { left: backdrop.left, right: backdrop.right, top: backdrop.top, bottom: backdrop.bottom, width: backdrop.width, height: backdrop.height } : null,
    workspace: workspace ? { left: workspace.left, right: workspace.right, width: workspace.width } : null,
    documentScrollWidth: document.documentElement.scrollWidth,
    scrollY,
    computed: { position: getComputedStyle(dialog).position, transform: getComputedStyle(dialog).transform, backdropPosition: backdrop ? getComputedStyle(dialog.closest(".fleet-dialog-backdrop")).position : null },
  };
});

const assertContained = (measurements) => {
  expect(measurements.dialog.left).toBeGreaterThanOrEqual(0);
  expect(measurements.dialog.right).toBeLessThanOrEqual(measurements.viewport.width);
  expect(measurements.dialog.top).toBeGreaterThanOrEqual(0);
  expect(measurements.dialog.bottom).toBeLessThanOrEqual(measurements.viewport.height);
  expect(measurements.close).not.toBeNull();
  expect(measurements.close.right).toBeLessThanOrEqual(measurements.viewport.width);
  expect(measurements.close.top).toBeGreaterThanOrEqual(0);
  expect(measurements.documentScrollWidth).toBe(measurements.viewport.width);
};

test("integreret Arbejdskø viser flytbar indberetning og samlet sagsmappe uden klipning", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openAuthenticated(page, "/arbejdsko");
  await expect(page.getByRole("heading", { name: "Arbejdskø", exact: true })).toBeVisible();

  await page.getByRole("button", { name: /SAG-00002 AdBlue-advarsel/ }).click();
  const reportDialog = page.getByRole("dialog", { name: /SAG-00002/ });
  await expect(reportDialog).toBeVisible();
  const reportBefore = await dialogMeasurements(page);
  assertContained(reportBefore);
  const header = page.locator(".fleet-route-dialog-head");
  const headerBox = await header.boundingBox();
  expect(headerBox).not.toBeNull();
  await page.mouse.move(headerBox.x + 180, headerBox.y + 28);
  await page.mouse.down();
  await page.mouse.move(headerBox.x + 245, headerBox.y + 65, { steps: 4 });
  await page.mouse.up();
  const reportAfter = await dialogMeasurements(page);
  expect(reportAfter.dialog.left).toBeGreaterThan(reportBefore.dialog.left);
  assertContained(reportAfter);
  await reportDialog.getByRole("heading", { level: 3, name: "AdBlue-advarsel" }).click();
  await page.screenshot({ path: `${evidenceDir}/1920x1080-arbejdsko-ny-indberetning-dialog.png`, fullPage: false });
  await writeFile(`${evidenceDir}/measurements-desktop.json`, `${JSON.stringify({ reportDialog: { before: reportBefore, after: reportAfter } }, null, 2)}\n`);
  await testInfo.attach("report-dialog-measurements", { body: JSON.stringify({ before: reportBefore, after: reportAfter }, null, 2), contentType: "application/json" });

  await reportDialog.getByRole("button", { name: /Luk SAG-00002/ }).click();
  await page.getByRole("button", { name: /SAG-00001 Knirkende bremser/ }).click();
  const caseDialog = page.getByRole("dialog", { name: /VYR-2025-00001/ });
  await expect(caseDialog).toBeVisible();
  await expect(caseDialog.getByRole("heading", { name: "Problem og næste handling" })).toBeVisible();
  await expect(caseDialog.getByRole("heading", { name: "Sagens overblik" })).toBeVisible();
  await expect(caseDialog.getByRole("navigation", { name: "Sagsmapper" })).toHaveCount(0);
  const caseMeasurements = await dialogMeasurements(page);
  assertContained(caseMeasurements);
  await page.screenshot({ path: `${evidenceDir}/1920x1080-arbejdsko-aaben-sagsmappe.png`, fullPage: false });
  await writeFile(`${evidenceDir}/measurements-desktop.json`, `${JSON.stringify({ reportDialog: { before: reportBefore, after: reportAfter }, caseDialog: caseMeasurements }, null, 2)}\n`);
  await testInfo.attach("case-dialog-measurements", { body: JSON.stringify(caseMeasurements, null, 2), contentType: "application/json" });
});

test("sagsmappen bruger en stabil mobil dialog uden vandret overflow", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAuthenticated(page, "/arbejdsko/case-demo-001");
  const dialog = page.getByRole("dialog", { name: /VYR-2025-00001/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Problem og næste handling" })).toBeVisible();
  const measurements = await dialogMeasurements(page);
  assertContained(measurements);
  await page.screenshot({ path: `${evidenceDir}/390x844-arbejdsko-aaben-sagsmappe.png`, fullPage: false });
  await writeFile(`${evidenceDir}/measurements-mobile-390x844.json`, `${JSON.stringify(measurements, null, 2)}\n`);
  await testInfo.attach("mobile-case-dialog-measurements", { body: JSON.stringify(measurements, null, 2), contentType: "application/json" });
});

test("sagsmappen forbliver inden for arbejdsområdet ved kompakt menu og 125 procent zoom", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openAuthenticated(page, "/arbejdsko");
  await page.getByRole("button", { name: "Fold menuen sammen" }).click();
  for (let index = 0; index < 5; index += 1) await page.getByRole("button", { name: "Zoom ind" }).click();
  await expect(page.locator(".fc-zoomkontroller output")).toHaveText(/125\s*%/);
  await page.getByRole("button", { name: /SAG-00001 Knirkende bremser/ }).click();
  await expect(page.getByRole("dialog", { name: /VYR-2025-00001/ })).toBeVisible();
  const measurements = await dialogMeasurements(page);
  assertContained(measurements);
  expect(measurements.backdrop.left).toBe(72);
  await page.screenshot({ path: `${evidenceDir}/1440x900-kompakt-menu-zoom-125-sagsmappe.png`, fullPage: false });
  await writeFile(`${evidenceDir}/measurements-1440x900-compact-zoom-125.json`, `${JSON.stringify(measurements, null, 2)}\n`);
  await page.getByRole("button", { name: /Luk VYR-2025-00001/ }).click();
  await page.getByRole("button", { name: "Nulstil visning" }).click();
  await expect(page.locator(".fc-zoomkontroller output")).toHaveText(/100\s*%/);
  await expect(page.getByRole("button", { name: "Fold menuen sammen" })).toBeVisible();
});

test("sagsmappen er stabil ved 360 gange 800", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openAuthenticated(page, "/arbejdsko/case-demo-001");
  await expect(page.getByRole("dialog", { name: /VYR-2025-00001/ })).toBeVisible();
  const measurements = await dialogMeasurements(page);
  assertContained(measurements);
  await page.screenshot({ path: `${evidenceDir}/360x800-arbejdsko-aaben-sagsmappe.png`, fullPage: false });
  await writeFile(`${evidenceDir}/measurements-mobile-360x800.json`, `${JSON.stringify(measurements, null, 2)}\n`);
});

test("kompakt FLEET-menu kan åbnes med mus og tastatur uden at blive klippet", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRootAuthenticated(page, "/");
  await page.getByRole("button", { name: "Nulstil visning" }).click();
  const group = page.getByRole("button", { name: "DRIFTSMODULER" });
  await expect(group).toHaveAttribute("aria-expanded", "true");
  await group.click();
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await group.click();
  await page.getByRole("button", { name: "Fold menuen sammen" }).click();
  const fleet = page.getByRole("button", { name: "Fleet", exact: true });
  await fleet.hover();
  const workQueueLink = page.getByRole("link", { name: "Arbejdskø", exact: true });
  await expect(workQueueLink).toBeVisible();
  await workQueueLink.hover();
  await expect(workQueueLink).toBeVisible();
  await page.screenshot({ path: `${evidenceDir}/1440x900-kompakt-hovermenu-fleet.png`, fullPage: false });
  await page.keyboard.press("Escape");
  await expect(workQueueLink).toBeHidden();
  await fleet.focus();
  await page.keyboard.press("Enter");
  await expect(workQueueLink).toBeVisible();
  await workQueueLink.click();
  await expect(page).toHaveURL(/\/fleet-v2\/arbejdsko$/);
  await expect(page.getByRole("heading", { name: "Arbejdskø", exact: true })).toBeVisible();
});

test("manuel sag viser læsbare valideringsfejl og kan oprettes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openAuthenticated(page, "/arbejdsko");
  await page.getByRole("button", { name: "Manuel sag" }).click();
  const dialog = page.getByRole("dialog", { name: "Ny manuel sag" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Opret sag" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Angiv en sagstitel.");
  await page.screenshot({ path: `${evidenceDir}/1440x900-manuel-sag-validering.png`, fullPage: false });
  await dialog.getByLabel("Manuel sagstitel").fill("Syntetisk manuel kontrolsag");
  await dialog.getByLabel("Beskrivelse").fill("Lokal browsertest af læsbar dialog og validering.");
  await dialog.getByLabel("Prioritet").selectOption("high");
  await dialog.getByRole("button", { name: "Opret sag" }).click();
  await expect(page).toHaveURL(/\/fleet-v2\/sager\//);
  await expect(page.getByRole("heading", { name: "Syntetisk manuel kontrolsag" })).toBeVisible();
});

test("Fakturacenter udnytter arbejdsbredden, husker paneler og viser upload- og masseresultat", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRootAuthenticated(page, "/oekonomi/fakturacenter?sektion=indbakke");
  await page.getByRole("button", { name: "Nulstil visning" }).click();
  await expect(page.getByRole("heading", { name: "Fakturacenter" })).toBeVisible();
  await expect(page.getByText("Nyeste først", { exact: true })).toHaveCount(0);
  const moduleFilter = page.locator(".fic-list-controls label").filter({ hasText: "Modul" }).locator("select");
  await expect(moduleFilter).toHaveValue("alle-moduler");

  const separators = page.getByRole("separator");
  await expect(separators).toHaveCount(2);
  const before = Number(await separators.first().getAttribute("aria-valuenow"));
  await separators.first().press("ArrowRight");
  await separators.first().press("ArrowRight");
  const resized = Number(await separators.first().getAttribute("aria-valuenow"));
  expect(resized).toBeGreaterThan(before);
  await page.reload();
  await expect(page.getByRole("separator").first()).toHaveAttribute("aria-valuenow", String(resized));

  const panelMeasurements = await page.locator(".fic-workspace").evaluate((workspace) => {
    const classes = [".fic-inbox-list", ".fic-document-panel", ".fic-review-panel"];
    const rect = workspace.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      workspace: { left: rect.left, right: rect.right, width: rect.width, height: rect.height },
      panels: classes.map((selector) => {
        const node = document.querySelector(selector);
        const box = node.getBoundingClientRect();
        return { selector, width: box.width, height: box.height, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight, overflowY: getComputedStyle(node).overflowY };
      }),
      documentScrollWidth: document.documentElement.scrollWidth,
    };
  });
  expect(panelMeasurements.workspace.width).toBeGreaterThan(1100);
  expect(panelMeasurements.workspace.right).toBeLessThanOrEqual(1440);
  expect(panelMeasurements.documentScrollWidth).toBe(1440);
  for (const panel of panelMeasurements.panels) {
    expect(panel.width).toBeGreaterThan(200);
    expect(panel.overflowY).toBe("auto");
    expect(panel.scrollHeight).toBeGreaterThanOrEqual(panel.clientHeight);
  }
  let panelsWithOverflow = 0;
  for (const label of ["Synlige fakturaer · Indbakke · internt scrollområde", "Originaldokument · internt scrollområde", "Behandling · internt scrollområde"]) {
    const region = page.getByRole("region", { name: label });
    const maximum = await region.evaluate((node) => node.scrollHeight - node.clientHeight);
    if (maximum > 0) {
      panelsWithOverflow += 1;
      await region.evaluate((node) => { node.scrollTop = Math.min(160, node.scrollHeight - node.clientHeight); });
      expect(await region.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    }
  }
  expect(panelsWithOverflow).toBeGreaterThanOrEqual(2);
  await writeFile(`${evidenceDir}/measurements-fakturacenter-1440x900.json`, `${JSON.stringify({ before, resized, ...panelMeasurements }, null, 2)}\n`);

  await page.getByRole("button", { name: "Modtag faktura" }).click();
  const intake = page.getByRole("dialog", { name: "Modtag faktura" });
  const file = { name: "syntetisk-faktura.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nsyntetisk browsertest") };
  await intake.getByLabel("Vælg lokale syntetiske fakturafiler").setInputFiles(file);
  await expect(intake.getByText("syntetisk-faktura.pdf", { exact: true })).toBeVisible();
  await expect(intake.getByText(/ikke gemt/)).toBeVisible();
  await intake.getByLabel("Vælg lokale syntetiske fakturafiler").setInputFiles(file);
  await expect(intake.getByText(/Mulig dublet/)).toBeVisible();
  await page.screenshot({ path: `${evidenceDir}/1440x900-fakturacenter-uploadfeedback.png`, fullPage: false });
  await intake.getByRole("button", { name: "Luk" }).click();

  await page.getByRole("checkbox", { name: "Vælg Eksakt PROCURE-bestillingsnummer" }).check();
  await page.getByRole("checkbox", { name: "Vælg Ulæselig fil" }).check();
  const bulk = page.getByRole("region", { name: "Massehandling for synlige fakturaer" });
  await expect(bulk).toContainText("2 valgte");
  await bulk.getByRole("button", { name: "Markér som kontrolleret" }).click();
  const confirm = page.getByRole("dialog", { name: "Bekræft massekontrol" });
  await expect(confirm).toContainText("2 synlige fakturaer");
  await confirm.getByRole("button", { name: "Bekræft og markér som kontrolleret" }).click();
  await expect(page.getByRole("region", { name: "Resultat af massekontrol" })).toBeVisible();
  await expect(page.locator(".fic-message")).toContainText(/Massekontrol: 1 lykkedes, 1 afvist/);
  await page.screenshot({ path: `${evidenceDir}/1440x900-fakturacenter-massekontrol.png`, fullPage: false });
});

import { expect, test } from "@playwright/test";

const browserErrors = (page) => {
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
};

test("Dokumentoversigten søger, filtrerer og vises ved desktopformater", async ({ page }) => {
  const errors = browserErrors(page);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/dokumenter");
  await expect(page.getByRole("heading", { name: "Dokumenter" })).toBeVisible();
  await expect(page.getByText(/Ingen fakturabehandling/)).toBeVisible();
  await page.screenshot({ path: "artifacts/fleet-v2-documents-1672x941.png", fullPage: false });
  await page.getByLabel("Søg i dokumenter").fill("SC-104");
  await expect(page.getByText("Forsikringspolice 2025.pdf").first()).toBeVisible();
  await page.getByLabel("Filtrér dokumentkategori").selectOption("insurance");
  const widths = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(widths.scroll).toBe(widths.inner);

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Dokumenter" })).toBeVisible();
  await page.screenshot({ path: "artifacts/fleet-v2-documents-1366x768.png", fullPage: false });
  expect(errors).toEqual([]);
});

test("upload, relation, versionering, arkiv og gendannelse fungerer", async ({ page }) => {
  const errors = browserErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/dokumenter");
  await page.getByRole("button", { name: "Upload dokumenter" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Dokumentfiler").setInputFiles({ name: "e2e-police.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 e2e") });
  await dialog.getByLabel("Dokumenttitel").fill("E2E forsikringspolice");
  await dialog.getByLabel("Dokumentkategori").selectOption("insurance");
  await dialog.getByText("Enhed", { exact: true }).click();
  await dialog.getByLabel(/SC-104 · Silence S04/).check();
  await dialog.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText("Dokumenterne er gemt lokalt.")).toBeVisible();
  await page.getByLabel("Søg i dokumenter").fill("E2E forsikringspolice");
  await page.getByText("E2E forsikringspolice", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "E2E forsikringspolice" })).toBeVisible();
  await page.getByRole("button", { name: "Ny version" }).click();
  await page.getByRole("dialog").getByLabel("Dokumentfiler").setInputFiles({ name: "e2e-police-v2.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 e2e v2") });
  await page.getByRole("button", { name: "Opret version" }).click();
  await expect(page.getByText("2 versioner")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Arkivér dokument" }).click();
  await expect(page.getByText("Dokumentet er arkiveret").first()).toBeVisible();
  await page.getByRole("button", { name: "Gendan" }).click();
  await expect(page.getByText("Dokumentet er gendannet.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Dokumenter er læsbare på mobil uden vandret side-overløb", async ({ page }) => {
  const errors = browserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dokumenter");
  await expect(page.getByRole("heading", { name: "Dokumenter" })).toBeVisible();
  await page.screenshot({ path: "artifacts/fleet-v2-documents-mobile-390x844.png", fullPage: false });
  const widths = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(widths.scroll).toBe(widths.inner);
  await page.getByLabel("Søg i dokumenter").fill("Forsikringspolice 2025");
  await page.getByText("Forsikringspolice 2025.pdf").first().click();
  await expect(page.getByRole("button", { name: "Dokumenter" }).last()).toBeVisible();
  await page.screenshot({ path: "artifacts/fleet-v2-document-detail-mobile-390x844.png", fullPage: false });
  expect(errors).toEqual([]);
});

import { expect, test } from "@playwright/test";

const captureErrors = (page) => {
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
};

test("leasingoverblik, aftale og kilometer er sammenhængende på desktop", async ({ page }) => {
  const errors = captureErrors(page);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/leasing");
  await expect(page.getByRole("heading", { name: "Leasing", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Leasing", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("row", { name: /NB-001.*LS-2024-018/ })).toBeVisible();
  await page.screenshot({ path: "artifacts/fleet-v2-leasing-overview-1672x941.png", fullPage: false });
  await page.getByRole("row", { name: /NB-001.*LS-2024-018/ }).click();
  await expect(page.getByRole("heading", { name: "NB-001 · Leasingaftale" })).toBeVisible();
  await page.screenshot({ path: "artifacts/fleet-v2-leasing-detail-1672x941.png", fullPage: false });
  await page.getByRole("button", { name: "Kilometer", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Kilometer og prognose · NB-001/ })).toBeVisible();
  await expect(page.getByText(/OBD-tilvalg.*ikke tilsluttet/)).toBeVisible();
  await page.screenshot({ path: "artifacts/fleet-v2-leasing-kilometres-1672x941.png", fullPage: false });
  expect(errors).toEqual([]);
});

test("syntetisk kontrakt viser belæg og kræver eksplicit anvendelse", async ({ page }) => {
  const errors = captureErrors(page);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/leasing/lease-demo-nb-001/kontraktgennemgang");
  await expect(page.getByRole("heading", { name: /Gennemgå aflæst leasingaftale/ })).toBeVisible();
  await expect(page.getByText("NORD LEASING")).toBeVisible();
  await expect(page.getByText(/Kun den navngivne syntetiske kontrakt/)).toBeVisible();
  await page.screenshot({ path: "artifacts/fleet-v2-leasing-contract-review-1672x941.png", fullPage: false });
  expect(errors).toEqual([]);
});

test("afleveringssagen holder fysisk aflevering og slutafregning adskilt", async ({ page }) => {
  const errors = captureErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/leasing/lease-demo-nb-001/aflevering");
  await expect(page.getByRole("heading", { name: "NB-001 · Afleveringssag" })).toBeVisible();
  await expect(page.getByText(/Fakturacenter er ikke tilsluttet/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Registrér fysisk aflevering" })).toBeDisabled();
  await page.screenshot({ path: "artifacts/fleet-v2-leasing-delivery-1366x768.png", fullPage: false });
  expect(errors).toEqual([]);
});

test("leasing er læsbar på mobil uden vandret dokumentoverløb", async ({ page }) => {
  const errors = captureErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/leasing");
  await expect(page.getByRole("heading", { name: "Leasing", exact: true })).toBeVisible();
  let widths = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(widths.scroll).toBe(widths.inner);
  await page.screenshot({ path: "artifacts/fleet-v2-leasing-mobile-390x844.png", fullPage: false });
  await page.goto("/leasing/lease-demo-nb-001/kontraktgennemgang");
  await expect(page.getByRole("heading", { name: /Gennemgå aflæst leasingaftale/ })).toBeVisible();
  widths = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(widths.scroll).toBe(widths.inner);
  await page.screenshot({ path: "artifacts/fleet-v2-leasing-contract-mobile-390x844.png", fullPage: false });
  expect(errors).toEqual([]);
});

test("kontraktupload gemmes med aftalen og vises som brugerens eget dokument", async ({ page }) => {
  const errors = captureErrors(page);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/leasing");
  await page.getByRole("button", { name: "Opret leasingaftale" }).click();
  const dialog = page.getByRole("form", { name: "Opret leasingaftale" });
  await dialog.getByLabel("Vælg leasingkontrakt").setInputFiles({
    name: "LS-E2E-202.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% FLEET v2 lokal testkontrakt\n"),
  });
  await expect(dialog.getByText("LS-E2E-202.pdf")).toBeVisible();
  await page.screenshot({ path: "artifacts/fleet-v2-lease-contract-upload-dialog-1672x941.png", fullPage: false });
  await dialog.getByRole("button", { name: "Forhåndsvis" }).click();
  await expect(dialog.getByLabel("Forhåndsvisning af LS-E2E-202.pdf")).toBeVisible();
  await dialog.getByLabel("Aftalenummer").fill("LS-E2E-202");
  await dialog.getByLabel("Leasingens enhed").selectOption("unit-nb-002");
  await dialog.getByLabel("Leasingselskab").fill("E2E Leasing");
  await dialog.getByLabel(/^Startdato/).fill("2026-01-01");
  await dialog.getByLabel(/^Kontraktudløb/).fill("2028-12-31");
  await dialog.getByRole("button", { name: "Gem aftale" }).click();
  await expect(page.getByText(/LS-E2E-202 er gemt lokalt/)).toBeVisible();
  await page.getByRole("row", { name: /NB-002.*LS-E2E-202/ }).click();
  await page.getByRole("navigation", { name: "Leasingaftalens faner" }).getByRole("button", { name: "Dokumenter", exact: true }).click();
  await expect(page.getByText("LS-E2E-202.pdf")).toBeVisible();
  await page.goto(page.url().replace(/\/dokumenter$/, "/kontraktgennemgang"));
  await expect(page.getByText(/Automatisk aflæsning er ikke tilsluttet for brugerens egne filer/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("kontraktfeltet er tilgængeligt uden vandret overløb på mobil", async ({ page }) => {
  const errors = captureErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/leasing");
  await page.getByRole("button", { name: "Opret leasingaftale" }).click();
  const dialog = page.getByRole("form", { name: "Opret leasingaftale" });
  await expect(dialog.getByText("Leasingkontrakt", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Vælg leasingkontrakt")).toBeAttached();
  const widths = await dialog.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
  await page.screenshot({ path: "artifacts/fleet-v2-lease-contract-upload-dialog-mobile-390x844.png", fullPage: false });
  expect(errors).toEqual([]);
});

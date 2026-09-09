import { expect, test } from "@playwright/test";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAHgQCAZ7l3fQAAAAASUVORK5CYII=", "base64");
const browserErrors = (page) => {
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
};
const expectNoHorizontalOverflow = async (page) => {
  const widths = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(widths.scroll).toBe(widths.inner);
};

test("mobilindberetning er adgangsafgrænset, responsiv og klar til samme fælles flow", async ({ page }) => {
  const errors = browserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/mobil");
  await expect(page.getByRole("heading", { name: "Mobil indberetning" })).toBeVisible();
  await expect(page.getByText("Prototypelogik – ikke produktionssikret adgangskontrol.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Ny indberetning/ }).click();
  await expect(page.getByRole("heading", { name: "Ny indberetning" })).toBeVisible();
  await expect(page.getByText(/demo-bruger/)).toBeVisible();
  await expect(page.getByRole("button", { name: /SC-104/ })).toBeVisible();
  await page.screenshot({ path: "artifacts/fleet-v2-mobile-reporting-390x844.png", fullPage: false });
  await expectNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test("økonomi viser adskilte beløbstyper, sporbarhed og læsbare mobil- og desktopvisninger", async ({ page }) => {
  const errors = browserErrors(page);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/oekonomi");
  await expect(page.getByRole("heading", { name: "Økonomi og flådestatistik" })).toBeVisible();
  await expect(page.getByText("Registrerede faktiske", { exact: true })).toBeVisible();
  await expect(page.getByText("Foreløbige eksterne", { exact: true })).toBeVisible();
  await expect(page.getByText("Kontraktlige ydelser", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sporbare poster" })).toBeVisible();
  await page.screenshot({ path: "artifacts/fleet-v2-economy-1672x941.png", fullPage: false });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.reload();
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Økonomi og flådestatistik" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test("leasing kan forhåndsvise et fælles enhedsbillede uden at gemme ved annullering", async ({ page }) => {
  const errors = browserErrors(page);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/leasing");
  await page.getByRole("button", { name: "Opret leasingaftale" }).click();
  const dialog = page.getByRole("form", { name: "Opret leasingaftale" });
  await dialog.getByLabel("Vælg enhedsbillede fra Leasing").setInputFiles({ name: "fleet-unit.png", mimeType: "image/png", buffer: png });
  await expect(dialog.getByAltText(/Billede af/)).toBeVisible();
  await expect(dialog.getByText(/opdateres også i Enheder, profil og mobilvalg/)).toBeVisible();
  await page.screenshot({ path: "artifacts/fleet-v2-lease-unit-image-1672x941.png", fullPage: false });
  page.once("dialog", (nativeDialog) => nativeDialog.accept());
  await dialog.getByRole("button", { name: "Annuller" }).click();
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Under vurdering kan kun flyttes tilbage til Ny efter fælles bekræftelse", async ({ page }) => {
  const errors = browserErrors(page);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/arbejdsko/case-demo-001");
  await expect(page.getByRole("dialog", { name: /Sagsdetaljer/ })).toBeVisible();
  await page.getByLabel("Flyt status").selectOption("new");
  await page.getByRole("button", { name: "Gem vurdering" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Flyt sagen tilbage til Ny?" });
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText("Eksisterende oplysninger, bilag og historik bevares");
  await page.screenshot({ path: "artifacts/fleet-v2-back-to-new-confirm-1672x941.png", fullPage: false });
  await confirm.getByRole("button", { name: "Annuller" }).click();
  await expect(page.getByRole("dialog", { name: /Sagsdetaljer/ })).toContainText("Under vurdering");
  await page.getByLabel("Flyt status").selectOption("new");
  await page.getByRole("button", { name: "Gem vurdering" }).click();
  await page.getByRole("alertdialog", { name: "Flyt sagen tilbage til Ny?" }).getByRole("button", { name: "Ja, flyt tilbage" }).click();
  await expect(page.getByRole("dialog", { name: /Sagsdetaljer/ })).toContainText("Ny");
  expect(errors).toEqual([]);
});

import { expect, test } from "@playwright/test";

const screenshotPath = (name) => `artifacts/${name}.png`;

const collectBrowserErrors = (page) => {
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
};

test("Enhedskartotek søger, filtrerer, sorterer, skifter visning og eksporterer", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/enheder");
  await expect(page.getByRole("heading", { name: "Enhedskartotek" })).toBeVisible();
  await expect(page.getByText("Fiktive demodata · lokal prototype")).toBeVisible();

  await page.getByLabel("Søg i enheder").fill("Silence");
  await expect(page.getByText("SC-104", { exact: true })).toBeVisible();
  await page.getByLabel("Status").selectOption("workshop");
  await expect(page.getByText("Viser 1 af 19 enheder")).toBeVisible();
  await page.getByLabel("Sortering").selectOption("meter-desc");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Eksportér CSV" }).click();
  expect((await download).suggestedFilename()).toBe("veyro-fleet-v2-enheder.csv");

  await page.getByLabel("Kortvisning").click();
  await expect(page.getByLabel("Kortvisning")).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Tabelvisning").click();
  await page.getByRole("button", { name: "Nulstil" }).click();
  await page.getByLabel("Søg i enheder").fill("findes-ikke");
  await expect(page.getByRole("heading", { name: "Ingen enheder matcher" })).toBeVisible();
  await page.getByRole("button", { name: "Nulstil filtre" }).click();

  const dimensions = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.innerWidth);
  expect(errors).toEqual([]);
  await page.screenshot({ path: screenshotPath("fleet-v2-units-1672x941"), fullPage: false });
});

test("enhed oprettes, redigeres og bevares efter genindlæsning", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/enheder");
  await page.getByRole("button", { name: "Opret enhed" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Enhedsnummer/).fill("QA-900");
  await dialog.getByLabel(/^Mærke/).fill("Veyro Test");
  await dialog.getByLabel(/^Model/).fill("Prototype 2");
  await dialog.getByLabel(/^Afdeling/).fill("Kvalitet");
  await dialog.getByLabel(/Målerstand/).fill("123");
  await dialog.getByRole("button", { name: "Opret enhed" }).click();
  await expect(page.getByText("QA-900", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Redigér QA-900" }).click();
  const edit = page.getByRole("dialog");
  const immutableId = await edit.getByLabel("Internt ID").inputValue();
  await edit.getByLabel(/Enhedsnummer/).fill("QA-901");
  await edit.getByRole("button", { name: "Gem ændringer" }).click();
  await expect(page.getByText("QA-901", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByLabel("Søg i enheder").fill("QA-901");
  await expect(page.getByText("QA-901", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Redigér QA-901" }).click();
  await expect(page.getByLabel("Internt ID")).toHaveValue(immutableId);
  await page.getByRole("button", { name: "Luk formular" }).click();
  expect(errors).toEqual([]);
  await page.screenshot({ path: screenshotPath("fleet-v2-units-1366x768"), fullPage: false });
});

test("SC-104-profilen åbnes direkte, viser ID-bundne faner og afgrænsede GPS-data", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/enheder/unit-sc-104");
  await expect(page.getByRole("heading", { name: "SC-104" })).toBeVisible();
  await page.screenshot({ path: screenshotPath("fleet-v2-unit-sc-104-1672x941"), fullPage: false });

  for (const tab of ["Historik", "Servicebog", "Skader", "Dokumenter", "Økonomi", "GPS", "Overblik"]) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
  }
  await page.getByRole("tab", { name: "Økonomi" }).click();
  await expect(page.getByText(/ingen fakturabehandling/i)).toBeVisible();
  await page.getByRole("tab", { name: "GPS" }).click();
  await expect(page.getByRole("heading", { name: "Senest kendte position" })).toBeVisible();
  await expect(page.getByText("Demoposition – ikke live")).toBeVisible();
  expect(errors).toEqual([]);
});

test("ukendt profil-ID og mobilprofil har robuste tilstande", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/enheder/unit-sc-104");
  await expect(page.getByRole("heading", { name: "SC-104" })).toBeVisible();
  const widths = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(widths.scroll).toBe(widths.inner);
  await page.screenshot({ path: screenshotPath("fleet-v2-unit-sc-104-mobile-390x844"), fullPage: false });
  await page.goto("/enheder/ukendt-enhed");
  await expect(page.getByRole("heading", { name: "Enheden findes ikke" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("billede og udvendige mål gemmes lokalt, genindlæses og kan fjernes", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAHgQCAZ7l3fQAAAAASUVORK5CYII=", "base64");
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/enheder");
  await page.getByRole("button", { name: "Opret enhed" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Enhedsnummer/).fill("QA-IMAGE");
  await dialog.getByLabel(/^Mærke/).fill("Veyro Test");
  await dialog.getByLabel(/^Model/).fill("Fotoenhed");
  await dialog.getByLabel(/^Afdeling/).fill("Kvalitet");
  await dialog.getByLabel("Registreringsnummer").fill("ab 12-345");
  await dialog.getByRole("button", { name: "Hent køretøjsdata" }).click();
  await expect(dialog.getByText(/Nummerpladeopslag er ikke tilsluttet/)).toBeVisible();
  await dialog.getByLabel(/Tilføj udvendige mål/).check();
  await dialog.getByLabel("Længde i cm").fill("599,5");
  await dialog.getByLabel("Bredde i cm").fill("210");
  await dialog.locator('input[type="file"]').setInputFiles({ name: "unit.png", mimeType: "image/png", buffer: png });
  await expect(dialog.getByAltText("Forhåndsvisning af enhedsbillede")).toBeVisible();
  await page.screenshot({ path: screenshotPath("fleet-v2-unit-form-1366x768"), fullPage: false });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.screenshot({ path: screenshotPath("fleet-v2-unit-form-1672x941"), fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: screenshotPath("fleet-v2-unit-form-mobile-390x844"), fullPage: false });
  await page.setViewportSize({ width: 1366, height: 768 });
  await dialog.getByRole("button", { name: "Opret enhed" }).click();

  await expect(page.getByText("QA-IMAGE", { exact: true })).toBeVisible();
  await page.getByText("QA-IMAGE", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "QA-IMAGE" })).toBeVisible();
  await expect(page.getByAltText("Billede af QA-IMAGE")).toBeVisible();
  await expect(page.getByText("599,5 cm")).toBeVisible();

  await page.getByRole("button", { name: "Redigér" }).click();
  dialog = page.getByRole("dialog");
  const stableId = await dialog.getByLabel("Internt ID").inputValue();
  await dialog.locator('input[type="file"]').setInputFiles({ name: "replacement.png", mimeType: "image/png", buffer: png });
  await dialog.getByRole("button", { name: "Gem ændringer" }).click();
  await page.reload();
  await expect(page.getByAltText("Billede af QA-IMAGE")).toBeVisible();

  await page.getByRole("button", { name: "Redigér" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Internt ID")).toHaveValue(stableId);
  await dialog.getByRole("button", { name: "Fjern billede" }).click();
  await dialog.getByRole("button", { name: "Gem ændringer" }).click();
  await expect(page.getByAltText("Billede af QA-IMAGE")).toHaveCount(0);
  expect(errors).toEqual([]);
});

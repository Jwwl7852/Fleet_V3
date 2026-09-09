import { expect, test } from "@playwright/test";

const browserErrors = (page) => {
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
};

test("Livekort filtrerer, synkroniserer enheder og viser ærlige positionstilstande", async ({ page }) => {
  const errors = browserErrors(page);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/livekort");
  await expect(page.getByRole("heading", { name: "Livekort" })).toBeVisible();
  await expect(page.getByText("Demopositioner – ikke live").first()).toBeVisible();
  await page.waitForFunction(() => [...document.querySelectorAll(".live-map-map-panel .map-tiles img")].filter((image) => image.complete && image.naturalWidth > 0).length >= 6);
  await page.screenshot({ path: "artifacts/fleet-v2-live-map-1672x941.png", fullPage: false });

  await page.getByPlaceholder(/Søg nummer/).fill("Husqvarna");
  await page.getByRole("button", { name: /NB-018/ }).click();
  await expect(page.getByText("Ingen position registreret")).toBeVisible();
  await page.getByRole("button", { name: "Nulstil filtre" }).click();
  await page.getByRole("button", { name: /NB-006/ }).click();
  await expect(page.locator(".live-detail-panel").getByText("Offline", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".live-detail-panel").getByText(/Positionen er forældet/)).toBeVisible();

  const mainText = (await page.locator("#main-content").innerText()).toLocaleLowerCase("da");
  for (const forbidden of ["rutehistorik", "dagens opgaver", "planlagte stop", "besøgsrækkefølge", "chaufførplanlægning"]) expect(mainText).not.toContain(forbidden);
  expect(errors).toEqual([]);
});

test("demokontrol bevarer kortudsnit og GPS-fanen bruger samme position", async ({ page }) => {
  const errors = browserErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/livekort?unit=unit-sc-104");
  await expect(page.getByRole("heading", { name: "Livekort" })).toBeVisible();
  await page.getByLabel("Zoom ind").click();
  const tileBefore = await page.locator(".live-map-map-panel .map-tiles img").first().getAttribute("src");
  await page.getByRole("button", { name: "Demokontrol" }).click();
  await page.locator(".position-demo-control").getByLabel("Enhed").selectOption("unit-sc-104");
  await page.locator(".position-demo-control").getByLabel("Situation").selectOption("move");
  await page.getByRole("button", { name: "Kør demo" }).click();
  await expect(page.getByText(/Kortudsnit og valg er bevaret/)).toBeVisible();
  const tileAfter = await page.locator(".live-map-map-panel .map-tiles img").first().getAttribute("src");
  expect(tileAfter?.split("/")[3]).toBe(tileBefore?.split("/")[3]);
  const label = await page.locator(".live-detail-panel .live-position-details").getByText(/København|Rødovre|Hvidovre|Nordhavn/).first().textContent();
  await page.getByRole("button", { name: /Åbn enhedsprofil/ }).click();
  await page.getByRole("tab", { name: "GPS" }).click();
  await expect(page.locator(".gps-detail").getByText(label, { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Livekort er betjeneligt på mobil uden vandret dokumentoverløb", async ({ page }) => {
  const errors = browserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/livekort");
  await expect(page.getByRole("heading", { name: "Livekort" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Kort", exact: true })).toBeVisible();
  await page.waitForFunction(() => [...document.querySelectorAll(".live-map-map-panel .map-tiles img")].some((image) => image.complete && image.naturalWidth > 0));
  await page.screenshot({ path: "artifacts/fleet-v2-live-map-mobile-map-390x844.png", fullPage: false });
  await page.getByRole("button", { name: "Liste", exact: true }).click();
  await expect(page.getByPlaceholder(/Søg nummer/)).toBeVisible();
  await page.screenshot({ path: "artifacts/fleet-v2-live-map-mobile-390x844.png", fullPage: false });
  const dimensions = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBe(dimensions.inner);
  await page.getByRole("button", { name: /SC-104/ }).click();
  await expect(page.getByRole("application", { name: /Geografisk kort/ })).toBeVisible();
  expect(errors).toEqual([]);
});

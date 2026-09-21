import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const output = resolve(process.cwd(), "..", "artifacts", "veyro-livekort-markoerer-v1-2026-09-21");

async function openLiveMap(page) {
  await page.goto("/livekort");
  await expect(page.getByRole("heading", { name: "Livekort", exact: true })).toBeVisible();
  await expect(page.locator(".geo-marker").first()).toBeVisible();
  const closePopup = page.getByRole("button", { name: "Luk enhedsdetaljer" });
  if (await closePopup.isVisible()) await closePopup.click();
}

test("kompakte markører, tooltip, søgning og Find på kort", async ({ page }) => {
  mkdirSync(output, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLiveMap(page);

  const marker = page.locator(".geo-marker").first();
  const markerSize = await marker.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { width: box.width, height: box.height };
  });
  expect(markerSize.width).toBeLessThanOrEqual(22);
  expect(markerSize.height).toBeLessThanOrEqual(22);
  await expect(page.locator(".geo-marker-tooltip").first()).toBeHidden();
  await page.screenshot({ path: resolve(output, "01-kompakte-markoerer-1440x900.png"), fullPage: false });

  await marker.hover();
  await expect(marker.locator(".geo-marker-tooltip")).toBeVisible();
  await page.screenshot({ path: resolve(output, "02-markoer-tooltip-1440x900.png"), fullPage: false });

  await marker.focus();
  await expect(marker.locator(".geo-marker-tooltip")).toBeVisible();
  await marker.click();
  await expect(page.locator(".geo-unit-popup")).toBeVisible();

  const search = page.getByRole("combobox", { name: "Vælg køretøj" });
  const option = page.locator("#live-map-units option").first();
  const number = await option.getAttribute("value");
  const searchTerms = [number, await option.getAttribute("label")];
  for (const term of searchTerms.filter(Boolean)) {
    await search.fill(term);
    await expect(page.locator(".live-unit-card")).toHaveCount(1);
  }
  await search.fill("");

  await page.getByRole("button", { name: "Find på kort", exact: true }).first().click();
  await expect(page.locator(".geo-marker.located")).toBeVisible();
  await expect(page.locator(".live-map-notice")).toBeVisible();
});

test("markører kan vælges med tryk på mobil uden vandret dokumentoverløb", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLiveMap(page);
  await page.locator(".geo-marker").first().click();
  await expect(page.locator(".geo-unit-popup")).toBeVisible();
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  expect(dimensions.document).toBe(dimensions.viewport);
});

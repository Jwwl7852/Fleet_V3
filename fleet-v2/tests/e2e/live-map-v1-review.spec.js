import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const output = resolve(process.cwd(), "..", "artifacts", "veyro-livekort-v1-2026-09-21");

async function loginIfNeeded(page) {
  await page.waitForTimeout(500);
  if (!await page.getByRole("textbox", { name: "E-mail" }).count()) return;
  await page.getByRole("textbox", { name: "E-mail" }).fill("kollegatest-admin@example.invalid");
  await page.getByRole("textbox", { name: "Adgangskode" }).fill("Veyro-Kollegatest-Only-2026!");
  await page.getByRole("button", { name: "Log ind" }).click();
  await page.waitForURL(/fleet-v2\/livekort/, { timeout: 10_000 });
}

async function openLiveMap(page) {
  await page.goto("/fleet-v2/livekort");
  await loginIfNeeded(page);
  await expect(page.getByRole("heading", { name: "FLEET – Livekort" })).toBeVisible();
  await expect(page.getByText("DEMO · Syntetiske data")).toBeVisible();
}

async function settleMap(page) {
  await page.waitForTimeout(700);
}

test("Version 1 Livekort review screenshots", async ({ page }) => {
  mkdirSync(output, { recursive: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await openLiveMap(page);
  await expect(page.getByRole("button", { name: "Planning", exact: true })).toBeVisible();
  await settleMap(page);
  await page.screenshot({ path: resolve(output, "01-live-1440x900.png"), fullPage: false });
  await page.getByRole("button", { name: "Følg enhed" }).click();
  await expect(page.getByText("Følger valgt enhed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop med at følge" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Historik", exact: true }).first().click();
  await expect(page.getByRole("application", { name: /Historisk rute/ })).toBeVisible();
  await expect(page.getByLabel(/Databrud før/)).toBeVisible();
  await settleMap(page);
  await page.screenshot({ path: resolve(output, "02-historik-kort-1440x900.png"), fullPage: false });

  const periodButton = page.getByRole("button", { name: /Valgt periode/ });
  await periodButton.click();
  await expect(page.getByRole("dialog", { name: "Vælg historikperiode" })).toBeVisible();
  await page.screenshot({ path: resolve(output, "03-periode-popup-1440x900.png"), fullPage: false });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Vælg historikperiode" })).toBeHidden();
  await expect(periodButton).toBeFocused();
  await periodButton.click();
  await page.getByRole("heading", { name: "FLEET – Livekort" }).click();
  await expect(page.getByRole("dialog", { name: "Vælg historikperiode" })).toBeHidden();

  await page.getByRole("tab", { name: "Positioner" }).click();
  await expect(page.getByRole("button", { name: "Vis på kort" })).toBeVisible();
  await expect(page.getByText(/1–25 af/)).toBeVisible();
  await page.getByRole("button", { name: "Næste side" }).click();
  await expect(page.getByText(/26–36 af 36/)).toBeVisible();
  await page.getByRole("button", { name: "Forrige side" }).click();
  await page.getByText("Tekniske data").click();
  await expect(page.getByText("Syntetisk testadapter")).toBeVisible();
  await settleMap(page);
  await page.screenshot({ path: resolve(output, "04-positioner-1440x900.png"), fullPage: false });

  await page.getByRole("tab", { name: "Målinger" }).click();
  await expect(page.getByRole("heading", { name: /Målinger ved/ })).toBeVisible();
  await page.screenshot({ path: resolve(output, "05-maalinger-1440x900.png"), fullPage: false });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "Live", exact: true }).click();
  const expand = page.getByRole("button", { name: "Åbn normal menu" });
  if (await expand.count()) await expand.click();
  await expect(page.getByRole("button", { name: "Planning", exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(output, "06-live-udfoldet-menu-1280x800.png"), fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/fleet-v2/livekort");
  await expect(page.getByRole("button", { name: "Kort", exact: true })).toBeVisible();
  await settleMap(page);
  await page.screenshot({ path: resolve(output, "07-live-mobil-390x844.png"), fullPage: false });
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  expect(dimensions.document).toBe(dimensions.viewport);
  await page.getByRole("button", { name: "Historik", exact: true }).first().click();
  await expect(page.getByRole("application", { name: /Historisk rute/ })).toBeVisible();
  await settleMap(page);
  await page.screenshot({ path: resolve(output, "08-historik-mobil-390x844.png"), fullPage: false });
  const historyDimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  expect(historyDimensions.document).toBe(historyDimensions.viewport);
});

test("musehjul over kortet zoomer uden at rulle siden", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await openLiveMap(page);
  const map = page.getByRole("application", { name: /Livekort med/ });
  await expect(map).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, Math.min(180, document.documentElement.scrollHeight - window.innerHeight)));
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const tileBefore = await map.locator(".map-tiles img").first().getAttribute("src");
  await map.hover({ position: { x: 400, y: 220 } });
  await page.mouse.wheel(0, -180);
  await expect.poll(() => map.locator(".map-tiles img").first().getAttribute("src")).not.toBe(tileBefore);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBefore);
});

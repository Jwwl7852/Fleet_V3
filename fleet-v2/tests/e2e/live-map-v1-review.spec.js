import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const output = resolve(process.cwd(), "..", "artifacts", "veyro-livekort-v1-2026-09-21");

const modeButton = (page, name) => page.getByRole("group", { name: "Vælg Live eller Historik" }).getByRole("button", { name, exact: true });

async function openLiveMap(page) {
  await page.goto("/livekort");
  await expect(page.getByRole("heading", { name: "Livekort" })).toBeAttached();
  await expect(page.getByRole("application", { name: "Livekort med enhedspositioner" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Kører 7" })).toBeVisible();
  await page.waitForTimeout(700);
}

async function openHistory(page) {
  await modeButton(page, "Historik").click();
  await expect(page.getByRole("application", { name: /Historisk rute/ })).toBeVisible();
  await expect(page.locator(".geo-route-endpoint")).toHaveCount(2);
  await expect(page.locator(".geo-route-cursor")).toBeVisible();
  await page.waitForTimeout(700);
}

test("ensrettet Livekort og Historik ved 1440 × 900", async ({ page }) => {
  mkdirSync(output, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLiveMap(page);

  await expect(page.getByRole("button", { name: "Holder 10" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Intet signal 2" })).toBeVisible();
  const [departmentBox, typeBox, searchBox] = await Promise.all([
    page.getByLabel("Afdeling").boundingBox(),
    page.getByLabel("Enhedstype").boundingBox(),
    page.getByLabel("Vælg køretøj").boundingBox(),
  ]);
  expect(Math.round(departmentBox.y)).toBe(Math.round(typeBox.y));
  expect(searchBox.y).toBeGreaterThan(departmentBox.y);
  await page.screenshot({ path: resolve(output, "01-live-1440x900.png"), fullPage: false });

  await openHistory(page);
  await expect(page.getByText("Ture og stop")).toBeVisible();
  await expect(page.getByLabel(/Databrud før/)).toBeVisible();
  await page.screenshot({ path: resolve(output, "02-historik-kort-1440x900.png"), fullPage: false });

  const periodButton = page.getByRole("button", { name: /Valgt periode/ });
  await periodButton.click();
  const periodPopup = page.getByRole("dialog", { name: "Vælg historikperiode" });
  await expect(periodPopup).toBeVisible();
  const popupOverflow = await periodPopup.evaluate((node) => ({ clientWidth: node.clientWidth, scrollWidth: node.scrollWidth }));
  expect(popupOverflow.scrollWidth).toBe(popupOverflow.clientWidth);
  await page.screenshot({ path: resolve(output, "03-periode-popup-1440x900.png"), fullPage: false });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Vælg historikperiode" })).toBeHidden();
  await expect(periodButton).toBeFocused();

  await page.getByRole("tab", { name: "Positioner" }).click();
  await expect(page.getByRole("heading", { name: /Positioner ·/ })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Historikpanel" })).toBeVisible();
  await page.screenshot({ path: resolve(output, "04-positioner-1440x900.png"), fullPage: false });

  await page.getByRole("tab", { name: "Målinger" }).click();
  await expect(page.getByRole("heading", { name: /Målinger ved/ })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Historikpanel" })).toBeVisible();
  await page.screenshot({ path: resolve(output, "05-maalinger-1440x900.png"), fullPage: false });

  await page.getByRole("tab", { name: "Kort" }).click();
  await page.getByRole("button", { name: "Skjul historikpanel" }).click();
  await expect(page.locator(".history-workspace")).toHaveClass(/list-collapsed/);
  await page.screenshot({ path: resolve(output, "06-historik-panel-lukket-1440x900.png"), fullPage: false });
});

test("layout ved 1280 × 800 og mobil 390 × 844", async ({ page }) => {
  mkdirSync(output, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await openLiveMap(page);
  await expect(page.getByRole("complementary", { name: "Enhedsoversigt" })).toBeVisible();
  await page.screenshot({ path: resolve(output, "07-live-1280x800.png"), fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/livekort");
  await expect(page.getByRole("button", { name: "Kort", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Panel", exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(output, "08-live-mobil-390x844.png"), fullPage: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await page.getByRole("button", { name: "Panel", exact: true }).click();
  await modeButton(page, "Historik").click();
  await expect(page.getByRole("button", { name: "Indhold", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Indhold", exact: true }).click();
  await expect(page.getByRole("application", { name: /Historisk rute/ })).toBeVisible();
  await page.screenshot({ path: resolve(output, "09-historik-mobil-390x844.png"), fullPage: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("musehjul over kortet zoomer uden at rulle siden", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openLiveMap(page);
  const map = page.getByRole("application", { name: "Livekort med enhedspositioner" });
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const tileBefore = await map.locator(".map-tiles img").first().getAttribute("src");
  await map.hover({ position: { x: 400, y: 220 } });
  await page.mouse.wheel(0, -180);
  await expect.poll(() => map.locator(".map-tiles img").first().getAttribute("src")).not.toBe(tileBefore);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBefore);
});

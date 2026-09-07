import { expect, test } from "@playwright/test";

const screenshotPath = (name) => `artifacts/${name}.png`;

test("referenceformatet viser hele Overblik uden lodret scroll eller konsolfejl", async ({ page }) => {
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "God aften, Dennis" })).toBeVisible();
  await expect(page.getByText("Fiktive demodata · ikke live")).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    innerHeight: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions).toEqual({ innerHeight: 941, scrollHeight: 941, innerWidth: 1672, scrollWidth: 1672 });
  const menuMetrics = await page.locator(".sidebar-scroll").evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(menuMetrics.scrollHeight).toBeGreaterThan(menuMetrics.clientHeight);
  expect(menuMetrics.overflowY).toBe("auto");
  expect(consoleErrors).toEqual([]);
  await page.screenshot({ path: screenshotPath("fleet-v2-overview-1672x941"), fullPage: false });

  const fleetToggle = page.getByRole("button", { name: "FLEET", exact: true });
  await fleetToggle.click();
  await expect(fleetToggle).toHaveAttribute("aria-expanded", "false");
  await expect(fleetToggle).toHaveClass(/has-active-child/);
  await expect(page.getByRole("heading", { name: "God aften, Dennis" })).toBeVisible();
  await page.screenshot({ path: screenshotPath("fleet-v2-overview-1672x941-menu-collapsed"), fullPage: false });

  await page.reload();
  await expect(page.getByRole("button", { name: "FLEET", exact: true })).toHaveAttribute("aria-expanded", "false");
  expect(consoleErrors).toEqual([]);
});

test("1366 × 768 ombryder uden vandret side-overløb", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "God aften, Dennis" })).toBeVisible();
  const widths = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(widths.scroll).toBe(widths.inner);
  await page.screenshot({ path: screenshotPath("fleet-v2-overview-1366x768"), fullPage: false });
});

test("mobilnavigation åbner det implementerede Enhedskartotek", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Åbn menu" }).click();
  await expect(page.getByRole("navigation", { name: "FLEET v2 navigation" })).toBeVisible();
  await page.getByRole("button", { name: "Enheder", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Enhedskartotek" })).toBeVisible();
  await page.screenshot({ path: screenshotPath("fleet-v2-units-mobile-390x844"), fullPage: false });
});

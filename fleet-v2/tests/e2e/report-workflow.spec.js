import { expect, test } from "@playwright/test";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAHgQCAZ7l3fQAAAAASUVORK5CYII=", "base64");
const collectBrowserErrors = (page) => { const errors = []; page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); }); page.on("pageerror", (error) => errors.push(error.message)); return errors; };

test("indberetning følger samme sag gennem triage, Arbejdskø og enhedsprofil", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/indberetninger/ny");
  await page.getByRole("button", { name: /SC-104/ }).click();
  await page.getByRole("button", { name: /Fortsæt/ }).click();
  await page.getByRole("button", { name: /Skade/ }).click();
  await page.getByLabel("Kategori").fill("Karrosseri");
  await page.getByLabel("Titel").fill("E2E skade på sidespejl");
  await page.getByLabel("Beskrivelse", { exact: true }).fill("Sidespejlet blev ramt ved en port og sidder nu løst.");
  await page.getByRole("button", { name: /Fortsæt/ }).click();
  await page.locator('.image-drop input[type="file"]').setInputFiles({ name: "damage.png", mimeType: "image/png", buffer: png });
  await expect(page.getByAltText("Vedhæftet billede 1")).toBeVisible();
  await page.getByLabel(/^Kilometertal/).fill("12460");
  await page.getByLabel("Kan ikke bruges").check();
  await page.getByRole("button", { name: /Fortsæt/ }).click();
  await page.getByRole("button", { name: "Indsend indberetning" }).click();
  await expect(page.getByRole("heading", { name: "Tak for din indberetning" })).toBeVisible();
  const reportNumber = await page.locator(".report-receipt > div strong").textContent();
  await page.getByRole("button", { name: /Følg status/ }).click();
  await expect(page.getByRole("heading", { name: "E2E skade på sidespejl" })).toBeVisible();
  await page.getByLabel("Vurderet prioritet").selectOption("critical");
  await page.getByLabel("Ansvarlig").selectOption("demo-lars");
  await page.getByLabel("Næste handling").fill("Klargør til værkstedsbehandling");
  await page.getByLabel("Flyt status").selectOption("assessing");
  await page.getByLabel("Intern note").fill("Sikkerhedskritisk og prioriteret.");
  await page.getByRole("button", { name: "Gem vurdering" }).click();
  await expect(page.locator(".triage-detail-panel .eyebrow").first()).toContainText("Under vurdering");
  await page.getByLabel("Flyt status").selectOption("ready");
  await page.getByRole("button", { name: "Gem vurdering" }).click();
  await expect(page.locator(".triage-detail-panel .eyebrow").first()).toContainText("Klar til værksted");
  await page.screenshot({ path: "artifacts/fleet-v2-triage-1672x941.png", fullPage: false });

  await page.getByRole("button", { name: /Arbejdskø/ }).click();
  await expect(page.getByRole("heading", { name: "Arbejdskø" })).toBeVisible();
  await expect(page.getByText("E2E skade på sidespejl", { exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/fleet-v2-work-queue-1672x941.png", fullPage: false });
  await page.goto("/enheder/unit-sc-104");
  await expect(page.getByText("Kan ikke bruges", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Skader" }).click();
  await expect(page.getByText("E2E skade på sidespejl", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Skader" }).click();
  await expect(page.getByText(reportNumber, { exact: false })).toHaveCount(0);
  await expect(page.getByText("E2E skade på sidespejl", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("afvisning og sagslukning kræver forklaring", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/indberetninger/report-demo-002");
  await page.getByLabel("Flyt status").selectOption("rejected");
  await page.getByRole("button", { name: "Gem vurdering" }).click();
  await expect(page.getByRole("alert")).toContainText("begrundelse");
  await page.getByLabel("Begrundelse").fill("Dublet af kendt teknisk varsel.");
  await page.getByRole("button", { name: "Gem vurdering" }).click();
  await expect(page.locator(".triage-detail-panel .eyebrow").first()).toContainText("Afvist");

  await page.goto("/sager/case-demo-001");
  await page.getByText("Luk uden faktura").click();
  await page.getByText("Jeg bekræfter, at sagen kan lukkes").click();
  await page.getByRole("button", { name: "Luk sag" }).click();
  await expect(page.getByRole("status")).toContainText("begrundelse");
  await page.getByLabel("Begrundelse for lukning uden faktura").fill("Løst internt uden ekstern faktura.");
  await page.getByRole("button", { name: "Luk sag" }).click();
  await expect(page.getByText(/Sagen er lukket/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobilformularen er læsbar og bruger tydelig trinnavigation", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/indberetninger/ny");
  await expect(page.getByRole("heading", { name: "Ny indberetning" })).toBeVisible();
  await page.screenshot({ path: "artifacts/fleet-v2-report-mobile-390x844.png", fullPage: false });
  const widths = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(widths.scroll).toBe(widths.inner);
  expect(errors).toEqual([]);
});

test("triage og Arbejdskø ombryder ved 1366 og mobil med tilbage-navigation", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/indberetninger");
  await expect(page.getByRole("heading", { name: "Indberetninger og triage" })).toBeVisible();
  let widths = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(widths.scroll).toBe(widths.inner);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Indberetninger", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /AdBlue-advarsel/ }).click();
  await expect(page.getByRole("button", { name: "Tilbage til listen" })).toBeVisible();
  await page.getByRole("button", { name: "Tilbage til listen" }).click();
  await expect(page.getByRole("heading", { name: "Indberetninger", exact: true })).toBeVisible();
  await page.goto("/arbejdsko");
  await expect(page.getByRole("heading", { name: "Arbejdskø" })).toBeVisible();
  widths = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(widths.scroll).toBe(widths.inner);
  expect(errors).toEqual([]);
});

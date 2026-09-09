import { expect, test } from "@playwright/test";

const browserErrors = (page) => { const errors = []; page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); }); page.on("pageerror", (error) => errors.push(error.message)); return errors; };

test("servicekrav planlægges, bookes og udføres gennem samme sag og servicebog", async ({ page }) => {
  const errors = browserErrors(page);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/service");
  await expect(page.getByRole("heading", { name: "Service og compliance" })).toBeVisible();
  await page.screenshot({ path: "artifacts/fleet-v2-service-1672x941.png", fullPage: false });

  await page.getByRole("button", { name: "Opret servicekrav" }).click();
  await page.getByLabel("Serviceenhed").selectOption("unit-nb-002");
  await page.getByLabel("Servicekravets titel").fill("Browsertest · års- og kilometerservice");
  await page.getByLabel("Serviceinterval måneder").fill("12");
  await page.getByLabel("Serviceinterval måler").fill("20000");
  await page.getByLabel("Service grunddato").fill("2026-01-31");
  await page.getByLabel("Service grundmåler").fill("90000");
  await page.getByRole("button", { name: "Gem servicekrav" }).click();
  const row = page.locator(".service-requirement-row").filter({ hasText: "Browsertest · års- og kilometerservice" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Planlæg" }).click();
  await page.getByLabel("Serviceværksted").selectOption("workshop-external-volvo");
  await page.getByRole("button", { name: "Opret sag og opgave" }).click();
  await expect(page.getByRole("heading", { name: "Browsertest · års- og kilometerservice", level: 1 })).toBeVisible();
  const taskUrl = page.url();
  await expect(page.getByText("Servicekrav · ingen fiktiv indberetning")).toBeVisible();

  await page.getByRole("button", { name: "Book tid" }).click();
  await page.getByLabel("Booking start").fill("2026-09-15T08:00");
  await page.getByLabel("Booking slut").fill("2026-09-15T12:00");
  await page.getByText("Manuelt bekræftet aftale").click();
  await page.getByRole("button", { name: "Gem booking" }).click();
  await page.goto(taskUrl);
  await page.getByLabel("Værkstedsstatus").selectOption("in_progress");
  await page.getByRole("button", { name: "Gem opgave" }).click();
  await expect(page.locator(".workshop-status")).toHaveText("I gang");
  await page.getByLabel("Værkstedsstatus").selectOption("completed");
  await page.getByLabel("Beskrivelse af udført arbejde").fill("Årsservice udført og funktionstestet.");
  await page.getByLabel("Problem løst").selectOption("yes");
  await page.getByLabel("Anvendelighed efter arbejde").selectOption("usable");
  await expect(page.getByLabel("Arbejdstype")).toHaveValue("service");
  await page.getByLabel("Servicepostens titel").fill("Browsertest · årsservice udført");
  await page.getByLabel("Service målerstand").fill("98220");
  await page.getByLabel("Øvrig omkostning").fill("1250");
  await page.getByRole("button", { name: "Gem opgave" }).click();
  await expect(page.locator(".workshop-status")).toHaveText("Afsluttet");

  await page.getByRole("button", { name: "Åbn sagsmappe" }).click();
  const statusStrip = page.locator(".case-status-strip");
  await expect(statusStrip.getByText("Afventer fakturaafklaring", { exact: true })).toBeVisible();
  await expect(statusStrip.getByText("Åben", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Åbn enhedsprofil" }).click();
  await page.getByRole("tab", { name: "Servicebog" }).click();
  await expect(page.getByText("Browsertest · årsservice udført")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Browsertest · årsservice udført")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Service er læsbar ved 1366 og mobil uden dokumentoverløb", async ({ page }) => {
  const errors = browserErrors(page);
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/service");
    await expect(page.getByRole("heading", { name: "Service og compliance" })).toBeVisible();
    const dimensions = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
    expect(dimensions.scroll).toBe(dimensions.inner);
    if (viewport.width === 390) await page.screenshot({ path: "artifacts/fleet-v2-service-mobile-390x844.png", fullPage: false });
  }
  expect(errors).toEqual([]);
});

test("automatisk servicevarsel genbruges fra indberetning til værkstedsopgave uden mail eller dubletter", async ({ page }) => {
  const errors = browserErrors(page);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/service");
  await expect(page.getByRole("heading", { name: "Service og compliance" })).toBeVisible();

  const serviceRow = page.locator(".service-requirement-row").filter({ hasText: "Årligt serviceeftersyn" });
  await expect(serviceRow.getByText("Automatisk varslet")).toBeVisible();
  await expect(serviceRow.getByText(/ikke sendt/)).toBeVisible();
  await page.screenshot({ path: "artifacts/fleet-v2-service-plans-1672x941.png", fullPage: false });

  await serviceRow.getByRole("button", { name: "Indberetning" }).click();
  await expect(page.getByRole("heading", { name: "Indberetninger og triage" })).toBeVisible();
  await expect(page.getByText("Automatisk oprettet fra Service", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: "artifacts/fleet-v2-automatic-service-report-1672x941.png", fullPage: false });

  await page.goto("/service");
  const reopenedRow = page.locator(".service-requirement-row").filter({ hasText: "Årligt serviceeftersyn" });
  await reopenedRow.getByRole("button", { name: "Planlæg" }).click();
  await page.getByRole("button", { name: "Opret sag og opgave" }).click();
  await expect(page.getByRole("heading", { name: "Årligt serviceeftersyn", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enhed og oprindelig indberetning" })).toBeVisible();

  await page.goto("/service");
  await page.getByRole("button", { name: "Serviceautomatik" }).click();
  await expect(page.getByText("Automatisk mail · betalt tilvalg")).toBeVisible();
  await expect(page.getByText(/sender denne prototype aldrig mail/)).toBeVisible();
  await page.getByRole("button", { name: "Kør varslingskontrol" }).click();
  await expect(page.getByText(/Eksisterende forekomster blev ikke duplikeret/)).toBeVisible();
  expect(errors).toEqual([]);
});

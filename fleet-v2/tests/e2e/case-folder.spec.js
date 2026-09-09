import { expect, test } from "@playwright/test";

const browserErrors = (page) => { const errors = []; page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); }); page.on("pageerror", (error) => errors.push(error.message)); return errors; };

test("skadesformular, værkstedsmail og sagsmappe deler samme lokale sag", async ({ page }) => {
  const errors = browserErrors(page);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/indberetninger/ny");
  await page.getByRole("button", { name: /NB-003/ }).click();
  await page.getByRole("button", { name: /Fortsæt/ }).click();
  await page.getByRole("button", { name: /Skade/ }).click();
  await page.getByLabel("Kategori").fill("Karrosseri");
  await page.getByLabel("Titel").fill("Skade på venstre sidespejl");
  await page.getByLabel("Beskrivelse", { exact: true }).fill("Venstre sidespejl blev beskadiget ved lav hastighed på terminalen.");
  await page.getByLabel("Hændelsesdato og tidspunkt").fill("2026-09-07T08:25");
  await page.getByLabel("Hændelsessted").fill("KLT Terminal, København");
  await page.getByLabel("Skadetype").fill("Kontakt med port");
  await page.getByRole("checkbox", { name: "Venstre side", exact: true }).check();
  await page.getByRole("group", { name: "Modpart involveret?" }).getByLabel("Nej").check();
  await page.getByRole("group", { name: "Vidner?" }).getByLabel("Ja").check();
  await page.getByRole("textbox", { name: "Vidners kontaktoplysninger", exact: true }).fill("Demo-vidne, oplysninger kan suppleres");
  await page.screenshot({ path: "artifacts/fleet-v2-damage-report-1672x941.png", fullPage: false });
  await page.getByRole("button", { name: "Gem kladde" }).click();
  await expect(page.getByText(/Kladde gemt lokalt/)).toBeVisible();

  await page.goto("/sager/case-demo-003");
  await expect(page.getByRole("heading", { name: "VYR-2025-00003" })).toBeVisible();
  await page.screenshot({ path: "artifacts/fleet-v2-case-folder-1672x941.png", fullPage: false });
  await page.getByRole("button", { name: /Tildel værksted/ }).click();
  await expect(page.getByRole("heading", { name: "Tildel værksted og klargør mail" })).toBeVisible();
  await page.getByRole("button", { name: "Bestil arbejde" }).click();
  await expect(page.getByLabel("Mailemne")).toHaveValue(/VYR-2025-00003/);
  await page.getByRole("button", { name: "Gem mailudkast" }).click();
  await expect(page.getByText(/Intet er sendt/)).toBeVisible();
  await page.screenshot({ path: "artifacts/fleet-v2-workshop-assignment-1672x941.png", fullPage: false });
  expect(errors).toEqual([]);
});

test("skadesformular og sagsmappe er brugbare på mobil uden vandret overløb", async ({ page }) => {
  const errors = browserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/indberetninger/ny");
  await page.getByRole("button", { name: /SC-104/ }).click();
  await page.getByRole("button", { name: /Fortsæt/ }).click();
  await page.getByRole("button", { name: /Skade/ }).click();
  await expect(page.getByRole("heading", { name: "Hændelsesoplysninger" })).toBeVisible();
  await page.screenshot({ path: "artifacts/fleet-v2-damage-report-mobile-390x844.png", fullPage: false });
  let dimensions = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBe(dimensions.inner);
  await page.goto("/sager/case-demo-001");
  await expect(page.getByRole("heading", { name: "VYR-2025-00001" })).toBeVisible();
  dimensions = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBe(dimensions.inner);
  expect(errors).toEqual([]);
});

test("sagslukning kræver bekræftelse og begrundelse uden faktura", async ({ page }) => {
  const errors = browserErrors(page);
  await page.goto("/sager/case-demo-001");
  await page.getByText("Luk uden faktura").click();
  await page.getByLabel("Begrundelse for lukning uden faktura").fill("Intern udbedring; ingen ekstern faktura forventes.");
  await page.getByText("Jeg bekræfter, at sagen kan lukkes").click();
  await page.getByRole("button", { name: "Luk sag" }).click();
  await expect(page.getByText(/Sagen er lukket/)).toBeVisible();
  await page.getByRole("textbox", { name: "Begrundelse for genåbning", exact: true }).fill("Ny dokumentation modtaget");
  await page.getByRole("button", { name: "Genåbn sag" }).click();
  await expect(page.getByText(/Sagen er genåbnet/)).toBeVisible();
  expect(errors).toEqual([]);
});

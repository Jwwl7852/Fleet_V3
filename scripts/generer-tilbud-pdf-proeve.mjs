/* Isoleret PDF-fixture. Skriver aldrig til Firebase og bruger ingen officielle priser. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { genererTilbudsPdf } from "../functions/tilbud-pdf.js";
import { validerTilbud } from "../src/fleet/ejer-tilbud-regler.js";

const valideret = validerTilbud({
  virksomhedId: "fixture-kunde", kontaktNavn: "Testmodtager",
  kontaktEmail: "test@example.invalid", udstedelsesdato: "2026-09-10",
  gyldigTil: "2026-10-10", valuta: "DKK", generelRabatBps: 500,
  introRabatBps: 1000, introMaaneder: 3, bindingMaaneder: 3,
  betalingsbetingelser: "14 dage netto", prislisteId: "fixture-prisliste-v1",
  forudsaetninger: "Dette dokument er en isoleret layoutprøve med eksempelpriser og er ikke et officielt Veyro-tilbud.",
  linjer: [
    { id: "platform", art: "grundplatform", navn: "Veyro grundplatform", enhed: "måned", fakturering: "maanedlig", antal: 1000, normalprisOere: 500000, aftaltPrisOere: null, linjerabatBps: 0, momssats: 25 },
    { id: "modul", art: "modul", navn: "Fleet", modulId: "flaade", enhed: "måned", fakturering: "maanedlig", antal: 1000, normalprisOere: 200000, aftaltPrisOere: null, linjerabatBps: 0, momssats: 25 },
    { id: "hardware", art: "enhed", navn: "Testhardware", enhed: "stk.", fakturering: "engang", antal: 5000, normalprisOere: 90000, aftaltPrisOere: null, linjerabatBps: 1000, momssats: 25 },
  ],
});
if (Object.keys(valideret.fejl).length) throw new Error(JSON.stringify(valideret.fejl));
const tilbud = { id: "fixture", nummer: "T-TEST-0001", virksomhedId: "fixture-kunde" };
const versionPost = { version: 1, snapshot: { ...valideret.post, beregning: valideret.beregning }, udstedtMs: Date.now() };
const ud = resolve("output", "pdf", "veyro-tilbud-layoutproeve.pdf");
await mkdir(resolve("output", "pdf"), { recursive: true });
await writeFile(ud, await genererTilbudsPdf({ tilbud, versionPost, virksomhed: { stamdata: { navn: "Eksempelkunde A/S" } } }));
console.log(ud);

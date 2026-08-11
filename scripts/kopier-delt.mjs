/* scripts/kopier-delt.mjs
 * Kopierer den delte politik ind i functions/delt/.
 *
 * ⚠ HVORFOR EN KOPI OG IKKE EN IMPORT. Firebase deployer kun `functions/`-
 * mappen. En import op gennem træet (`../src/fleet/audit-regler.js`) virker
 * lokalt og fejler i skyen — og den fejler ved DEPLOY, ikke ved test, altså
 * på det dårligst mulige tidspunkt.
 *
 * ⚠ OG DERFOR ER KOPIEN FARLIG. To kopier der driver fra hinanden er den
 * fejl dette repo bliver ved med at betale for: Bil 104 med to nummerplader,
 * to demo-datasæt, to divisionsfiltre. Her ville driften betyde at klienten
 * filtrerer mod én allowliste og serveren mod en anden — og serveren vinder
 * i tavshed.
 *
 * Derfor to ting: filen kopieres MEKANISK (den redigeres aldrig i hånden), og
 * test/functions-delt.test.mjs fejler hvis de to ikke er byte-identiske.
 *
 * Koer: npm run delt:kopier   (kaldes også af regler:udrul og funktioner:udrul)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROD = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Filer der skal være ens i src/fleet og functions/delt. */
/* ⚠ KUN IMPORTFRIE FILER KAN STÅ HER. En kopi der importerer noget, ville
   trække halve appen med ind i functions/ — og fejle ved DEPLOY, ikke ved
   test. Alle fire er skrevet importfri med vilje; det er ikke et tilfælde
   man kan regne med holder, så tilføj ikke en femte uden at tjekke. */
export const DELTE_FILER = [
  "audit-regler.js", "permissions.js", "moduler.js", "abonnement.js",
];

export const kildeSti = (navn) => join(ROD, "src", "fleet", navn);
export const kopiSti = (navn) => join(ROD, "functions", "delt", navn);

/* Hovedet navngiver SIN EGEN kilde. Stod der ét fast filnavn, ville den næste
   delte fil bære en henvisning til en anden — og den der læser den, ville
   rette i det forkerte sted. */
const advarsel = (navn) =>
  "/* ⚠ KOPI — REDIGÉR IKKE HER.\n" +
  ` * Kilden er src/fleet/${navn}. Filen lægges af\n` +
  " * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.\n" +
  " * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.\n" +
  " */\n";

/** Selve kopien, uden advarselshovedet — det er dét der sammenlignes. */
export function kropAf(tekst) {
  return tekst.startsWith("/* ⚠ KOPI")
    ? tekst.slice(tekst.indexOf("*/\n") + 3)
    : tekst;
}

export function kopier() {
  const maalmappe = join(ROD, "functions", "delt");
  if (!existsSync(maalmappe)) mkdirSync(maalmappe, { recursive: true });

  const gjort = [];
  for (const navn of DELTE_FILER) {
    const kilde = readFileSync(kildeSti(navn), "utf8");
    writeFileSync(kopiSti(navn), advarsel(navn) + kilde, "utf8");
    gjort.push(navn);
  }
  return gjort;
}

/* Kun når scriptet køres direkte — så testen kan importere uden at skrive. */
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const gjort = kopier();
  console.log(`Kopieret til functions/delt/: ${gjort.join(", ")}`);
}

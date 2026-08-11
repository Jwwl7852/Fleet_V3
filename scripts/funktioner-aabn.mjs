/* scripts/funktioner-aabn.mjs
 * Giver de udrullede callable-funktioner den invoker-binding de kraever.
 *
 * ---------------------------------------------------------------------------
 * ⚠ HVORFOR DET HER SCRIPT FINDES
 *
 * En 2. generations Cloud Function ER en Cloud Run-tjeneste, og en
 * Run-tjeneste er lukket som udgangspunkt. Firebase saetter normalt
 * `allUsers` som invoker ved udrulning, men det sker ikke altid — og naar det
 * ikke sker, svarer funktionen 403 med en HTML-side FOER den overhovedet
 * koeres. Fejlen ligner en adgangsfejl i koden og er det ikke.
 *
 * Det skete praecis her: `audit` fik bindingen, og de tre
 * brugerfunktioner gjorde ikke. Samme udrulning, samme kommando.
 *
 * ---------------------------------------------------------------------------
 * ⚠ "ALLUSERS" ER IKKE EN AABEN DOER
 *
 * Det lyder vaerre end det er, og det er vaerd at forstaa foer nogen bliver
 * bange for det: en callable funktion laver SIN EGEN autentificering. Firebase
 * sender brugerens ID-token i Authorization-headeren, og funktionen verificerer
 * det. Uden bindingen ville Google afvise kaldet foer tokenet blev laest — og
 * saa kunne INGEN bruger kalde den, heller ikke en gyldig.
 *
 * Beskyttelsen ligger altsaa i funktionen (kraevBrugeradmin), ikke i
 * Run-laget. Fjerner man bindingen, faar man ikke mere sikkerhed — man faar en
 * funktion der ikke virker.
 *
 * Koer: npm run funktioner:aabn
 */
import { readFileSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { NOEGLEFIL, tjekProjekt, laesNoegle } from "./provisioner-dev.mjs";

const REGION = "europe-west1";
const ROD = join(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const noegle = laesNoegle();
  /* Samme spaerring som provisioneren: aldrig produktion ved et uheld. */
  tjekProjekt(noegle.project_id);

  const { initializeApp, cert } = await import("firebase-admin/app");
  const app = initializeApp({ credential: cert(noegle) });
  const { access_token: token } = await app.options.credential.getAccessToken();

  const base = `https://run.googleapis.com/v2/projects/${noegle.project_id}/locations/${REGION}`;

  const liste = await fetch(`${base}/services`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());

  if (liste.error) {
    /* ⚠ TJENESTEKONTOEN HAR IKKE RETTIGHEDEN, og det er den normale
       tilstand: Firebase Admin SDK-kontoen kan skrive data og saette claims,
       men ikke aendre IAM. Det kraever DIN konto.

       Scriptet siger derfor hvad du skal goere frem for kun at fejle. En
       fejlbesked der ikke fortaeller hvad naeste skridt er, koster mere tid
       end den sparer. */
    throw new Error(
      `Tjenestekontoen maa ikke aendre IAM (${liste.error.message.split(":")[0]}).\n\n` +
      `  ══ GOER DET ÉN GANG, SAA GOER SCRIPTET DET HERFRA ══\n\n` +
      `  Kontoen mangler PRAECIS TRE permissions. Giv den dem, og du skal\n` +
      `  aldrig klikke en funktion aaben igen:\n\n` +
      `    run.services.list\n` +
      `    run.services.getIamPolicy\n` +
      `    run.services.setIamPolicy\n\n` +
      `  ⚠ IKKE "Cloud Run Admin". Den rolle kan ogsaa UDRULLE og SLETTE\n` +
      `  tjenester, og den kan aendre hvilken servicekonto de koerer som — og\n` +
      `  dermed give sig selv mere. De tre ovenfor kan kun aabne og lukke\n` +
      `  doeren. Det er samme skel som mellem en rolle og en permission:\n` +
      `  spoerg hvad handlingen kraever, ikke hvem kontoen er.\n\n` +
      `    console.cloud.google.com/iam-admin/roles?project=${noegle.project_id}\n` +
      `    → CREATE ROLE → tilfoej de tre → gem som fx "Invoker-aabner"\n` +
      `    → console.cloud.google.com/iam-admin/iam → find\n` +
      `      ${noegle.client_email}\n` +
      `      → Edit → ADD ROLE → Invoker-aabner → Save\n\n` +
      `  ══ INDTIL DA: én gang pr. NY funktion ══\n\n` +
      `    console.cloud.google.com/run?project=${noegle.project_id}\n` +
      `    ⚠ Klik "Cloud Run" i VENSTRE MENU. Overview-sidens felt hedder\n` +
      `      "Most used resources" og viser ikke dem alle — en funktion der\n` +
      `      ikke er kaldt et stykke tid, falder ud af listen og ser slettet ud.\n` +
      `    → vaelg tjenesten → Security → Authentication\n` +
      `    → "Allow public access" (foer: "Allow unauthenticated invocations")\n\n` +
      `  ⚠ SPRING maaldagligt OVER. Den udloeses af Cloud Scheduler med sin\n` +
      `  egen servicekonto og har ingen brug for offentlig adgang.\n\n` +
      `  Eller med gcloud, hvis du har den:\n\n` +
      `    gcloud run services add-iam-policy-binding <navn> \\\n` +
      `      --region=${REGION} --project=${noegle.project_id} \\\n` +
      `      --member=allUsers --role=roles/run.invoker\n\n` +
      `  ⚠ "allUsers" er ikke en aaben doer: en callable funktion laver sin\n` +
      `  EGEN autentificering af brugerens ID-token. Uden bindingen afviser\n` +
      `  Google kaldet FOER tokenet laeses — og saa kan ingen bruger kalde\n` +
      `  den, heller ikke en gyldig. Se noten i toppen af scriptet.`
    );
  }
  /**
   * ⚠ PLANLAGTE FUNKTIONER MAA IKKE AABNES.
   *
   * `maaldagligt` udloeses af Cloud Scheduler med sin egen servicekonto. Gav
   * vi den allUsers, ville enhver paa internettet kunne udloese en maaling —
   * og en maaling der kan udloeses udefra, kan skrives paa den forkerte dato.
   *
   * Listen UDLEDES af functions/index.js frem for at staa skrevet her. Et
   * navn i en konstant ville blive glemt ved den naeste planlagte funktion,
   * og den ville saa blive aabnet uden at nogen opdagede det.
   */
  const planlagte = new Set(
    [...readFileSync(join(ROD, "functions", "index.js"), "utf8")
      .matchAll(/export const (\w+) = onSchedule/g)].map((m) => m[1])
  );

  const tjenester = (liste.services || []).map((s) => s.name)
    .filter((n) => {
      const kort = n.split("/").pop();
      if (!planlagte.has(kort)) return true;
      console.log(`  – ${kort.padEnd(16)} sprunget over (planlagt, ikke callable)`);
      return false;
    });
  if (!tjenester.length) {
    console.log("Ingen Cloud Run-tjenester i " + REGION + ". Er funktionerne udrullet?");
    return;
  }

  for (const navn of tjenester) {
    const kort = navn.split("/").pop();
    const svar = await fetch(`https://run.googleapis.com/v2/${navn}:setIamPolicy`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        policy: { bindings: [{ role: "roles/run.invoker", members: ["allUsers"] }] },
      }),
    });
    const krop = await svar.json();
    console.log(
      `  ${kort.padEnd(16)} ${svar.ok ? "aaben for kald" : `FEJLEDE: ${krop.error?.message || svar.status}`}`
    );
  }

  console.log(
    "\nFaerdig. Funktionerne autentificerer selv — se noten i toppen af scriptet."
  );
  await app.delete();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`\n${e.message}\n`);
    process.exit(1);
  });
}

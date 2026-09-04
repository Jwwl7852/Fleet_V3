/* scripts/opret-kunde.mjs
 * Opretter en TOM kunde: tenant, virksomhed, moduler og én administrator.
 *
 *   npm run kunde:opret -- --id vognmandX --navn "Vognmand X ApS" \
 *                          --cvr 12345678 --moduler flaade,facility
 *
 * ---------------------------------------------------------------------------
 * ⚠ DEN SEEDER INGEN DEMO-DATA. Det er hele pointen. Kunden skal se sit eget
 * system tomt, taste den første bil ind, og opdage hvad tomme tilstande
 * faktisk siger. Demo-data er provisioner-dev.mjs' opgave, og de to må ikke
 * blandes: en kunde der får DEMO Transports fjorten biler ved oprettelsen,
 * skal slette dem manuelt — og han sletter aldrig dem alle.
 *
 * ---------------------------------------------------------------------------
 * ⚠ SPÆRRINGERNE ER IKKE KOPIERET, DE ER IMPORTERET.
 *
 * Nøglefilen skal være gitignoreret, og projektet må ikke være produktion.
 * Havde jeg skrevet dem af, ville det være to steder at rette — og den ene
 * ville blive glemt. Det er præcis den fejl repoet bliver ved med at betale
 * for. De kommer fra provisioner-dev.mjs, hvor de blev skrevet én gang.
 *
 * ---------------------------------------------------------------------------
 * ⚠ --giv-udbyder GIVER ADGANG PÅ TVÆRS AF ALLE KUNDER.
 *
 * Claim'et rører ikke kundedata — det giver kun kundeindekset,
 * virksomhedsnavnet og modullisten (se firebase.rules.json). Men det er
 * stadig den ANDEN krydsning af tenant-grænsen, og beslutning 24 tillod den
 * første én gang med vilje. Flaget står derfor for sig, kræver adressen
 * skrevet ud, og skriver hvad det gjorde.
 */
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import {
  NOEGLEFIL, tjekProjekt, vurderIgnorering, forklarAuthFejl,
  laesKode, laesNoegle,
} from "./provisioner-dev.mjs";
import { claimsFor } from "../src/fleet/dev-brugere.js";
import { opdaterTilladtEkstraClaim } from "../src/fleet/permissions.js";
import { MODUL, VALGFRIE_MODULER, modulsaet, ukendteModuler } from "../src/fleet/moduler.js";

/* ---- Argumenter -------------------------------------------------------- */

export function laesArgumenter(argv) {
  const ud = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const navn = a.slice(2);
    const naeste = argv[i + 1];
    /* Et flag uden værdi er `true`. --moduler uden liste er derimod en fejl,
       og den fanges i tjekArgumenter(). */
    ud[navn] = naeste && !naeste.startsWith("--") ? naeste : true;
    if (ud[navn] !== true) i++;
  }
  return ud;
}

/**
 * ⚠ TENANT-ID'ET BLIVER EN DATABASENØGLE OG STÅR I HVERT ENESTE CLAIM.
 *
 * RTDB forbyder `.`, `#`, `$`, `[`, `]` og `/` i en nøgle, og et id med
 * mellemrum eller æøå er en fejl der først viser sig når nogen skal skrive
 * det i en URL. Det kan ikke ændres bagefter: reglerne sammenligner
 * `auth.token.tenant === $tenantId`, så et nyt id ville gøre alle
 * eksisterende data utilgængelige for alle brugere.
 */
const ID_MOENSTER = /^[a-z][a-z0-9-]{2,39}$/;

/** CVR er otte cifre. Valgfrit — men er det sat, skal det være rigtigt. */
const CVR_MOENSTER = /^\d{8}$/;

export function tjekArgumenter(a) {
  const fejl = [];

  if (!a.id || a.id === true) fejl.push("--id mangler.");
  else if (!ID_MOENSTER.test(a.id)) {
    fejl.push(
      `--id "${a.id}" duer ikke. Små bogstaver, tal og bindestreg, 3-40 tegn, ` +
      `og det skal starte med et bogstav. Id'et bliver en databasenøgle og ` +
      `står i hvert claim — det kan IKKE ændres bagefter.`
    );
  }

  if (!a.navn || a.navn === true) fejl.push("--navn mangler.");
  else if (String(a.navn).length > 80) fejl.push("--navn må højst være 80 tegn.");

  if (a.cvr && a.cvr !== true && !CVR_MOENSTER.test(String(a.cvr))) {
    fejl.push(`--cvr "${a.cvr}" er ikke otte cifre.`);
  }

  const valgte = a.moduler && a.moduler !== true ? String(a.moduler).split(",").map((m) => m.trim()).filter(Boolean) : [];
  const ukendte = ukendteModuler(valgte);
  if (ukendte.length) {
    fejl.push(
      `Ukendte moduler: ${ukendte.join(", ")}. Vælg blandt: ${VALGFRIE_MODULER.join(", ")}.`
    );
  }
  if (a.moduler === true) fejl.push("--moduler mangler en liste, fx --moduler flaade,facility.");

  if (a["giv-udbyder"] === true) {
    fejl.push("--giv-udbyder mangler en mailadresse.");
  }

  return { fejl, valgte };
}

/* ---- Selve arbejdet ---------------------------------------------------- */

async function main() {
  const a = laesArgumenter(process.argv.slice(2));
  const { fejl, valgte } = tjekArgumenter(a);
  if (fejl.length) {
    throw new Error(
      `${fejl.join("\n  ")}\n\n` +
      `  Brug: npm run kunde:opret -- --id vognmandx --navn "Vognmand X ApS" \\\n` +
      `          --cvr 12345678 --moduler ${VALGFRIE_MODULER.slice(0, 3).join(",")}\n\n` +
      `  Moduler der kan vælges:\n` +
      VALGFRIE_MODULER.map((m) => `    ${m.padEnd(12)} ${MODUL[m].hvad}`).join("\n")
    );
  }

  /* Samme rækkefølge som provisioneren: begge spærringer skal have svaret,
     før der oprettes en bruger eller skrives en byte. */
  const ignorering = vurderIgnorering(
    spawnSync("git", ["check-ignore", "-q", NOEGLEFIL], { stdio: "ignore" }).status ?? 128
  );
  if (!ignorering.ok) throw new Error(ignorering.besked);
  if (ignorering.advarsel) console.warn(`  ! ${ignorering.advarsel}\n`);

  const noegle = laesNoegle();
  tjekProjekt(noegle.project_id);
  const kode = laesKode();

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  const { getDatabase } = await import("firebase-admin/database");

  const app = initializeApp({
    credential: cert(noegle),
    databaseURL: `https://${noegle.project_id}-default-rtdb.europe-west1.firebasedatabase.app`,
  });
  const auth = getAuth(app);
  const db = getDatabase(app);

  const id = a.id;
  const moduler = modulsaet(valgte);

  /* ⚠ OVERSKRIVER IKKE. En eksisterende tenant har data og brugere, og et
     "opret" der stille nulstillede virksomhedsnavnet ville være en meget
     dyr tastefejl. --genskriv findes, men skal skrives. */
  const findes = (await db.ref(`tenants/${id}/_findes`).once("value")).exists();
  if (findes && !a.genskriv) {
    throw new Error(
      `Tenant "${id}" findes allerede. Kør med --genskriv hvis du VIL overskrive ` +
      `virksomhedsnavn og moduler. Data og brugere røres ikke.`
    );
  }

  console.log(`Opretter kunde "${id}" i ${noegle.project_id}.\n`);

  /* 1. Markøren først. Uden den afviser hver eneste regel alt — også
        skrivningerne herunder, hvis de gik gennem reglerne. */
  await db.ref(`tenants/${id}/_findes`).set(true);
  console.log("  _findes            sat");

  /* 2. Virksomheden. Kunden læser sit eget navn i sidebaren; udbyderen
        læser det for at kunne vise kundelisten. ÉT sted — ikke kopieret
        ind i udbyderindekset, hvor de to kunne drive fra hinanden. */
  const virksomhed = { navn: String(a.navn), oprettetMs: Date.now() };
  if (a.cvr && a.cvr !== true) virksomhed.cvr = String(a.cvr);
  await db.ref(`tenants/${id}/virksomhed`).set(virksomhed);
  console.log(`  virksomhed         ${virksomhed.navn}${virksomhed.cvr ? ` · CVR ${virksomhed.cvr}` : ""}`);

  /* 3. Modulerne. De obligatoriske kommer altid med — et system uden
        forside er ikke et system. */
  await db.ref(`tenants/${id}/moduler`).set(moduler);
  console.log(`  moduler            ${Object.keys(moduler).join(", ")}`);

  /* 4. Udbyderindekset. Kun hvilke tenants der findes — ingen kundedata. */
  await db.ref(`udbyder/kunder/${id}`).set({ oprettetMs: Date.now(), status: "aktiv" });
  console.log("  udbyder/kunder     indekseret");

  /* 5. Én administrator. ⚠ ADRESSEN ER IKKE ET RIGTIGT DOMÆNE — kontoen
        skal ikke kunne modtage post i dev. Claim'et kommer fra claimsFor(),
        præcis samme vej som de seks DEV-brugere: ingen bagdør, og ingen
        adgang der kommer et andet sted fra end alle andres. */
  const mail = a.mail && a.mail !== true ? String(a.mail) : `admin@${id}.dev.fleetcontrol.invalid`;
  let bruger;
  try {
    bruger = await auth.getUserByEmail(mail);
    await auth.updateUser(bruger.uid, { password: kode, displayName: `Admin ${a.navn}` });
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
    bruger = await auth.createUser({ email: mail, password: kode, displayName: `Admin ${a.navn}` });
  }
  await auth.setCustomUserClaims(bruger.uid, claimsFor("admin", id));
  /* Uden den beholder en allerede indlogget session sine GAMLE claims. */
  await auth.revokeRefreshTokens(bruger.uid);
  console.log(`  administrator      ${mail}`);

  /* 6. Udbyderadgang — kun hvis der udtrykkeligt blev bedt om det. */
  if (a["giv-udbyder"]) {
    const udbyderMail = String(a["giv-udbyder"]);
    const u = await auth.getUserByEmail(udbyderMail);
    /* ⚠ CLAIM'ET LÆGGES OVEN PÅ DE EKSISTERENDE. Overskrev vi dem, ville
       kontoen miste sin tenant og sine perms — og en ejer der lige har fået
       udbyderadgang ville være låst ude af sin egen tenant. */
    const nu = (await auth.getUser(u.uid)).customClaims || {};
    await auth.setCustomUserClaims(u.uid, opdaterTilladtEkstraClaim(nu, "udbyder", true));
    await auth.revokeRefreshTokens(u.uid);
    console.log(`\n  ⚠ udbyderadgang    ${udbyderMail}`);
    console.log("    Claim'et giver kundeindekset, virksomhedsnavne og modullister");
    console.log("    for ALLE kunder — men ingen kundedata. Se firebase.rules.json.");
  }

  console.log(`\nFærdig. Ingen demo-data er seedet — kunden er tom.`);
  console.log(`Log ind som ${mail} for at se den.`);
  await app.delete();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    const forklaring = forklarAuthFejl(e?.code);
    console.error(`\n${forklaring ? `AFBRUDT: ${forklaring}` : e.message}\n`);
    process.exit(1);
  });
}

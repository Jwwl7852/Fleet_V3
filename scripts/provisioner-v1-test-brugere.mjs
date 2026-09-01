/* scripts/provisioner-v1-test-brugere.mjs
 * Opretter de resterende fem rollebrugere for tenanten "v1-test".
 *
 * ⚠ HVORFOR DEN IKKE BARE ER `provisioner-dev.mjs --tenant=v1-test`.
 * Den funktion opretter KUN brugere når tenanten er DEV_TENANT ("demo") —
 * med vilje, se dens eget hoved: "en kundes tenant skal ikke pludselig have
 * seks konti med kendte adgangskoder, fordi nogen ville se data på en
 * skærm." v1-test ER ikke en kunde — det er vores eget interne testselskab,
 * og her SKAL der være seks kendte konti, ligesom i demo. Men den guard
 * beskytter en ægte kunde mod præcis den fejl, og den ændres ikke for at
 * gøre plads til dette script. I stedet genbruges de underliggende,
 * allerede eksporterede byggeklodser DIREKTE — samme dem opret-kunde.mjs
 * selv importerer i stedet for at kopiere: `tjekProjekt`, `vurderIgnorering`,
 * `laesNoegle`, `laesKode` og `claimsFor()`. Guarden i provisioner-dev.mjs
 * rørt ikke; den bruges bare ikke her.
 *
 * ⚠ ADMIN FINDES ALLEREDE. `kunde:opret` laver tenanten, modulerne og ÉN
 * administrator. De fem her er de resterende roller i ROLLE_PERMS.
 *
 * Kør: node scripts/provisioner-v1-test-brugere.mjs
 */
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import {
  NOEGLEFIL, tjekProjekt, vurderIgnorering, forklarAuthFejl, laesKode, laesNoegle,
} from "./provisioner-dev.mjs";
import { claimsFor, V1T_TENANT, V1T_DOMAENE } from "../src/fleet/dev-brugere.js";
import { ROLLE_PERMS } from "../src/fleet/permissions.js";

/* ⚠ GENEKSPORTERET, IKKE GENSKREVET. De to konstanter kommer fra
   src/fleet/dev-brugere.js — samme fil Brugervaelger.jsx og
   provisioner-v1-test-seed.mjs bruger — så der er ét sted der siger hvad
   v1-tests tenant-id og domæne er. */
export const TENANT = V1T_TENANT;
export { V1T_DOMAENE };

/* Admin er allerede oprettet af `kunde:opret` (admin@v1-test.dev...). De
   resterende fem er ROLLE_PERMS minus admin — udledt, ikke skrevet i
   hånden, af samme grund som DEV_BRUGERE i dev-brugere.js: en ny rolle i
   presettet skal ikke kunne mangle her. */
const NAVN = {
  chauffoer: "V1T Chauffør",
  disponent: "V1T Disponent",
  koordinator: "V1T Koordinator",
  lagermedarbejder: "V1T Lagermedarbejder",
  revisor: "V1T Revisor",
};

/* ⚠ KUN CHAUFFØREN KOBLES TIL EN MEDARBEJDER — samme snit som
   PERSON_FOR_ROLLE i dev-brugere.js. En admin på kontoret er ikke
   nødvendigvis en post i personale; en chauffør skal have et personId for
   at chaufførappen kan vise hans ture. */
const PERSON_FOR_ROLLE = { chauffoer: "vtChauffoer1" };

export const V1T_BRUGERE = Object.keys(ROLLE_PERMS)
  .filter((rolle) => rolle !== "admin")
  .map((rolle) => ({
    rolle,
    email: `${rolle}@${V1T_DOMAENE}`,
    navn: NAVN[rolle] || `V1T ${rolle}`,
    personId: PERSON_FOR_ROLLE[rolle] || null,
  }));

async function main() {
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

  const findes = (await db.ref(`tenants/${TENANT}/_findes`).once("value")).val();
  if (!findes) {
    throw new Error(
      `Tenanten "${TENANT}" findes ikke. Kør npm run kunde:opret først.`
    );
  }

  console.log(`Opretter ${V1T_BRUGERE.length} rollebrugere for tenant "${TENANT}" i ${noegle.project_id}.\n`);

  /* ⚠ ADMIN-INDEKSET MANGLEDE. `kunde:opret` opretter admin-kontoen og dens
     claims, men skriver den ikke ind i tenants/<id>/brugere/<uid> — samme
     indeks de øvrige fem poster her skriver til. Uden posten kan Brugere &
     roller og godkendelsens "Anmoder"-kolonne ikke slå admin-kontoens navn
     op. Det er ikke en fejl i selve claim-udstedelsen — login og adgang
     virker uændret — men et hul i det index alle andre konti fylder ud.
     Rettes her, ikke i opret-kunde.mjs: samme admin-SDK-skrivning som
     scriptet allerede foretager for de fem andre, ingen ny mekanik. */
  const adminMail = `admin@${V1T_DOMAENE}`;
  try {
    const adminBruger = await auth.getUserByEmail(adminMail);
    const findesIIndeks = (await db.ref(`tenants/${TENANT}/brugere/${adminBruger.uid}`).once("value")).exists();
    if (!findesIIndeks) {
      await db.ref(`tenants/${TENANT}/brugere/${adminBruger.uid}`).set({
        email: adminMail, navn: "V1T Administrator", rolle: "admin",
        spaerret: false, opdateretMs: Date.now(),
      });
      console.log(`  ${"admin".padEnd(18)} ${adminMail}  uid=${adminBruger.uid}  (indeks tilføjet)`);
    }
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
    console.warn(`  ! ${adminMail} findes ikke endnu — kør npm run kunde:opret først.`);
  }

  for (const b of V1T_BRUGERE) {
    let bruger;
    try {
      bruger = await auth.getUserByEmail(b.email);
      await auth.updateUser(bruger.uid, { password: kode, displayName: b.navn });
    } catch (e) {
      if (e.code !== "auth/user-not-found") throw e;
      bruger = await auth.createUser({ email: b.email, password: kode, displayName: b.navn });
    }
    await auth.setCustomUserClaims(bruger.uid, claimsFor(b.rolle, TENANT));
    await auth.revokeRefreshTokens(bruger.uid);

    const personId = b.personId || null;
    await db.ref(`tenants/${TENANT}/brugere/${bruger.uid}`).set({
      email: b.email,
      navn: b.navn,
      rolle: b.rolle,
      spaerret: false,
      opdateretMs: Date.now(),
      ...(personId ? { personId } : {}),
    });
    console.log(`  ${b.rolle.padEnd(18)} ${b.email}${personId ? `  → ${personId}` : ""}  uid=${bruger.uid}`);
  }

  console.log(`\nFærdig. Adgangskoden er den samme VITE_DEV_BRUGER_KODE som DEV-kontiene bruger.`);
  await app.delete();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    const forklaring = forklarAuthFejl(e?.code);
    console.error(`\n${forklaring ? `AFBRUDT: ${forklaring}` : e.message}\n`);
    process.exit(1);
  });
}

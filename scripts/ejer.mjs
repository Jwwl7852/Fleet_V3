/* scripts/ejer.mjs
 * Giver, fjerner og viser ejerskab (`udbyder`-claim'et).
 *
 *   npm run ejer:vis
 *   npm run ejer:giv   -- --mail jwwl@fleetcontrol.dk
 *   npm run ejer:fjern -- --mail jwwl@fleetcontrol.dk
 *
 * ---------------------------------------------------------------------------
 * ⚠ DEN HER KAN IKKE VÆRE EN KNAP I KONSOLLEN — beslutning 35.
 *
 * I er to. Kunne den ene fjerne den andens claim, kunne den ene lukke den
 * anden ude — og adgangen til at rette det var selv ejerskabet. Det er
 * nøjagtig beslutning 31 om igen (rollerne er faste, fordi en admin der
 * fjerner sin egen permission har låst sig ude), bare med højere indsats.
 *
 * Ejerskab kræver derfor en maskine med servicekontonøglen. Det er ikke
 * besværligt nok til at genere jer to gange om året, og det er præcis
 * besværligt nok til at ingen gør det ved et uheld.
 *
 * ---------------------------------------------------------------------------
 * ⚠ EN EJERKONTO HAR INGEN TENANT, OG DET ER HELE POINTEN.
 *
 * `harAdgang` i App.jsx kræver et tenant-claim. En konto uden ét kan derfor
 * ikke nå kundeshellen overhovedet — og reglerne sammenligner
 * `auth.token.tenant === $tenantId`, så den kan ikke læse én eneste kundes
 * data uanset hvad klienten sender. Spærringen er ikke en betingelse i en
 * skærm; den er fraværet af en nøgle.
 *
 * En konto der allerede har en tenant afvises. Eksisterende blandede konti
 * vises fortsat af `ejer:vis`, så de kan migreres bevidst uden at scriptet
 * flytter eller fjerner en virkelig persons adgang automatisk.
 */
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import {
  DEV_PROJEKT, NOEGLEFIL, tjekProjekt, vurderIgnorering, laesNoegle, laesKode,
} from "./provisioner-dev.mjs";
import { laesArgumenter } from "./opret-kunde.mjs";
import { opdaterTilladtEkstraClaim } from "../src/fleet/permissions.js";
import { byggEjerClaims } from "../src/fleet/ejeradgang.js";

const MAIL_MOENSTER = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function tjekArgumenter(a, handling) {
  const fejl = [];
  if (handling !== "vis") {
    if (!a.mail || a.mail === true) fejl.push("--mail mangler.");
    else if (!MAIL_MOENSTER.test(String(a.mail))) fejl.push(`"${a.mail}" er ikke en mailadresse.`);
  }
  return fejl;
}

async function skrivEjerAudit(db, handling, maalUid) {
  const ms = Date.now();
  const dato = new Date(ms);
  const aar = String(dato.getUTCFullYear());
  const maaned = String(dato.getUTCMonth() + 1).padStart(2, "0");
  const ref = db.ref(`udbyder/audit/${aar}/${maaned}`).push();
  await ref.set({
    ms, uid: "service-account", handling, objekt: "ejeridentitet",
    objektId: maalUid, korrelationsId: ref.key,
  });
}

async function main() {
  const handling = process.argv[2];
  if (!["vis", "giv", "fjern"].includes(handling)) {
    throw new Error(
      "Brug: npm run ejer:vis | ejer:giv -- --mail … | ejer:fjern -- --mail …"
    );
  }
  const a = laesArgumenter(process.argv.slice(3));
  const fejl = tjekArgumenter(a, handling);
  if (fejl.length) throw new Error(fejl.join("\n  "));

  const ignorering = vurderIgnorering(
    spawnSync("git", ["check-ignore", "-q", NOEGLEFIL], { stdio: "ignore" }).status ?? 128
  );
  if (!ignorering.ok) throw new Error(ignorering.besked);
  if (ignorering.advarsel) console.warn(`  ! ${ignorering.advarsel}\n`);

  const noegle = laesNoegle();
  tjekProjekt(noegle.project_id);

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  const { getDatabase } = await import("firebase-admin/database");
  const app = initializeApp({
    credential: cert(noegle),
    databaseURL: `https://${DEV_PROJEKT}-default-rtdb.europe-west1.firebasedatabase.app`,
  });
  const auth = getAuth(app);
  const db = getDatabase(app);

  if (handling === "vis") {
    const liste = await auth.listUsers(1000);
    const ejere = liste.users.filter((u) => u.customClaims?.udbyder === true);
    console.log(`\nEjere i ${noegle.project_id}: ${ejere.length}\n`);
    for (const u of ejere) {
      const t = u.customClaims?.tenant;
      console.log(`  ${u.email}`);
      console.log(`    ${t ? `⚠ har OGSÅ tenant "${t}" — altså kundeadgang` : "ren ejerkonto (ingen tenant)"}`);
    }
    if (!ejere.length) console.log("  (ingen)");
    console.log("");
    await app.delete();
    return;
  }

  const mail = String(a.mail);
  let bruger;
  try {
    bruger = await auth.getUserByEmail(mail);
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
    if (handling === "fjern") throw new Error(`${mail} findes ikke.`);
    /* Kontoen oprettes uden kundeautoritet. Det eksplicitte ejerclaim sættes
       først efter den fælles revocationmarkør nedenfor. */
    bruger = await auth.createUser({
      email: mail, password: laesKode(), displayName: `Ejer ${mail}`,
    });
    console.log(`  kontoen blev oprettet med DEV-kodeordet.`);
  }

  const nu = bruger.customClaims || {};
  if (handling === "giv") {
    if (nu.tenant) {
      throw new Error(
        `Kontoen har tenant "${nu.tenant}". Opret en separat ejerkonto; blandet kundeadgang afvises.`,
      );
    }
    /* Revocationmetadata skrives før claimændringen. Et gammelt token er
       dermed lukket i både RTDB-regler og ejer-callables, også hvis næste
       skridt fejler. */
    await auth.revokeRefreshTokens(bruger.uid);
    const efterRevocation = await auth.getUser(bruger.uid);
    const revokeTime = Date.parse(efterRevocation.tokensValidAfterTime || "") / 1000;
    if (!Number.isFinite(revokeTime)) throw new Error("Ugyldigt revocation-tidspunkt fra Firebase Auth.");
    await db.ref(`authRevocations/${bruger.uid}/revokeTime`).set(revokeTime);
    await auth.setCustomUserClaims(bruger.uid, byggEjerClaims(nu));
    console.log(`\n  ${mail} er nu EJER.`);
    await skrivEjerAudit(db, "ejer.giv", bruger.uid);
  } else {
    const uden = opdaterTilladtEkstraClaim(nu, "udbyder", undefined);
    delete uden.ev;
    await auth.revokeRefreshTokens(bruger.uid);
    const efterRevocation = await auth.getUser(bruger.uid);
    const revokeTime = Date.parse(efterRevocation.tokensValidAfterTime || "") / 1000;
    if (!Number.isFinite(revokeTime)) throw new Error("Ugyldigt revocation-tidspunkt fra Firebase Auth.");
    await db.ref(`authRevocations/${bruger.uid}/revokeTime`).set(revokeTime);
    await auth.setCustomUserClaims(bruger.uid, uden);
    console.log(`\n  ${mail} er ikke længere ejer.`);
    if (!uden.tenant) {
      console.log(`  ⚠ Kontoen har hverken tenant eller ejerskab og kan ikke logge ind nogen steder.`);
    }
    await skrivEjerAudit(db, "ejer.fjern", bruger.uid);
  }
  console.log(`  Tokens og applikationsadgang tilbagekaldt — der skal logges ind igen.\n`);

  await app.delete();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`\nAFBRUDT: ${e.message}\n`); process.exit(1); });
}

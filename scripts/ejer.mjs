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
 * Giver man ejerskab til en konto der ALLEREDE har en tenant, beholder den
 * sin kundeadgang. Scriptet siger det højt, men nægter ikke: i dev er det
 * nogle gange det man vil.
 */
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import {
  NOEGLEFIL, tjekProjekt, vurderIgnorering, laesNoegle, laesKode,
} from "./provisioner-dev.mjs";
import { laesArgumenter } from "./opret-kunde.mjs";
import { opdaterTilladtEkstraClaim } from "../src/fleet/permissions.js";

const MAIL_MOENSTER = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function tjekArgumenter(a, handling) {
  const fejl = [];
  if (handling !== "vis") {
    if (!a.mail || a.mail === true) fejl.push("--mail mangler.");
    else if (!MAIL_MOENSTER.test(String(a.mail))) fejl.push(`"${a.mail}" er ikke en mailadresse.`);
  }
  return fejl;
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
  const app = initializeApp({ credential: cert(noegle) });
  const auth = getAuth(app);

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
    /* ⚠ OPRETTES UDEN CLAIMS UD OVER udbyder. Ingen tenant, ingen rolle,
       ingen perms — se noten øverst. */
    bruger = await auth.createUser({
      email: mail, password: laesKode(), displayName: `Ejer ${mail}`,
    });
    console.log(`  kontoen blev oprettet med DEV-kodeordet.`);
  }

  const nu = bruger.customClaims || {};
  if (handling === "giv") {
    /* ⚠ CLAIMS LÆGGES OVEN PÅ. Overskrev vi dem, ville en konto der også er
       kundeadmin miste sin tenant og sine perms — og en ejer der lige har
       fået adgang ville være låst ude af sin egen tenant. */
    await auth.setCustomUserClaims(bruger.uid, opdaterTilladtEkstraClaim(nu, "udbyder", true));
    console.log(`\n  ${mail} er nu EJER.`);
    if (nu.tenant) {
      console.log(`  ⚠ Kontoen har også tenant "${nu.tenant}" og beholder sin kundeadgang.`);
      console.log(`     En ren ejerkonto har ingen tenant — se beslutning 35.`);
    }
  } else {
    const uden = opdaterTilladtEkstraClaim(nu, "udbyder", undefined);
    await auth.setCustomUserClaims(bruger.uid, uden);
    console.log(`\n  ${mail} er ikke længere ejer.`);
    if (!uden.tenant) {
      console.log(`  ⚠ Kontoen har hverken tenant eller ejerskab og kan ikke logge ind nogen steder.`);
    }
  }
  /* Uden den beholder en indlogget session sine GAMLE claims indtil tokenet
     udløber af sig selv — og så ville man tro man havde fjernet en adgang. */
  await auth.revokeRefreshTokens(bruger.uid);
  console.log(`  Tokens tilbagekaldt — der skal logges ind igen.\n`);

  await app.delete();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`\nAFBRUDT: ${e.message}\n`); process.exit(1); });
}

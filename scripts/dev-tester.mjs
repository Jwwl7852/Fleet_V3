/* scripts/dev-tester.mjs
 * Giver, fjerner og viser adgang til den hostede DEV-brugerskifter
 * (`devTester`-claimet, se devBrugerSkift i functions/index.js).
 *
 *   npm run devtester:vis
 *   npm run devtester:giv   -- --mail jwwl@fleetcontrol.dk
 *   npm run devtester:fjern -- --mail jwwl@fleetcontrol.dk
 *
 * ---------------------------------------------------------------------------
 * ⚠ HVORFOR EN EGEN CLAIM OG IKKE `udbyder`.
 *
 * En devTester kan ÉN ting: bede devBrugerSkift om at blive en af v1-tests
 * syv kendte roller. En ejer kan alt det EJERKONSOLLEN kan — oprette og
 * ændre enhver kundes tenant, priser og abonnement. Genbrugte vi `udbyder`
 * til den her, ville en lækket evne til at skifte testbruger også være en
 * lækket evne til at administrere rigtige kunder. To claims, to blast radii.
 *
 * ⚠ SAMME BEGRUNDELSE SOM ejer.mjs FOR AT DET IKKE ER EN KNAP I KONSOLLEN:
 * adgangen til at give og fjerne den her claim skal ikke selv kunne gives
 * fra klienten — den kræver en maskine med servicekontonøglen.
 * ---------------------------------------------------------------------------
 */
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import {
  NOEGLEFIL, tjekProjekt, vurderIgnorering, laesNoegle, laesKode,
} from "./provisioner-dev.mjs";
import { laesArgumenter } from "./opret-kunde.mjs";

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
      "Brug: npm run devtester:vis | devtester:giv -- --mail … | devtester:fjern -- --mail …"
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
  /* ⚠ SAMME SPÆRRING SOM ALT ANDET HER. Kan kun rettes mod DEV — der findes
     ingen tilsvarende funktion i produktion, og claimet betyder ingenting
     der. */
  tjekProjekt(noegle.project_id);

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  const app = initializeApp({ credential: cert(noegle) });
  const auth = getAuth(app);

  if (handling === "vis") {
    const liste = await auth.listUsers(1000);
    const testere = liste.users.filter((u) => u.customClaims?.devTester === true);
    console.log(`\nDEV-testere i ${noegle.project_id}: ${testere.length}\n`);
    for (const u of testere) {
      const t = u.customClaims?.tenant;
      const ejer = u.customClaims?.udbyder === true;
      console.log(`  ${u.email}${ejer ? "  (også ejer)" : ""}${t ? `  (tenant "${t}")` : ""}`);
    }
    if (!testere.length) console.log("  (ingen)");
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
    /* ⚠ OPRETTES UDEN ANDRE CLAIMS. En ny DEV-tester er ikke automatisk
       ejer eller kundeadmin — kun det ene claim han bad om. */
    bruger = await auth.createUser({
      email: mail, password: laesKode(), displayName: `DEV-tester ${mail}`,
    });
    console.log(`  kontoen blev oprettet med DEV-kodeordet.`);
  }

  const nu = bruger.customClaims || {};
  if (handling === "giv") {
    /* ⚠ CLAIMS LÆGGES OVEN PÅ — samme regel som ejer.mjs. Overskrev vi dem,
       ville en konto der også er ejer eller kundeadmin miste den adgang. */
    await auth.setCustomUserClaims(bruger.uid, { ...nu, devTester: true });
    console.log(`\n  ${mail} kan nu bruge den hostede DEV-brugerskifter.`);
  } else {
    const uden = { ...nu };
    delete uden.devTester;
    await auth.setCustomUserClaims(bruger.uid, uden);
    console.log(`\n  ${mail} kan ikke længere bruge den hostede DEV-brugerskifter.`);
  }
  /* Uden den beholder en indlogget session sine GAMLE claims indtil tokenet
     udløber af sig selv. */
  await auth.revokeRefreshTokens(bruger.uid);
  console.log(`  Tokens tilbagekaldt — der skal logges ind igen.\n`);

  await app.delete();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`\nAFBRUDT: ${e.message}\n`); process.exit(1); });
}

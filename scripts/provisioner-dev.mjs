/* scripts/provisioner-dev.mjs
 * Provisionerer DEV: tenant-markør, brugere med claims, og demo-data.
 *
 * ⚠ HVORFOR SCRIPTET FINDES: claims-kæden var helt uprøvet i browseren.
 * Tenant-isolationen hviler på custom JWT claims, og kæden — bruger oprettes
 * → claims sættes → token fornys → reglerne læser dem — var kun afprøvet i
 * emulatoren, hvor man kan minte et token med hvilke claims man vil. Det er
 * nyttigt til reglerne, men det springer netop det led over hvor fejlene
 * sidder. Se beslutning 27.
 *
 * ⚠ REGLERNE KRÆVER tenants/<id>/_findes PÅ HVER ENESTE LÆSNING.
 * Uden markøren afviser hver regel alt, og en indlogget bruger ville se
 * "afvist" på hver eneste skærm. Det er trin 1 af en grund.
 *
 * Kør:
 *   node scripts/provisioner-dev.mjs
 *
 * Kræver en servicekontonøgle til DEV i .serviceaccount-dev.json (gitignored,
 * hentes i Firebase-konsollen under Projektindstillinger → Tjenestekonti) og
 * VITE_DEV_BRUGER_KODE i .env.local.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { DEV_BRUGERE, DEV_TENANT, claimsFor } from "../src/fleet/dev-brugere.js";

import { DEMO_KPI } from "../src/fleet/demo-kpi.js";
import { DEMO_KOERETOEJER } from "../src/fleet/demo-flaade.js";
import { DEMO_PERSONALE, DEMO_KOMPETENCER } from "../src/fleet/demo-personale.js";
import { DEMO_KUNDER } from "../src/fleet/demo-kunder.js";
import { DEMO_FRAVAER, DEMO_FRAVAER_SENSITIVE } from "../src/fleet/demo-fravaer.js";

/* ------------------------------------------------------------------ *
 * Spærringen
 * ------------------------------------------------------------------ */

export const DEV_PROJEKT = "fleetcontrol-dev-1ac1c";
export const PROD_PROJEKT = "fleetcontrol-98e11";

/**
 * ⚠ IKKE KONFIGURERBAR, OG DET ER MENINGEN.
 *
 * Samme begrundelse som loftet i beslutning 24: en spærring der kan hæves af
 * den der rammer den, er ingen spærring. Et seed-script der kan pege på
 * produktion, skriver testdata i rigtige kunders base — og det opdages først
 * når en kunde ringer.
 *
 * Der er derfor hverken et flag, en miljøvariabel eller et --force.
 */
export function tjekProjekt(projektId) {
  if (projektId === DEV_PROJEKT) return;
  if (projektId === PROD_PROJEKT) {
    throw new Error(
      "AFBRUDT: nøglen peger på PRODUKTION (" + PROD_PROJEKT + ").\n" +
      "Scriptet skriver testdata og opretter brugere. Det må aldrig ramme " +
      "rigtige kunders base.\nDer er ingen måde at tvinge det igennem — brug " +
      "en DEV-servicekonto."
    );
  }
  throw new Error(
    `AFBRUDT: ukendt projekt "${projektId}". Scriptet kører kun mod ${DEV_PROJEKT}.`
  );
}

/* ------------------------------------------------------------------ *
 * Hvad der seedes
 * ------------------------------------------------------------------ */

/**
 * Node → datasæt. En tabel, ikke kode pr. node: en ny node er én linje.
 *
 * Kun de noder skærmene FAKTISK læser i dag gennem useListe()/useKpi().
 * De øvrige datasæt i fleet/demo-*.js seedes ikke endnu — et seedet datasæt
 * ingen skærm rører, driver fra sin kilde uden at nogen ser det.
 */
export const SEED = [
  { node: "kpi/gods/current", data: DEMO_KPI.gods, form: "objekt" },
  { node: "kpi/bus/current", data: DEMO_KPI.bus, form: "objekt" },
  { node: "koeretoejer", data: DEMO_KOERETOEJER, form: "liste" },
  { node: "personale", data: DEMO_PERSONALE, form: "liste" },
  { node: "kompetencer", data: DEMO_KOMPETENCER, form: "liste" },
  { node: "kunder", data: DEMO_KUNDER, form: "liste" },
  { node: "fravaer", data: DEMO_FRAVAER, form: "liste" },
  /* Allerede på nodeform — demo-fravaer.js gemmer den bevidst sådan, fordi
     `art` ligger i sensitive/ og ikke på posten. Se filens egen note. */
  { node: "sensitive/fravaer", data: DEMO_FRAVAER_SENSITIVE, form: "objekt" },
];

/**
 * useListe læser rækker som `{ id: barn.key, ...barn.val() }` — id'et kommer
 * fra NØGLEN. Derfor nøgles der på id, og id'et fjernes fra værdien: to
 * kilder til samme felt er præcis den slags der kan nå at blive uenige.
 */
export function somNode(raekker) {
  const ud = {};
  for (const { id, ...resten } of raekker) {
    if (!id) throw new Error("somNode: en række uden id kan ikke nøgles.");
    if (ud[id]) throw new Error(`somNode: id "${id}" optræder to gange.`);
    ud[id] = resten;
  }
  return ud;
}

/* ------------------------------------------------------------------ *
 * Kørslen
 * ------------------------------------------------------------------ */

function laesKode() {
  const kode = process.env.VITE_DEV_BRUGER_KODE || laesFraEnvLocal("VITE_DEV_BRUGER_KODE");
  if (!kode) {
    throw new Error(
      "AFBRUDT: VITE_DEV_BRUGER_KODE mangler.\n" +
      "Sæt den i .env.local (gitignored). Alle seks DEV-konti deler den, og " +
      "brugervælgeren bruger den til at skifte session."
    );
  }
  if (kode.length < 8) throw new Error("AFBRUDT: VITE_DEV_BRUGER_KODE skal være mindst 8 tegn.");
  return kode;
}

function laesFraEnvLocal(navn) {
  try {
    const linje = readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${navn}=`));
    return linje ? linje.slice(navn.length + 1).trim() : null;
  } catch {
    return null;
  }
}

function laesNoegle() {
  try {
    return JSON.parse(readFileSync(".serviceaccount-dev.json", "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") {
      throw new Error(
        "AFBRUDT: .serviceaccount-dev.json mangler.\n" +
        "Hent den i Firebase-konsollen for fleetcontrol-dev-1ac1c under\n" +
        "Projektindstillinger → Tjenestekonti → Generer ny privat nøgle,\n" +
        "og læg den i projektets rod. Filen er gitignored — den må aldrig committes."
      );
    }
    throw new Error(`AFBRUDT: .serviceaccount-dev.json kunne ikke læses som JSON.\n${e.message}`);
  }
}

async function main() {
  const noegle = laesNoegle();
  tjekProjekt(noegle.project_id);
  const kode = laesKode();

  /* Importeres først her. Så kan tjekProjekt() og somNode() prøves uden at
     firebase-admin overhovedet indlæses. */
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  const { getDatabase } = await import("firebase-admin/database");

  const app = initializeApp({
    credential: cert(noegle),
    databaseURL: `https://${DEV_PROJEKT}-default-rtdb.europe-west1.firebasedatabase.app`,
  });
  const auth = getAuth(app);
  const db = getDatabase(app);

  console.log(`Provisionerer ${noegle.project_id}, tenant "${DEV_TENANT}".\n`);

  /* 1. Tenant-markøren. Uden den afviser hver regel alt. */
  await db.ref(`tenants/${DEV_TENANT}/_findes`).set(true);
  console.log("  _findes            sat");

  /* 2. Brugere og claims. */
  for (const b of DEV_BRUGERE) {
    let bruger;
    try {
      bruger = await auth.getUserByEmail(b.email);
      await auth.updateUser(bruger.uid, { password: kode, displayName: b.navn });
    } catch (e) {
      if (e.code !== "auth/user-not-found") throw e;
      bruger = await auth.createUser({ email: b.email, password: kode, displayName: b.navn });
    }
    await auth.setCustomUserClaims(bruger.uid, claimsFor(b.rolle, DEV_TENANT));

    /* Uden det beholder en allerede indlogget session sine GAMLE claims,
       indtil tokenet udløber af sig selv. Man ville tro man havde ændret
       adgangen, og den gamle ville stadig virke — den værste fejltilstand,
       fordi den ser ud som om den lykkedes. Se ARKITEKTUR om rolleskift. */
    await auth.revokeRefreshTokens(bruger.uid);
    console.log(`  ${b.rolle.padEnd(18)} ${b.email}`);
  }

  /* 3. Demo-data under de noder skærmene faktisk læser. */
  console.log("");
  for (const { node, data, form } of SEED) {
    const nyttelast = form === "liste" ? somNode(data) : data;
    await db.ref(`tenants/${DEV_TENANT}/${node}`).set(nyttelast);
    const antal = form === "liste" ? `${data.length} rækker` : "objekt";
    console.log(`  ${node.padEnd(24)} ${antal}`);
  }

  console.log(`\nFærdig. Log ind med en af adresserne ovenfor.`);
  await app.delete();
}

/* Kun når filen KØRES. Prøverne importerer den for tjekProjekt og somNode,
   og de skal ikke provisionere noget som helst. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`\n${e.message}\n`);
    process.exit(1);
  });
}

/* scripts/provisioner-v1-test-data.mjs
 * Seeder testdata for tenanten "v1-test" — kunder, leverandører, flåde,
 * personale, Facility, Warehouse/Unitbooking, Planning (bookinger/etaper),
 * opgaver, indberetning, fravær, Procure og fakturagrundlag.
 *
 * ⚠ GENBRUGER DE SAMME BYGGEKLODSER SOM provisioner-dev.mjs BRUGER TIL
 * "demo" — somNode()/sammeNode() for nodeformen, reservationerFraEtape() /
 * reservationFraOpgave() / reservationFraFravaer() for reservationerne,
 * forloebstilstand() for bookingens afledte tilstand, og beregnKpi() for
 * kpi/current. Ingen af dem er kopieret — de importeres.
 *
 * ⚠ "uid:<rolle>" ER EN PLADSHOLDER, IKKE ET RIGTIGT uid — samme idé som
 * PLADSHOLDER_ROLLE i provisioner-dev.mjs, bare skrevet direkte i
 * seed-filerne i stedet for i en oversættelsestabel. rigtigtUid() erstatter
 * enhver streng på formen "uid:<rolle>" med den rigtige konto, ét
 * gennemløb, før noget skrives.
 *
 * Kør: node scripts/provisioner-v1-test-data.mjs
 */
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import {
  NOEGLEFIL, tjekProjekt, vurderIgnorering, laesNoegle, somNode,
} from "./provisioner-dev.mjs";
import { V1T_DOMAENE } from "./provisioner-v1-test-brugere.mjs";
import { ROLLE_PERMS } from "../src/fleet/permissions.js";

import { reservationerFraEtape } from "../src/fleet/etaper.js";
import { reservationFraOpgave } from "../src/fleet/opgaver.js";
import { forloebstilstand } from "../src/fleet/booking-state.js";
import { ORDRESERIE, ORDRE_PRAEFIKS } from "../src/fleet/procure.js";
import { beregnKpi } from "../src/fleet/kpi-aggregering.js";

import { V1T_KUNDER } from "./v1-test-data/kunder.mjs";
import { V1T_LEVERANDOERER } from "./v1-test-data/leverandoerer.mjs";
import { V1T_KOERETOEJER } from "./v1-test-data/flaade.mjs";
import { V1T_PERSONALE, V1T_KOMPETENCER } from "./v1-test-data/personale.mjs";
import { V1T_LOKATIONER, V1T_AKTIVER } from "./v1-test-data/facility.mjs";
import {
  V1T_REOLPLADSER, V1T_VARER, V1T_BEHOLDNING, V1T_CARRIERS,
} from "./v1-test-data/lager.mjs";
import {
  V1T_KASSETYPER, V1T_KASSER, V1T_KASSEUDLAAN,
} from "./v1-test-data/unitbooking.mjs";
import { V1T_BOOKINGER, V1T_ETAPER } from "./v1-test-data/booking.mjs";
import { V1T_OPGAVER } from "./v1-test-data/opgaver.mjs";
import {
  V1T_INDBERETNINGER, V1T_INDBERETNINGER_SENSITIVE,
} from "./v1-test-data/indberetninger.mjs";
import { V1T_FRAVAER } from "./v1-test-data/fravaer.mjs";
import { V1T_INDKOEBSBEHOV, V1T_INDKOEBSORDRER } from "./v1-test-data/procure.mjs";
import { V1T_GRUNDLAG } from "./v1-test-data/grundlag.mjs";

const TENANT = "v1-test";

async function main() {
  const ignorering = vurderIgnorering(
    spawnSync("git", ["check-ignore", "-q", NOEGLEFIL], { stdio: "ignore" }).status ?? 128
  );
  if (!ignorering.ok) throw new Error(ignorering.besked);

  const noegle = laesNoegle();
  tjekProjekt(noegle.project_id);

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
  if (!findes) throw new Error(`Tenanten "${TENANT}" findes ikke. Kør npm run kunde:opret først.`);

  console.log(`Seeder testdata for tenant "${TENANT}" i ${noegle.project_id}.\n`);

  /* ---- 1. Rollernes rigtige uid'er — til "uid:<rolle>"-pladsholderne. --- */
  const uidForRolle = {};
  for (const rolle of Object.keys(ROLLE_PERMS)) {
    const mail = `${rolle}@${V1T_DOMAENE}`;
    try {
      uidForRolle[rolle] = (await auth.getUserByEmail(mail)).uid;
    } catch (e) {
      if (e.code !== "auth/user-not-found") throw e;
      throw new Error(
        `${mail} findes ikke. Kør npm run v1test:brugere (provisioner-v1-test-brugere.mjs) først.`
      );
    }
  }
  const rigtigtUid = (v) => {
    const m = /^uid:([a-zA-Z0-9]+)$/.exec(v);
    if (!m) return v;
    const uid = uidForRolle[m[1]];
    if (!uid) throw new Error(`rigtigtUid: ukendt rolle-pladsholder "${v}".`);
    return uid;
  };
  /** Erstatter enhver "uid:<rolle>"-streng, i dybden, uden at røre andet. */
  const medRigtigeUid = (v) => {
    if (typeof v === "string") return rigtigtUid(v);
    if (Array.isArray(v)) return v.map(medRigtigeUid);
    if (v && typeof v === "object") {
      const ud = {};
      for (const [k, val] of Object.entries(v)) ud[k] = medRigtigeUid(val);
      return ud;
    }
    return v;
  };

  /* ---- 2. Bookingens tilstand er AFLEDT — beslutning 40. Regnes her, ikke
     gættet i seed-filen, så den aldrig kan drive fra etaperne. --------- */
  const etaperPrBooking = new Map();
  for (const e of V1T_ETAPER) {
    if (!etaperPrBooking.has(e.bookingId)) etaperPrBooking.set(e.bookingId, []);
    etaperPrBooking.get(e.bookingId).push(e);
  }
  const bookingerMedTilstand = V1T_BOOKINGER.map((b) => ({
    ...b,
    tilstand: forloebstilstand(etaperPrBooking.get(b.id) || []).tilstand,
  }));

  /* ---- 3. Skriv hver node. Formen er nøjagtig somNode()/sammeNode(), som
     provisioner-dev.mjs bruger til "demo". ------------------------------ */
  const skriv = async (node, value) => {
    await db.ref(`tenants/${TENANT}/${node}`).set(medRigtigeUid(value));
    console.log(`  ${node.padEnd(24)} ${Object.keys(value).length} poster`);
  };

  await skriv("kunder", somNode(V1T_KUNDER));
  await skriv("leverandoerer", somNode(V1T_LEVERANDOERER));
  await skriv("koeretoejer", somNode(V1T_KOERETOEJER));
  await skriv("personale", somNode(V1T_PERSONALE));
  await skriv("kompetencer", somNode(V1T_KOMPETENCER));
  await skriv("facility/lokationer", somNode(V1T_LOKATIONER));
  await skriv("facility/aktiver", somNode(V1T_AKTIVER));
  await skriv("reolpladser", somNode(V1T_REOLPLADSER));
  await skriv("varer", somNode(V1T_VARER));
  await skriv("beholdning", somNode(V1T_BEHOLDNING));
  await skriv("carriers", somNode(V1T_CARRIERS));
  await skriv("kassetyper", somNode(V1T_KASSETYPER));
  await skriv("kasser", somNode(V1T_KASSER));
  await skriv("kasseudlaan", somNode(V1T_KASSEUDLAAN));
  await skriv("bookinger", somNode(bookingerMedTilstand));
  await skriv("etaper", somNode(V1T_ETAPER));
  await skriv("opgaver", somNode(V1T_OPGAVER));
  await skriv("indberetninger", somNode(V1T_INDBERETNINGER));
  await skriv("sensitive/indberetninger", V1T_INDBERETNINGER_SENSITIVE);
  await skriv("fravaer", somNode(V1T_FRAVAER));
  await skriv("indkoebsbehov", somNode(V1T_INDKOEBSBEHOV));
  await skriv("indkoebsordrer", somNode(V1T_INDKOEBSORDRER));
  await skriv("grundlag", somNode(V1T_GRUNDLAG));

  /* ---- 4. Reservationer — UDLEDT af etaper og opgaver, aldrig et eget
     datasæt. Samme funktioner som etapeskift/opgaveplanlaeg bruger.
     ⚠ FRAVÆRET SPRINGES OVER MED VILJE: en ANSØGNING reserverer ingenting
     (beslutning 108) — kun en godkendt eller kontorregistreret fravær ville.
     ------------------------------------------------------------------- */
  const BUNDET = ["reserveret", "udfoert"];
  const reservationer = {};
  let antalEtape = 0, antalOpgave = 0;
  const laegIReservationer = (r, noegle) => {
    reservationer[r.ressourceType] ??= {};
    reservationer[r.ressourceType][r.ressourceId] ??= {};
    reservationer[r.ressourceType][r.ressourceId][noegle] = {
      fra: r.fra, til: r.til, kilde: r.kilde,
      oprettetAf: "provisioner", oprettetMs: Date.now(),
    };
  };
  for (const e of V1T_ETAPER) {
    if (!BUNDET.includes(e.tilstand)) continue;
    for (const [i, r] of reservationerFraEtape(e).entries()) {
      laegIReservationer(r, `res-${e.id}-${i}`);
      antalEtape += 1;
    }
  }
  for (const o of V1T_OPGAVER) {
    let r;
    try { r = reservationFraOpgave(o); } catch { continue; }
    laegIReservationer(r, `res-${o.id}`);
    antalOpgave += 1;
  }
  await db.ref(`tenants/${TENANT}/reservationer`).set(reservationer);
  console.log(`  ${"reservationer".padEnd(24)} ${antalEtape} fra etaper, ${antalOpgave} fra opgaver, 0 fra fravær (ansøgt, ikke godkendt)`);

  /* ---- 5. Countere — så den næste RIGTIGE booking/ordre/grundlag ikke
     kolliderer med de her tre numre. Samme regnestykke som SERIER-blokken i
     provisioner-dev.mjs. --------------------------------------------- */
  const SERIER = [
    { serie: "booking", praefiks: "BKG", poster: bookingerMedTilstand },
    { serie: ORDRESERIE, praefiks: ORDRE_PRAEFIKS, poster: V1T_INDKOEBSORDRER },
    { serie: "grundlag", praefiks: "GRL", poster: V1T_GRUNDLAG },
  ];
  for (const { serie, praefiks, poster } of SERIER) {
    const hoejeste = {};
    const form = new RegExp("^" + praefiks + "-(\\d{4})-(\\d{5})$");
    for (const post of poster) {
      const m = form.exec(post.nummer || "");
      if (!m) continue;
      hoejeste[m[1]] = Math.max(hoejeste[m[1]] || 0, Number(m[2]));
    }
    for (const [aar, n] of Object.entries(hoejeste)) {
      await db.ref(`tenants/${TENANT}/countere/${serie}/${aar}`).set(n);
    }
    console.log(`  ${("countere/" + serie).padEnd(24)} ` +
      Object.entries(hoejeste).map(([a, n]) => `${a}: ${n}`).join(", "));
  }

  /* ---- 6. kpi/current — regnet, ikke gættet. Samme vej som jobbet i
     functions/index.js går: læs noderne tilbage, kald beregnKpi(). ---- */
  const somRaekker = (v) => Object.entries(v || {}).map(([id, x]) => ({ id, ...x }));
  const hentNode = async (n) => somRaekker((await db.ref(`tenants/${TENANT}/${n}`).once("value")).val());
  const [
    kpiKunder, kpiEtaper, kpiGrundlag, kpiOpgaver, kpiIndkoeb, kpiFakturaer,
    kpiLeverandoerer, kpiAktiver, kpiFejl, kpiSensorer, kpiIndberetninger,
    kpiKoeretoejer, kpiPersonale, kpiKompetencer, kpiBookinger, kpiFravaer,
    kpiForbrugsvarer,
  ] = await Promise.all([
    "kunder", "etaper", "grundlag", "opgaver", "indkoeb", "fakturaer",
    "leverandoerer", "facility/aktiver", "facility/fejl", "facility/sensorer",
    "indberetninger", "koeretoejer", "personale", "kompetencer", "bookinger",
    "fravaer", "forbrugsvarer",
  ].map(hentNode));

  const kpiReservationer = (() => {
    const ud = {};
    for (const [type, paaType] of Object.entries(reservationer || {})) {
      ud[type] = {};
      for (const [id, poster] of Object.entries(paaType || {})) {
        ud[type][id] = Object.entries(poster || {}).map(([rid, v]) => ({ id: rid, ...v }));
      }
    }
    return ud;
  })();

  const kpi = beregnKpi({
    kunder: kpiKunder, etaper: kpiEtaper, grundlag: kpiGrundlag,
    opgaver: kpiOpgaver, indkoeb: kpiIndkoeb, fakturaer: kpiFakturaer,
    leverandoerer: kpiLeverandoerer,
    facilityAktiver: kpiAktiver, facilityFejl: kpiFejl, facilitySensorer: kpiSensorer,
    indberetninger: kpiIndberetninger,
    koeretoejer: kpiKoeretoejer, personale: kpiPersonale,
    kompetencer: kpiKompetencer, reservationer: kpiReservationer,
    bookinger: kpiBookinger, fravaer: kpiFravaer,
    forbrugsvarer: kpiForbrugsvarer,
    forrige: null, nu: Date.now(),
  });
  await db.ref(`tenants/${TENANT}/kpi/current`).set(kpi);
  console.log(`  ${"kpi/current".padEnd(24)} beregnet`);

  console.log(`\nFærdig.`);
  await app.delete();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`\nAFBRUDT: ${e.message}\n`); process.exit(1); });
}

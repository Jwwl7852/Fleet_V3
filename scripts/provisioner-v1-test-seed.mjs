/* scripts/provisioner-v1-test-seed.mjs
 * Seeder det kuraterede testdatasæt ind i tenanten "v1-test" — trin 3 af 3
 * i opgaven "OPRET ET RENT V1-TESTSELSKAB I DEV":
 *
 *   1. npm run kunde:opret -- --id v1-test --navn "FleetControl Test Logistics ApS" \
 *        --moduler booking,flaade,facility,indkoeb,warehouse,unitbooking,bemanding,kunder
 *   2. node scripts/provisioner-v1-test-brugere.mjs
 *   3. node scripts/provisioner-v1-test-seed.mjs   ← denne fil
 *
 * ⚠ INGEN NYE PRIMITIVER. Skrivningen genbruger `somNode()`/`sammeNode()` fra
 * provisioner-dev.mjs — samme normalisering af id-bærende arrays til RTDB's
 * nøglede form — og reservationerne bygges af de SAMME funktioner skærmen og
 * serveren bruger (reservationerFraEtape, reservationFraFravaer,
 * reservationFraOpgave), præcis som provisioner-dev.mjs gør for demo. Det
 * eneste nye er DATAEN — se scripts/v1-test-data/*.mjs — og oversættelsen af
 * dens "@rolle"-pladsholdere til de uid'er trin 2 lige har oprettet.
 *
 * ⚠ EN ANSØGT FRAVÆRSPOST FÅR INGEN RESERVATION. provisioner-dev.mjs's
 * fravaer-løkke reserverer BLINDT, fordi intet DEMO_FRAVAER bærer et
 * `ansoegning`-felt — v1-test's ene fravær gør (status "ansoegt"), og en
 * blind reservation ville spærre medarbejderen FØR kontoret har godkendt
 * noget, i modstrid med B2-flowets egen regel: "en ansøgning spærrer
 * ingenting" (se erAftalt() i src/fleet/fravaer.js). Løkken herunder gater
 * derfor på den, som skærmen og `fravaerstatus` selv gør.
 */
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import {
  NOEGLEFIL, tjekProjekt, vurderIgnorering, forklarAuthFejl, laesNoegle,
  somNode, sammeNode,
} from "./provisioner-dev.mjs";
import { TENANT, V1T_DOMAENE, V1T_BRUGERE } from "./provisioner-v1-test-brugere.mjs";
import { reservationerFraEtape } from "../src/fleet/etaper.js";
import { reservationFraFravaer, erAftalt } from "../src/fleet/fravaer.js";
import { reservationFraOpgave } from "../src/fleet/opgaver.js";
import { beregnKpi } from "../src/fleet/kpi-aggregering.js";
import { ORDRESERIE, ORDRE_PRAEFIKS } from "../src/fleet/procure.js";

import { V1T_KUNDER } from "./v1-test-data/kunder.mjs";
import { V1T_LEVERANDOERER } from "./v1-test-data/leverandoerer.mjs";
import { V1T_KOERETOEJER } from "./v1-test-data/flaade.mjs";
import { V1T_PERSONALE, V1T_KOMPETENCER } from "./v1-test-data/personale.mjs";
import { V1T_LOKATIONER, V1T_AKTIVER } from "./v1-test-data/facility.mjs";
import {
  V1T_INDKOEBSBEHOV, V1T_INDKOEBSORDRER, V1T_GODKENDELSESREGLER, V1T_FAKTURAER,
} from "./v1-test-data/procure.mjs";
import {
  V1T_BOOKINGER, V1T_ETAPER, V1T_OPGAVER, V1T_INDBERETNINGER, V1T_FRAVAER,
} from "./v1-test-data/drift.mjs";
import { V1T_REOLPLADSER } from "./v1-test-data/lager-pladser.mjs";
import { V1T_KASSETYPER, V1T_KASSER, V1T_KASSEUDLAAN } from "./v1-test-data/unitbooking.mjs";
import {
  V1T_VARER, V1T_CARRIERS, V1T_BEHOLDNING, V1T_ENHEDER,
} from "./v1-test-data/warehouse.mjs";

const V1T_MODULER = [
  "booking", "flaade", "facility", "indkoeb", "warehouse", "unitbooking", "bemanding", "kunder",
];

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
  if (!findes) {
    throw new Error(`Tenanten "${TENANT}" findes ikke. Kør npm run kunde:opret først.`);
  }

  const moduler = (await db.ref(`tenants/${TENANT}/moduler`).once("value")).val() || {};
  const manglendeModul = V1T_MODULER.filter((m) => moduler[m] !== true);
  if (manglendeModul.length) {
    throw new Error(
      `Tenanten "${TENANT}" mangler modulet/modulerne: ${manglendeModul.join(", ")}. ` +
      "Ret det med npm run kunde:moduler før seedet køres."
    );
  }

  console.log(`Seeder tenant "${TENANT}" i ${noegle.project_id}.\n`);

  /* ── 1. Slå de 7 allerede oprettede rollekonti op og byg uidFor. ────────
     ⚠ OPRETTER INGEN BRUGERE HER. Det er trin 2's ansvar
     (provisioner-v1-test-brugere.mjs), af nøjagtig den grund den fil selv
     forklarer: DEV-brugeroprettelse er bevidst afgrænset til dev-tenanten i
     provisioner-dev.mjs, og v1-test genbruger den samme claimsFor()-vej i
     stedet for at omgå guarden. */
  const uidFor = {};
  for (const rolle of ["admin", ...V1T_BRUGERE.map((b) => b.rolle)]) {
    let bruger;
    try {
      bruger = await auth.getUserByEmail(`${rolle}@${V1T_DOMAENE}`);
    } catch (e) {
      if (e.code === "auth/user-not-found") {
        throw new Error(
          `Brugeren "${rolle}@${V1T_DOMAENE}" findes ikke. Kør ` +
          "node scripts/provisioner-v1-test-brugere.mjs først."
        );
      }
      throw e;
    }
    uidFor[rolle] = bruger.uid;
  }
  console.log(`  brugere            ${Object.keys(uidFor).length} rollekonti fundet`);

  /* ⚠ "@rolle" → uid. Samme oversættelse som PLADSHOLDER_ROLLE i
     provisioner-dev.mjs, blot den anden vej: her ER pladsholderen allerede
     rollenavnet, fordi testdataen er skrevet til v1-test og ikke til demo. */
  const indsaetUid = (vaerdi) => {
    if (typeof vaerdi !== "string" || !vaerdi.startsWith("@")) return vaerdi;
    const rolle = vaerdi.slice(1);
    const uid = uidFor[rolle];
    if (!uid) throw new Error(`Ukendt rolle-pladsholder "${vaerdi}" — findes ikke i uidFor.`);
    return uid;
  };
  const medUid = (poster, felter) => poster.map((p) => {
    const ny = { ...p };
    for (const f of felter) if (ny[f] !== undefined && ny[f] !== null) ny[f] = indsaetUid(ny[f]);
    return ny;
  });

  /* ── 2. Stamdata. ────────────────────────────────────────────────────── */
  console.log("");
  const skriv = async (node, nyttelast, antal) => {
    await db.ref(`tenants/${TENANT}/${node}`).set(nyttelast);
    console.log(`  ${node.padEnd(24)} ${antal}`);
  };

  await skriv("kunder", somNode(V1T_KUNDER), `${V1T_KUNDER.length} rækker`);
  await skriv("leverandoerer", sammeNode(V1T_LEVERANDOERER, ["prisliste"]),
    `${V1T_LEVERANDOERER.length} rækker`);
  await skriv("koeretoejer", somNode(V1T_KOERETOEJER), `${V1T_KOERETOEJER.length} rækker`);
  await skriv("personale", somNode(V1T_PERSONALE), `${V1T_PERSONALE.length} rækker`);
  await skriv("kompetencer", somNode(V1T_KOMPETENCER), `${V1T_KOMPETENCER.length} rækker`);
  await skriv("facility/lokationer", somNode(V1T_LOKATIONER), `${V1T_LOKATIONER.length} rækker`);
  await skriv("facility/aktiver", somNode(V1T_AKTIVER), `${V1T_AKTIVER.length} rækker`);

  /* ── 3. Drift: bookinger, etaper, opgaver, indberetninger, fravær. ─────
     ⚠ opgaver.personId OG fravaer.personId ER IKKE PLADSHOLDERE — de peger
     direkte på en personale-post, som opgaveplanlaeg/fravaerskriv selv
     kræver, og er allerede rigtige i drift.mjs. */
  const bookinger = medUid(V1T_BOOKINGER, ["oprettetAf"]);
  await skriv("bookinger", somNode(bookinger), `${bookinger.length} rækker`);
  await skriv("etaper", sammeNode(V1T_ETAPER, ["forslag"]), `${V1T_ETAPER.length} rækker`);
  await skriv("opgaver", somNode(V1T_OPGAVER), `${V1T_OPGAVER.length} rækker`);
  const indberetninger = medUid(V1T_INDBERETNINGER, ["oprettetAf"]);
  await skriv("indberetninger", somNode(indberetninger), `${indberetninger.length} rækker`);
  await skriv("fravaer", somNode(V1T_FRAVAER), `${V1T_FRAVAER.length} rækker`);

  /* ── 4. Procure. ─────────────────────────────────────────────────────── */
  const behov = medUid(V1T_INDKOEBSBEHOV, ["oprettetAf"]);
  await skriv("indkoebsbehov", somNode(behov), `${behov.length} rækker`);
  const ordrer = medUid(V1T_INDKOEBSORDRER, ["oprettetAf"]);
  await skriv("indkoebsordrer", somNode(ordrer), `${ordrer.length} rækker`);
  const godkendelsesregler = {
    ...V1T_GODKENDELSESREGLER,
    overBeloeb: {
      ...V1T_GODKENDELSESREGLER.overBeloeb,
      godkenderUid: indsaetUid(V1T_GODKENDELSESREGLER.overBeloeb.godkenderUid),
    },
    aendretAf: indsaetUid(V1T_GODKENDELSESREGLER.aendretAf),
  };
  await skriv("godkendelsesregler", godkendelsesregler, "objekt");
  const fakturaer = medUid(V1T_FAKTURAER, ["matchetAf"]);
  await skriv("fakturaer", somNode(fakturaer), `${fakturaer.length} rækker`);

  /* ── 5. Unitbooking + Warehouse (delt reolstruktur). ────────────────── */
  await skriv("reolpladser", somNode(V1T_REOLPLADSER), `${V1T_REOLPLADSER.length} rækker`);
  await skriv("kassetyper", somNode(V1T_KASSETYPER), `${V1T_KASSETYPER.length} rækker`);
  await skriv("kasser", somNode(V1T_KASSER), `${V1T_KASSER.length} rækker`);
  await skriv("kasseudlaan", somNode(V1T_KASSEUDLAAN), `${V1T_KASSEUDLAAN.length} rækker`);
  await skriv("varer", somNode(V1T_VARER), `${V1T_VARER.length} rækker`);
  await skriv("carriers", somNode(V1T_CARRIERS), `${V1T_CARRIERS.length} rækker`);
  await skriv("beholdning", somNode(V1T_BEHOLDNING), `${V1T_BEHOLDNING.length} rækker`);
  await skriv("enheder", somNode(V1T_ENHEDER), `${V1T_ENHEDER.length} rækker`);

  /* ══════════════════════════════════════════════════════════════════════
     ⚠ RESERVATIONERNE ER UDLEDT, IKKE ET DATASÆT — samme mønster som
     provisioner-dev.mjs. Uden dem ser hver ressource FRI ud i v1-test, og de
     fem disponeringstjek kan ikke ses virke.
     ══════════════════════════════════════════════════════════════════════ */
  const BUNDET = ["reserveret", "udfoert"];
  const reservationer = {};
  let antalResv = 0;
  const laegIReservationer = (r, noegle) => {
    reservationer[r.ressourceType] ??= {};
    reservationer[r.ressourceType][r.ressourceId] ??= {};
    reservationer[r.ressourceType][r.ressourceId][noegle] = {
      fra: r.fra, til: r.til, kilde: r.kilde,
      oprettetAf: "provisioner-v1-test", oprettetMs: Date.now(),
    };
  };

  for (const e of V1T_ETAPER) {
    if (!BUNDET.includes(e.tilstand)) continue;
    for (const [i, r] of reservationerFraEtape(e).entries()) {
      laegIReservationer(r, `res-${e.id}-${i}`);
      antalResv += 1;
    }
  }

  let antalFravaer = 0;
  for (const f of V1T_FRAVAER) {
    if (!erAftalt(f)) continue; // en ansøgning spærrer ingenting — se hovedet
    let r;
    try {
      r = reservationFraFravaer(f);
    } catch {
      continue;
    }
    laegIReservationer(r, `res-${f.id}`);
    antalFravaer += 1;
  }

  let antalOpgaver = 0;
  for (const o of V1T_OPGAVER) {
    let r;
    try {
      r = reservationFraOpgave(o);
    } catch {
      continue;
    }
    laegIReservationer(r, `res-${o.id}`);
    antalOpgaver += 1;
  }

  await db.ref(`tenants/${TENANT}/reservationer`).set(reservationer);
  console.log(
    `  ${"reservationer".padEnd(24)} ${antalResv} fra etaper, ${antalFravaer} fra fravær ` +
    `(1 ansøgt fravær sprunget over — se hovedet), ${antalOpgaver} fra opgaver`);

  /* ── 6. Nummerserier — sæt tælleren til det højeste udstedte nummer. ─── */
  const SERIER = [
    { serie: "booking", praefiks: "BKG", poster: bookinger },
    { serie: ORDRESERIE, praefiks: ORDRE_PRAEFIKS, poster: ordrer },
  ];
  for (const { serie, praefiks, poster } of SERIER) {
    const hoejesteNummer = {};
    const form = new RegExp("^" + praefiks + "-(\\d{4})-(\\d{5})$");
    for (const post of poster) {
      const m = form.exec(post.nummer || "");
      if (!m) continue;
      hoejesteNummer[m[1]] = Math.max(hoejesteNummer[m[1]] || 0, Number(m[2]));
    }
    for (const [aar, n] of Object.entries(hoejesteNummer)) {
      await db.ref(`tenants/${TENANT}/countere/${serie}/${aar}`).set(n);
    }
    if (Object.keys(hoejesteNummer).length) {
      console.log(
        `  ${("countere/" + serie).padEnd(24)} ` +
        Object.entries(hoejesteNummer).map(([a, n]) => `${a}: ${n}`).join(", "));
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     ⚠ NØGLETALLENE REGNES, IKKE SEEDES — samme regel og samme grund som
     provisioner-dev.mjs: dev/v1-test HAR en database, og opdigtede tal må
     kun stå hvor der ingen er (se datatilstand.js, beslutning 26).
     ══════════════════════════════════════════════════════════════════════ */
  const somRaekker = (v) => Object.entries(v || {}).map(([id, x]) => ({ id, ...x }));
  const hentNode = async (n) =>
    somRaekker((await db.ref(`tenants/${TENANT}/${n}`).once("value")).val());

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

  const tal = beregnKpi({
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
  await db.ref(`tenants/${TENANT}/kpi/current`).set(tal);
  console.log(`  ${"kpi/current".padEnd(24)} beregnet`);

  console.log(`\nFærdig. Tenant "${TENANT}" er seedet i ${noegle.project_id}.`);
  await app.delete();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    const forklaring = forklarAuthFejl(e?.code);
    console.error(`\n${forklaring ? `AFBRUDT: ${forklaring}` : `AFBRUDT: ${e.message}`}\n`);
    process.exit(1);
  });
}

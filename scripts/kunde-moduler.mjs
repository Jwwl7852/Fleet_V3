/* scripts/kunde-moduler.mjs
 * Retter en EKSISTERENDE kundes modulliste. Intet andet.
 *
 *   npm run kunde:moduler -- --id nordvest --moduler flaade,facility,indkoeb,bemanding
 *
 * ---------------------------------------------------------------------------
 * ⚠ HVORFOR DEN IKKE ER `kunde:opret --genskriv`.
 *
 * --genskriv overskriver virksomhedsnavn OG modulliste, og den nulstiller
 * administratorens kodeord og tilbagekalder hans tokens. Det er rigtigt når
 * man genskaber en kunde. Det er forkert når man krydser ét modul af: så
 * bliver kunden logget ud midt i arbejdet af en handling der ikke havde
 * noget med hans login at gøre.
 *
 * En knap der gør mere end den hedder, bliver brugt til det den hedder — og
 * så opdager man resten bagefter.
 *
 * ---------------------------------------------------------------------------
 * ⚠ DEN OPRETTER IKKE. Findes tenanten ikke, er det en tastefejl i --id, og
 * en stille oprettelse ville lave en tom tenant ved siden af den rigtige.
 *
 * Spærringerne og validereingen er IMPORTERET, ikke skrevet af. Kataloget
 * står i src/fleet/moduler.js — det er det samme sæt konsollen og klienten
 * kender, og en modulliste med et navn ingen af dem kender ville tegne en
 * sidebar uden det punkt.
 */
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import {
  NOEGLEFIL, tjekProjekt, vurderIgnorering, laesNoegle,
} from "./provisioner-dev.mjs";
import { laesArgumenter } from "./opret-kunde.mjs";
import { VALGFRIE_MODULER, modulsaet, ukendteModuler } from "../src/fleet/moduler.js";

export function tjekArgumenter(a) {
  const fejl = [];
  if (!a.id || a.id === true) fejl.push("--id mangler.");
  if (a.moduler === true) fejl.push("--moduler mangler en liste, fx --moduler flaade,bemanding.");

  const valgte = a.moduler && a.moduler !== true
    ? String(a.moduler).split(",").map((m) => m.trim()).filter(Boolean)
    : [];

  const ukendte = ukendteModuler(valgte);
  if (ukendte.length) {
    fejl.push(
      `Ukendte moduler: ${ukendte.join(", ")}. Vælg blandt: ${VALGFRIE_MODULER.join(", ")}.`
    );
  }
  return { fejl, valgte };
}

async function main() {
  const a = laesArgumenter(process.argv.slice(2));
  const { fejl, valgte } = tjekArgumenter(a);
  if (fejl.length) {
    throw new Error(
      `${fejl.join("\n  ")}\n\n` +
      `  Brug: npm run kunde:moduler -- --id nordvest \\\n` +
      `          --moduler ${VALGFRIE_MODULER.slice(0, 3).join(",")}\n\n` +
      `  Listen er FULDSTÆNDIG: det der ikke står, bliver slået fra.`
    );
  }

  const ignorering = vurderIgnorering(
    spawnSync("git", ["check-ignore", "-q", NOEGLEFIL], { stdio: "ignore" }).status ?? 128
  );
  if (!ignorering.ok) throw new Error(ignorering.besked);
  if (ignorering.advarsel) console.warn(`  ! ${ignorering.advarsel}\n`);

  const noegle = laesNoegle();
  tjekProjekt(noegle.project_id);

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getDatabase } = await import("firebase-admin/database");
  const app = initializeApp({
    credential: cert(noegle),
    databaseURL: `https://${noegle.project_id}-default-rtdb.europe-west1.firebasedatabase.app`,
  });
  const db = getDatabase(app);

  const id = a.id;
  const findes = (await db.ref(`tenants/${id}/_findes`).once("value")).exists();
  if (!findes) {
    throw new Error(
      `Tenant "${id}" findes ikke. Opret den med npm run kunde:opret — ` +
      `en stille oprettelse her ville lave en tom tenant ved siden af den rigtige.`
    );
  }

  const foer = (await db.ref(`tenants/${id}/moduler`).once("value")).val() || {};
  const efter = modulsaet(valgte);

  await db.ref(`tenants/${id}/moduler`).set(efter);

  const navn = (await db.ref(`tenants/${id}/virksomhed/navn`).once("value")).val() || id;
  console.log(`\n${navn} (${id})\n`);
  for (const m of Object.keys({ ...foer, ...efter }).sort()) {
    const f = foer[m] === true;
    const e = efter[m] === true;
    const maerke = f === e ? "  " : e ? "+ " : "- ";
    console.log(`  ${maerke}${m}`);
  }
  console.log(
    `\nFærdig. Intet andet er rørt — hverken virksomhed, brugere, claims eller data.` +
    `\nKunden ser ændringen ved næste sideindlæsning; modullisten læses fra basen, ikke fra tokenet.`
  );
  await app.delete();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`\nAFBRUDT: ${e.message}\n`);
    process.exit(1);
  });
}

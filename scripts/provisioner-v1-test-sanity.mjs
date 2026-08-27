/* scripts/provisioner-v1-test-sanity.mjs
 * Read-only sanity-check af tenanten "v1-test" EFTER seed — punkt 9 i
 * V1-testselskabets opgave: "Kør en read-only sanity-check efter seed:
 * dangling references, manglende kunder/leverandører, manglende employee
 * references, ugyldige statusser, reservationsreferencer til ukendte
 * ressourcer, dubletter."
 *
 * ⚠ RØRER INGENTING. Scriptet skriver aldrig — det læser hele tenanten og
 * rapporterer. Findes en inkonsistens, rettes SEED-DATAEN (v1-test-data/*),
 * ikke produktlogikken — feature freeze gælder.
 *
 * ⚠ GENBRUGER referencerI() OG FELT_NODE fra provisioner-dev.mjs — samme
 * kortlægning fra "*Id"-feltnavn til den node det peger på som
 * test/demo-referencer.test.mjs bruger på demo-sættet. To lister ville
 * kunne drive fra hinanden; her er der én.
 *
 * Kør: node scripts/provisioner-v1-test-sanity.mjs
 */
import { pathToFileURL } from "node:url";
import {
  NOEGLEFIL, tjekProjekt, laesNoegle, referencerI, FELT_NODE,
} from "./provisioner-dev.mjs";
import { spawnSync } from "node:child_process";
import { vurderIgnorering } from "./provisioner-dev.mjs";

const TENANT = "v1-test";

/* Noder der reelt indeholder poster med et id — børnenavnet ER posten. */
const POST_NODER = [
  "kunder", "leverandoerer", "koeretoejer", "personale", "kompetencer",
  "bookinger", "etaper", "opgaver", "indberetninger", "fravaer",
  "indkoebsbehov", "indkoebsordrer", "fakturaer",
  "facility/lokationer", "facility/aktiver",
  "reolpladser", "varer", "beholdning", "carriers", "enheder",
  "kassetyper", "kasser", "kasseudlaan",
];

async function main() {
  const ignorering = vurderIgnorering(
    spawnSync("git", ["check-ignore", "-q", NOEGLEFIL], { stdio: "ignore" }).status ?? 128
  );
  if (!ignorering.ok) throw new Error(ignorering.besked);

  const noegle = laesNoegle();
  tjekProjekt(noegle.project_id);

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getDatabase } = await import("firebase-admin/database");
  const app = initializeApp({
    credential: cert(noegle),
    databaseURL: `https://${noegle.project_id}-default-rtdb.europe-west1.firebasedatabase.app`,
  });
  const db = getDatabase(app);

  const findes = (await db.ref(`tenants/${TENANT}/_findes`).once("value")).val();
  if (!findes) throw new Error(`Tenanten "${TENANT}" findes ikke.`);

  console.log(`Sanity-check af tenant "${TENANT}" i ${noegle.project_id}.\n`);

  /* ---- 1. Hent alle poster pr. node, indekseret på id. ----------------- */
  const posterPrNode = {};
  for (const node of POST_NODER) {
    const val = (await db.ref(`tenants/${TENANT}/${node}`).once("value")).val() || {};
    posterPrNode[node] = val;
  }
  const idFindesI = (node, id) => Boolean(posterPrNode[node]?.[id]);

  let fejl = 0;
  const sig = (linje) => { console.log(`  ✗ ${linje}`); fejl += 1; };

  /* ---- 2. Dangling references — samme kortlægning som demo-referencer. */
  for (const [node, poster] of Object.entries(posterPrNode)) {
    for (const [id, post] of Object.entries(poster)) {
      for (const { felt, sti } of referencerI(post)) {
        const maal = FELT_NODE[felt];
        if (!maal) continue; // ukendt felt — ikke en kendt reference, spring over
        const vaerdi = sti.split(".").reduce((o, k) => o?.[k.replace(/\[\d+\]$/, "")], post);
        /* ⚠ SAMME REGEL SOM test/demo-referencer.test.mjs: kun strenge og
           arrays af strenge prøves. `koeretoejIder` er et map-of-booleans
           ({ "kt-012": true, ... }), ikke en array — den plurale "Ider"-form
           dækker begge former i FELT_NODE, men kun den array-baserede kan
           prøves her uden at gætte om nøglerne eller værdierne er id'et. */
        const vaerdier = Array.isArray(vaerdi) ? vaerdi : [vaerdi];
        for (const v of vaerdier) {
          if (typeof v !== "string" || !v) continue;
          if (!idFindesI(maal, v)) {
            sig(`${node}/${id}: ${sti} = "${v}" peger på "${maal}", som ikke findes.`);
          }
        }
      }
    }
  }

  /* ---- 3. Dubletter — id optræder kun én gang pr. node (garanteret af
     somNode()/sammeNode(), men prøves alligevel som en reel kontrol af
     hvad der faktisk står i basen, ikke af hvad seedet MENTE at skrive). */
  for (const [node, poster] of Object.entries(posterPrNode)) {
    const ider = Object.keys(poster);
    const set = new Set(ider);
    if (set.size !== ider.length) sig(`${node}: har dubletnøgler (bør være umuligt i RTDB).`);
  }

  /* ---- 4. Reservationer peger på kendte ressourcer. ---------------------
     ressourceType → hvilken node poster.js/-typen POST_NODER kalder den. */
  const RESSOURCE_NODE = {
    koeretoej: "koeretoejer", medarbejder: "personale",
    facilityAktiv: "facility/aktiver", lokation: "facility/lokationer",
  };
  const reservationer = (await db.ref(`tenants/${TENANT}/reservationer`).once("value")).val() || {};
  for (const [type, prRessource] of Object.entries(reservationer)) {
    const maalNode = RESSOURCE_NODE[type];
    for (const [ressourceId, poster] of Object.entries(prRessource || {})) {
      if (maalNode && !idFindesI(maalNode, ressourceId)) {
        sig(`reservationer/${type}/${ressourceId}: ressourcen findes ikke i ${maalNode}.`);
      }
      for (const [resId, r] of Object.entries(poster || {})) {
        if (r.kilde?.id && !r.annulleret) {
          /* Kildens id peger på en post i den node der matcher kildetypen —
             men kun de tre typer vi selv seeder poster af. */
          const kildeNode = { vaerksted: "opgaver", facilitySag: "opgaver", fravaer: "fravaer" }[r.kilde.type];
          if (kildeNode && !idFindesI(kildeNode, r.kilde.id)) {
            sig(`reservationer/${type}/${ressourceId}/${resId}: kilde.id "${r.kilde.id}" ` +
              `(${r.kilde.type}) findes ikke i ${kildeNode}.`);
          }
        }
      }
    }
  }

  /* ---- 5. Grundlæggende optælling — "manglende kunder/leverandører". --- */
  const antalKunder = Object.keys(posterPrNode.kunder).length;
  const antalLeverandoerer = Object.keys(posterPrNode.leverandoerer).length;
  if (antalKunder === 0) sig("ingen kunder seedet.");
  if (antalLeverandoerer === 0) sig("ingen leverandører seedet.");

  /* ---- 6. Ugyldige statusser — de statusfelter vi kender enum'et for. -- */
  const KOERETOEJ_STATUS = ["aktiv", "vaerksted", "udeAfDrift", "solgt", "skrottet"];
  for (const [id, k] of Object.entries(posterPrNode.koeretoejer)) {
    if (!KOERETOEJ_STATUS.includes(k.status)) sig(`koeretoejer/${id}: ukendt status "${k.status}".`);
  }
  const PERSONALE_STATUS = ["aktiv", "orlov", "fratraadt"];
  for (const [id, p] of Object.entries(posterPrNode.personale)) {
    if (!PERSONALE_STATUS.includes(p.status)) sig(`personale/${id}: ukendt status "${p.status}".`);
  }

  console.log(fejl
    ? `\n${fejl} fund. Ret seed-dataen i scripts/v1-test-data/, ikke produktlogikken.`
    : `\nIngen fund. ${antalKunder} kunder, ${antalLeverandoerer} leverandører, ` +
      `${Object.keys(posterPrNode.koeretoejer).length} køretøjer, ` +
      `${Object.keys(posterPrNode.personale).length} medarbejdere.`);

  await app.delete();
  if (fejl) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`\nAFBRUDT: ${e.message}\n`); process.exit(1); });
}

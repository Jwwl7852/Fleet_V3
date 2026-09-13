#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { planlaegEjerMigrationV1 } from "../src/fleet/ejer-migration.js";

function argumenter(argv) {
  const resultat = { apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") resultat.apply = true;
    else if (arg === "--help") resultat.help = true;
    else if (arg.startsWith("--")) {
      const vaerdi = argv[++i];
      if (!vaerdi || vaerdi.startsWith("--")) throw new Error(`Argumentet ${arg} mangler en værdi.`);
      resultat[arg.slice(2)] = vaerdi;
    }
    else throw new Error(`Ukendt argument: ${arg}`);
  }
  return resultat;
}

function hjaelp() {
  return `Brug:
  node scripts/ejer-migration-v1.mjs --input <fixture.json> [--report <rapport.json>]
  node scripts/ejer-migration-v1.mjs --project <id> --database-url <url> [--report <rapport.json>]
  node scripts/ejer-migration-v1.mjs --project <id> --database-url <url> --apply --confirm-project <id> --report <rapport.json>

Dry-run er standard. --apply kræver eksplicit projektnavn to gange og afviser
konflikter. Værktøjet deployer ikke og ændrer aldrig tilbud, priser eller beløb.`;
}

async function firebaseForbindelse(options) {
  const requireFromFunctions = createRequire(new URL("../functions/package.json", import.meta.url));
  const { applicationDefault, getApps, initializeApp } = requireFromFunctions("firebase-admin/app");
  const { getDatabase } = requireFromFunctions("firebase-admin/database");
  const app = getApps().find((x) => x.name === "ejer-migration-v1") || initializeApp({
    credential: applicationDefault(),
    projectId: options.project,
    databaseURL: options["database-url"],
  }, "ejer-migration-v1");
  return getDatabase(app);
}

async function anvend(db, plan) {
  if (!plan.operationer.length) return [];
  let konfliktsti = null;
  const transaktion = await db.ref("/").transaction((aktuel) => {
    const kopi = structuredClone(aktuel || {});
    for (const post of plan.operationer) {
      const dele = post.sti.split("/");
      let node = kopi;
      for (const del of dele.slice(0, -1)) node = (node[del] ??= {});
      const felt = dele.at(-1);
      if (node[felt] == null) node[felt] = post.vaerdi;
      else if (node[felt] !== post.vaerdi) {
        konfliktsti = post.sti;
        return undefined;
      }
    }
    return kopi;
  });
  if (!transaktion.committed || konfliktsti) {
    throw new Error(`Migrationen blev atomisk afbrudt${konfliktsti ? ` ved konflikt: ${konfliktsti}` : "."}`);
  }
  return plan.operationer.map((post) => ({ sti: post.sti, status: "tilfoejet_eller_allerede_korrekt" }));
}

const options = argumenter(process.argv.slice(2));
if (options.help) {
  process.stdout.write(`${hjaelp()}\n`);
  process.exit(0);
}
if (!options.input && (!options.project || !options["database-url"])) throw new Error(hjaelp());
if (options.apply && options.input) throw new Error("--apply må ikke bruges på en lokal inputfixture.");
if (options.apply && (!options.report || options["confirm-project"] !== options.project)) {
  throw new Error("--apply kræver --report og --confirm-project med præcis samme projekt-id som --project.");
}

let db = null;
const data = options.input
  ? JSON.parse(await readFile(resolve(options.input), "utf8"))
  : await (async () => {
    db = await firebaseForbindelse(options);
    return (await db.ref("/").once("value")).val() || {};
  })();
const plan = planlaegEjerMigrationV1(data);
const rapport = {
  ...plan,
  mode: options.apply ? "apply" : "dry-run",
  projekt: options.project || "lokal_fixture",
  genereretUtc: new Date().toISOString(),
  anvendelse: [],
};

if (options.apply) {
  if (!plan.kanAnvendes) throw new Error(`Dry-run fandt ${plan.antalKonflikter} konflikt(er); intet anvendes.`);
  await writeFile(resolve(options.report), `${JSON.stringify({ ...rapport, status: "planlagt" }, null, 2)}\n`, { flag: "wx" });
  try {
    rapport.anvendelse = await anvend(db, plan);
    rapport.status = "anvendt";
  } catch (fejl) {
    rapport.status = "afbrudt_uden_delvise_skrivninger";
    rapport.fejl = String(fejl?.message || fejl);
    await writeFile(resolve(options.report), `${JSON.stringify(rapport, null, 2)}\n`);
    throw fejl;
  }
}
const json = `${JSON.stringify(rapport, null, 2)}\n`;
if (options.report) {
  if (options.apply) await writeFile(resolve(options.report), json);
  else await writeFile(resolve(options.report), json, { flag: "wx" });
}
process.stdout.write(json);

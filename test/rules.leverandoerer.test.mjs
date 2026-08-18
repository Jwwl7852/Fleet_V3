/* test/rules.leverandoerer.test.mjs
 * Leverandøren som entitet i reglerne — beslutning 18, femte gang.
 *
 * `leverandoerer/<leverandoerId>` med `prisliste/<prisId>`.
 *
 * ⚠ NODEN FANDTES SLET IKKE I REGELFILEN. Modellen har regnet med den hele
 * tiden: BÅDE `indkoeb` og `fakturaer` har indekseret `leverandoerId` siden de
 * blev skrevet. Der var bare ikke noget at slå op i — og imens stod
 * leverandørens navn som FRITEKST i tre demo-filer med hver sin stavemåde.
 *
 * ⚠ OG DERFOR PRØVES DE TO REFERENCER HER OGSÅ. Et fremmednøglefelt der ikke
 * slår op, er ikke en reference — det er en streng der ligner en. De blev
 * strammet SAMMEN med at noden kom til, som noterne begge steder lovede.
 *
 * Koer: npm test
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import { ref, set } from "firebase/database";
import { PERM, ALLE_PERMS, permStreng } from "../src/fleet/permissions.js";
import { ALLE_KATEGORIER, ALLE_AFTALETYPER } from "../src/fleet/leverandoerer.js";

const T = "tenantLev";
const UDEN_MODUL = "tenantUdenIndkoeb";
const LEV = "lv-hydra";

let miljoe;

const medPerms = (uid, perms, tenant = T) =>
  miljoe.authenticatedContext(uid, {
    tenant, rolle: "admin", perms: permStreng(perms),
  }).database();

const somIndkoeber = (uid = "u-ind", tenant = T) =>
  medPerms(uid, [PERM.indkoebSkriv], tenant);

const sti = (rest, tenant = T) => `tenants/${tenant}/${rest}`;
const levSti = (id, tenant = T) => sti(`leverandoerer/${id}`, tenant);

const LEVERANDOER = {
  navn: "Hydra-Grene Kolding",
  cvr: "18447291",
  kategori: "reservedele",
  division: "gods",
  aktiv: true,
  kontaktEmail: "salg@hydra-grene.dk",
  kontaktTelefon: "75 52 11 00",
  aftale: { type: "rammeaftale", gyldigFra: 1752444000000 },
};

const PRIS = {
  varenummer: "OLIE-5W30", vare: "Motorolie 5W30", enhed: "l",
  prisOere: 4200, gyldigFra: 1773180000000,
};

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-lev",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync("firebase.rules.json", "utf8"),
    },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, `tenants/${T}/_findes`), true);
    await set(ref(db, `tenants/${UDEN_MODUL}/_findes`), true);
    await set(ref(db, `tenants/${UDEN_MODUL}/moduler`), { indkoeb: false });
    await set(ref(db, `tenants/${UDEN_MODUL}/leverandoerer/${LEV}`), LEVERANDOER);
  });
});

after(async () => {
  await miljoe?.cleanup();
});

/* ══════════════════════════════════════════════════════════════════════
   Entiteten
   ══════════════════════════════════════════════════════════════════════ */
describe("leverandøren som entitet", () => {
  it("tager en fuldt udfyldt leverandør", async () => {
    const db = somIndkoeber();
    await assertSucceeds(set(ref(db, levSti(LEV)), LEVERANDOER));
  });

  it("kræver navn og kategori", async () => {
    /* De to er det mindste der gør en leverandør til en leverandør: hvem det
       er, og hvad han leverer. Uden kategorien kan han ikke stilles op mod
       de andre der leverer det samme. */
    const db = somIndkoeber();
    for (const felt of ["navn", "kategori"]) {
      const uden = { ...LEVERANDOER };
      delete uden[felt];
      await assertFails(set(ref(db, levSti(`mangler-${felt}`)), uden));
    }
  });

  it("⚠ CVR ER EN STRENG AF OTTE CIFRE, IKKE ET TAL", async () => {
    /* Et CVR med foranstillet nul mister nullet som number, og så matcher det
       ikke registret. Samme grund som at et telefonnummer er en streng — og
       den fejl opdages først når nogen slår virksomheden op. */
    const db = somIndkoeber();
    await assertSucceeds(set(ref(db, levSti("cvr-nul")), { ...LEVERANDOER, cvr: "01234567" }));
    await assertFails(set(ref(db, levSti("cvr-tal")), { ...LEVERANDOER, cvr: 18447291 }));
    await assertFails(set(ref(db, levSti("cvr-kort")), { ...LEVERANDOER, cvr: "1844729" }));
  });

  it("kender kun de syv kategorier", async () => {
    const db = somIndkoeber();
    for (const k of ALLE_KATEGORIER) {
      await assertSucceeds(set(ref(db, levSti(`kat-${k}`)), { ...LEVERANDOER, kategori: k }));
    }
    await assertFails(set(ref(db, levSti("kat-fri")), { ...LEVERANDOER, kategori: "diverse" }));
  });

  it("kender kun de tre aftaletyper", async () => {
    /* ⚠ AFTALEFORMEN AFGØR HVAD EN PRISAFVIGELSE BETYDER. En fastaftale der
       afviger 4 % er et brud; et spotkøb der gør det, er markedet. En fjerde
       type ville ikke have en grænse at blive målt mod.

       ⚠ ORDLISTEN ER MODULETS, IKKE MIN. Første udgave af reglen skrev
       `fastpris` og `abonnement` — to typer jeg havde forestillet mig.
       AFTALETYPE i leverandoerer.js siger fastaftale | rammeaftale | spot,
       og prøven her læser ALLE_AFTALETYPER frem for at gentage dem: en
       afskrift ville være et fjerde sted ordlisten står. */
    const db = somIndkoeber();
    for (const t of ALLE_AFTALETYPER) {
      await assertSucceeds(
        set(ref(db, levSti(`aft-${t}`)), { ...LEVERANDOER, aftale: { type: t } }));
    }
    await assertFails(
      set(ref(db, levSti("aft-fri")), { ...LEVERANDOER, aftale: { type: "haandslag" } }));
  });

  it("⚠ DIVISION ER TILLADT HER — modsat på personale og køretøjer", async () => {
    /* Prøven er om feltet beskriver LEVERANDØRENS forretning eller VORES
       organisation. Mercedes Greve er et lastbilværksted; Crawford leverer
       porte til begge. Beslutning 19 forbyder feltet dér hvor det ville
       beskrive vores egen opdeling — her kan det begrundes på posten selv. */
    const db = somIndkoeber();
    for (const d of ["gods", "bus", "faelles"]) {
      await assertSucceeds(set(ref(db, levSti(`div-${d}`)), { ...LEVERANDOER, division: d }));
    }
    await assertFails(set(ref(db, levSti("div-fri")), { ...LEVERANDOER, division: "kurer" }));
  });

  it("afviser et ukendt felt", async () => {
    const db = somIndkoeber();
    await assertFails(
      set(ref(db, levSti("ekstra")), { ...LEVERANDOER, rabatPct: 12 }));
  });

  it("kræver indkoeb.skriv — og deler den med indkøbslinjerne", async () => {
    /* ⚠ INGEN EGEN PERMISSION, OG DET ER BESLUTTET. En permission mere ville
       betyde en rolle der kan registrere et indkøb, men ikke oprette den
       leverandør indkøbet kræver — og så ville den rolle sidde fast på sin
       første post. */
    const uden = medPerms("u-uden", ALLE_PERMS.filter((p) => p !== PERM.indkoebSkriv));
    await assertFails(set(ref(uden, levSti("naegtet")), LEVERANDOER));
  });

  it("er lukket for en tenant uden indkøbsmodulet", async () => {
    /* Noden bærer PRISLISTEN — hvad vi har aftalt at betale. Modsat
       `fakturaer`, som står i basen fordi to skærme rører den, rører kun
       Indkøb en leverandør. */
    const db = somIndkoeber("u-udenmodul", UDEN_MODUL);
    await assertFails(set(ref(db, levSti("ny", UDEN_MODUL)), LEVERANDOER));
  });
});

/* ══════════════════════════════════════════════════════════════════════
   Prislisten — versioneret på dato
   ══════════════════════════════════════════════════════════════════════ */
describe("prislisten ligger på leverandøren", () => {
  it("tager en prispost", async () => {
    const db = somIndkoeber();
    await set(ref(db, levSti("p-ok")), LEVERANDOER);
    await assertSucceeds(set(ref(db, levSti("p-ok/prisliste/pr1")), PRIS));
  });

  it("kræver varenummer, pris og gyldigFra", async () => {
    /* ⚠ gyldigFra ER IKKE VALGFRI. En pris uden en dato kan ikke slås op PÅ
       en dato, og så måles marts-fakturaen mod dagens pris. Så peger
       afvigelsen på leverandøren frem for på os. */
    const db = somIndkoeber();
    await set(ref(db, levSti("p-krav")), LEVERANDOER);
    for (const felt of ["varenummer", "prisOere", "gyldigFra"]) {
      const uden = { ...PRIS };
      delete uden[felt];
      await assertFails(set(ref(db, levSti(`p-krav/prisliste/uden-${felt}`)), uden));
    }
  });

  it("⚠ PRISEN ER HELE ØRE — en float afvises", async () => {
    /* Samme regel som indkøbslinjens pris: 18,50 kr er 1850. En float bliver
       1849,999 i en sum over hundrede linjer, og så går afstemningen mod
       leverandørens faktura ikke op med en øre ingen kan forklare. */
    const db = somIndkoeber();
    await set(ref(db, levSti("p-oere")), LEVERANDOER);
    await assertFails(set(ref(db, levSti("p-oere/prisliste/float")), { ...PRIS, prisOere: 42.5 }));
    await assertFails(set(ref(db, levSti("p-oere/prisliste/neg")), { ...PRIS, prisOere: -1 }));
    await assertFails(
      set(ref(db, levSti("p-oere/prisliste/loft")), { ...PRIS, prisOere: 10000000001 }));
  });

  it("⚠ FLERE PRISER PÅ SAMME VARE ER MENINGEN, IKKE EN FEJL", async () => {
    /* Det er hele pointen med versioneringen: tre poster på OLIE-5W30 med
       hver sin gyldigFra er prishistorikken. En regel der krævede at
       varenummeret var unikt, ville have gjort en prisregulering umulig —
       og tvunget en overskrivning, som beslutning 7 forbyder. */
    const db = somIndkoeber();
    await set(ref(db, levSti("p-flere")), LEVERANDOER);
    await assertSucceeds(set(ref(db, levSti("p-flere/prisliste/a")), { ...PRIS, prisOere: 4200, gyldigFra: 1 }));
    await assertSucceeds(set(ref(db, levSti("p-flere/prisliste/b")), { ...PRIS, prisOere: 4600, gyldigFra: 2 }));
    await assertSucceeds(set(ref(db, levSti("p-flere/prisliste/c")), { ...PRIS, prisOere: 4900, gyldigFra: 3 }));
  });

  it("afviser et ukendt felt på en prispost", async () => {
    const db = somIndkoeber();
    await set(ref(db, levSti("p-ekstra")), LEVERANDOER);
    await assertFails(
      set(ref(db, levSti("p-ekstra/prisliste/x")), { ...PRIS, rabatPct: 5 }));
  });
});

/* ══════════════════════════════════════════════════════════════════════
   De to fremmednøgler — strammet SAMMEN med at noden kom til
   ══════════════════════════════════════════════════════════════════════ */
describe("indkøb og fakturaer slår leverandøren op", () => {
  const INDKOEB = {
    division: "gods", dato: 1786831200000, leverandoerId: LEV,
    vare: "Hydraulikslange", antal: 12, prisPrEnhedOere: 1850,
    fakturastatus: "modtaget",
  };

  it("⚠ EN HÆNGENDE LEVERANDØRREFERENCE AFVISES NU", async () => {
    /* Før dette fandtes noden ikke, og feltet var en streng med et længdekrav.
       En indkøbslinje kunne pege på et id der aldrig havde eksisteret, og så
       stod der en tom celle i tabellen som ingen kunne spore tilbage. */
    const db = somIndkoeber();
    await set(ref(db, levSti(LEV)), LEVERANDOER);
    await assertSucceeds(set(ref(db, sti("indkoeb/il-ok")), INDKOEB));
    await assertFails(
      set(ref(db, sti("indkoeb/il-fantom")), { ...INDKOEB, leverandoerId: "lv-findes-ikke" }));
  });

  it("regelen svarer det samme som formularen", () => {
    /* ⚠ EN KLIENTVALIDERING DER IKKE OGSÅ STÅR I REGLERNE, ER EN PÆN KNAP.
       valideIndkoeb() har hele tiden sagt "Leverandøren findes ikke." — men
       serveren tog imod posten alligevel. De to siger nu det samme. */
    /* ⚠ HER STOD ET TAL: "antallet af opslag skal være 2". Det holdt indtil
       en TREDJE node fik feltet — opgaver, da værkstedsbesøgene flyttede ind
       — og så faldt prøven på noget der var RIGTIGT. Et tal siger kun hvor
       mange; det siger ikke hvilke, og det vælter ved enhver udvidelse uden
       at pege på hvad der mangler.

       Prøven spørger nu hver node for sig. Får en fjerde node feltet, skal
       den skrives ind her — og det er den rigtige slags arbejde: nogen har
       taget stilling til om referencen skal slå op. */
    const regler = JSON.parse(
      readFileSync("firebase.rules.json", "utf8")
        .split(String.fromCharCode(10))
        .filter((l) => !l.trim().startsWith("//"))
        .join(String.fromCharCode(10))
    );
    const t = regler.rules.tenants.$tenantId;
    const steder = {
      indkoeb: t.indkoeb.$indkoebId.leverandoerId,
      fakturaer: t.fakturaer.$fakturaId.leverandoerId,
      /* Kom med værkstedsbesøgene. Et værksted der er stavet forkert,
         bliver en AFVISNING frem for en ny leverandør ingen kan finde. */
      opgaver: t.opgaver.$opgaveId.leverandoerId,
    };
    const OPSLAG = "child(" + String.fromCharCode(39) + "leverandoerer" + String.fromCharCode(39) + ")";
    for (const [node, regel] of Object.entries(steder)) {
      assert.ok(regel, `${node}.leverandoerId har ingen regel`);
      assert.ok(regel[".validate"].includes(OPSLAG),
        `${node}.leverandoerId slår ikke leverandøren op — en hængende reference tages imod`);
    }
  });
});

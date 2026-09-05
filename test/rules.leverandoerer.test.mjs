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
} from "./rules-test-claims.mjs";
import { ref, set, get } from "firebase/database";
import { PERM, ALLE_PERMS, permStreng } from "../src/fleet/permissions.js";
import { ALLE_KATEGORIER, ALLE_AFTALETYPER } from "../src/fleet/leverandoerer.js";
import { ALLE_SPROG } from "../src/fleet/sprog.js";

const T = "tenantLev";
const UDEN_MODUL = "tenantUdenIndkoeb";
const LEV = "lv-hydra";

let miljoe;

const medPerms = (uid, perms, tenant = T) =>
  miljoe.authenticatedContext(uid, {
    tenant, rolle: "admin", perms: permStreng(perms),
  }).database();

/* ⚠ SKIVE 4B — BÆRER NU OGSÅ leverandoererSkriv. Denne hjælper bruges både
   til at skrive selve leverandøren (kræver leverandoererSkriv) og til at
   skrive indkøbslinjer der refererer til den (kræver stadig indkoebSkriv,
   uændret) — se "indkøb og fakturaer slår leverandøren op" nedenfor. */
const somIndkoeber = (uid = "u-ind", tenant = T) =>
  medPerms(uid, [PERM.indkoebSkriv, PERM.leverandoererSkriv], tenant);

const sti = (rest, tenant = T) => `tenants/${tenant}/${rest}`;
const levSti = (id, tenant = T) => sti(`leverandoerer/${id}`, tenant);

const LEVERANDOER = {
  navn: "Hydra-Grene Kolding",
  cvr: "18447291",
  kategori: "reservedele",
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

  it("⚠ SKIVE 4D — SPROG ER VALGFRIT, MEN KENDER KUN de/sv/en NÅR DET ER SAT", async () => {
    const db = somIndkoeber();
    for (const s of ALLE_SPROG) {
      await assertSucceeds(set(ref(db, levSti(`sprog-${s}`)), { ...LEVERANDOER, sprog: s }));
    }
    await assertFails(set(ref(db, levSti("sprog-fri")), { ...LEVERANDOER, sprog: "de" }));
    /* ⚠ OG UDEN FELTET GÅR DET STADIG IGENNEM — leverandører oprettet før
       4D har ingen sprog gemt, og det må ikke blive et påkrævet felt for
       en post der ellers er komplet. STANDARD_SPROG er byggLeverandoer()'s
       ansvar (client-side), ikke reglens. */
    const { sprog: _udeladt, ...udenSprog } = LEVERANDOER;
    await assertSucceeds(set(ref(db, levSti("sprog-mangler")), udenSprog));
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

  it("afviser et ukendt felt", async () => {
    const db = somIndkoeber();
    await assertFails(
      set(ref(db, levSti("ekstra")), { ...LEVERANDOER, rabatPct: 12 }));
  });

  it("⚠ SKIVE 4B — kræver leverandoerer.skriv, IKKE indkoeb.skriv alene", async () => {
    /* Leverandøren er fælles platform-masterdata for Fleet, Facility og
       Procure (Model B, Korrektion 3) — ejerskabet er ikke længere Indkøbs.
       En rolle der kan registrere et indkøb, kan derfor IKKE længere pr.
       automatik oprette den leverandør indkøbet kræver: de to permissions
       er nu adskilte, og det er en bevidst indskrænkning i forhold til
       modellen før 4B (som havde 4 skrivende roller på begge — samme
       fordeling som i dag, men nu via sit eget navn). */
    const kunIndkoeb = medPerms("u-kun-indkoeb", [PERM.indkoebSkriv]);
    await assertFails(set(ref(kunIndkoeb, levSti("naegtet-indkoeb")), LEVERANDOER));

    const uden = medPerms(
      "u-uden-lev",
      ALLE_PERMS.filter((p) => p !== PERM.leverandoererSkriv),
    );
    await assertFails(set(ref(uden, levSti("naegtet-alle")), LEVERANDOER));

    const kunLev = medPerms("u-kun-lev", [PERM.leverandoererSkriv]);
    await assertSucceeds(set(ref(kunLev, levSti("tilladt-lev")), LEVERANDOER));
  });

  it("⚠ SKIVE 4B — er IKKE længere lukket for en tenant uden indkøbsmodulet", async () => {
    /* Model B: noden er nu en fuldt ugatet base-node, ligesom `fakturaer` og
       `satser` — elleve skærme uden for Procure læste den allerede før 4B og
       fik permission-denied. En tenant uden `moduler.indkoeb` skal nu kunne
       læse OG skrive noden, hvis brugeren har leverandoerer.laes/.skriv;
       modulklausulen er fjernet fra begge sider af reglen. */
    const skriver = somIndkoeber("u-udenmodul", UDEN_MODUL);
    await assertSucceeds(set(ref(skriver, levSti("ny", UDEN_MODUL)), LEVERANDOER));

    const laeser = medPerms("u-udenmodul-laes", [PERM.leverandoererLaes], UDEN_MODUL);
    await assertSucceeds(get(ref(laeser, levSti(LEV, UDEN_MODUL))));
  });

  it("⚠ SKIVE 4B — leverandoerer.laes kræves for læsning", async () => {
    const uden = medPerms(
      "u-uden-laes",
      ALLE_PERMS.filter((p) => p !== PERM.leverandoererLaes),
    );
    await assertFails(get(ref(uden, levSti(LEV))));

    const med = medPerms("u-med-laes", [PERM.leverandoererLaes]);
    await assertSucceeds(get(ref(med, levSti(LEV))));
  });

  it("⚠ SKIVE 4B — opret, redigér og deaktiver via samme skriveflade", async () => {
    /* Ingen ny Cloud Function: opret, redigér og deaktiver går alle gennem
       samme .write-regel, som gem() i skriv.js allerede rammer med
       flet:true (update, ikke set). */
    const db = somIndkoeber("u-crud");
    const id = "lv-crud";
    await assertSucceeds(set(ref(db, levSti(id)), { ...LEVERANDOER, navn: "CRUD Testleverandør" }));
    await assertSucceeds(set(ref(db, levSti(`${id}/kontaktTelefon`)), "70 70 70 70"));
    await assertSucceeds(set(ref(db, levSti(`${id}/aktiv`)), false));
  });

  it("⚠ SKIVE 4B — en deaktiveret leverandør kan ikke hardslettes", async () => {
    /* newData.exists()-leddet (beslutning 53) gælder uændret for den
       deaktiverede post — deaktivering er IKKE en ny slettevej. */
    const db = somIndkoeber("u-hardslet");
    const id = "lv-hardslet";
    await set(ref(db, levSti(id)), { ...LEVERANDOER, aktiv: false });
    await assertFails(set(ref(db, levSti(id)), null));
  });

  /* ⚠ SUPPLIER PORTAL — DENNE VISER KUN, DEN AFGØR INTET. Se
     firebase.rules.json's egen note ved feltet: adgangen håndhæves
     udelukkende af leverandoerPortalAdgang (test/rules.tenant.test.mjs),
     og portalAdgang.enabled er derfor kun en administrativ visning oven på
     resten af leverandørkortet — samme skriverettighed, ikke en ny. */
  it("portalAdgang.enabled er blot endnu et felt, gated af leverandoerer.skriv", async () => {
    const db = somIndkoeber();
    await assertSucceeds(set(ref(db, levSti("portal-ok")),
      { ...LEVERANDOER, portalAdgang: { enabled: true } }));
    await assertSucceeds(set(ref(db, levSti("portal-slukket")),
      { ...LEVERANDOER, portalAdgang: { enabled: false } }));
  });

  it("⚠ portalAdgang KRÆVER enabled, OG INTET ANDET FELT", async () => {
    /* ⚠ ET TOMT OBJEKT ER IKKE DEN RIGTIGE PRØVE — RTDB skriver aldrig et
       tomt objekt; en skrivning uden børn er en no-op, og assertFails ville
       fejle af den forkerte grund (posten ville bare mangle portalAdgang
       helt, hvad reglen slet ikke kræver). Objektet skal have ET barn der
       ikke er "enabled", for at ramme hasChildren(['enabled']) selv. Se
       samme fælde i test/rules.indberetninger.test.mjs' ingenOmkostning. */
    const db = somIndkoeber();
    await assertFails(set(ref(db, levSti("portal-mangler-enabled")),
      { ...LEVERANDOER, portalAdgang: { status: "aktiv" } }));
    await assertFails(set(ref(db, levSti("portal-ikke-bool")),
      { ...LEVERANDOER, portalAdgang: { enabled: "ja" } }));
    await assertFails(set(ref(db, levSti("portal-ekstra")),
      { ...LEVERANDOER, portalAdgang: { enabled: true, status: "aktiv" } }));
  });

  it("⚠ SKIVE 4B — tenant-isolation: Tenant A kan ikke læse eller skrive Tenant B's leverandører", async () => {
    /* Fuld adgang i EGEN tenant (T), for at vise at afvisningen kommer af
       tenant-grænsen og ikke af manglende permission. */
    const somA = medPerms(
      "u-tenant-a", [PERM.leverandoererLaes, PERM.leverandoererSkriv], T,
    );
    await assertFails(get(ref(somA, levSti(LEV, UDEN_MODUL))));
    await assertFails(
      set(ref(somA, levSti("fra-a", UDEN_MODUL)), { ...LEVERANDOER, navn: "Ulovligt fra A" }),
    );
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
    dato: 1786831200000, leverandoerId: LEV,
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

/* ══════════════════════════════════════════════════════════════════════
   SUPPLIER PORTAL — leverandoerPortalBrugere, den læsbare pr.-tenant
   spejling af leverandoerPortalAdgang. Se rules.tenant.test.mjs for
   AUTORITETENS egen (fulde) lukkethed.
   ══════════════════════════════════════════════════════════════════════ */
describe("leverandoerPortalBrugere — spejlingen, kun til visning", () => {
  const SPEJLING = { email: "ekstern@test.invalid", navn: "Ekstern Bruger", aktiv: true, oprettetMs: 1786912716050 };

  it("⚠ INGEN KLIENT KAN SKRIVE DEN — kun leverandoerPortalInviter/-Deaktiver", async () => {
    const db = medPerms("u-forsoeg-skriv", [PERM.leverandoererSkriv, PERM.leverandoererLaes]);
    await assertFails(
      set(ref(db, sti(`leverandoerPortalBrugere/${LEV}/uid-ekstern-1`)), SPEJLING));
  });

  it("en admin med leverandoerer.laes kan LÆSE spejlingen efter en Admin SDK-skrivning", async () => {
    await miljoe.withSecurityRulesDisabled(async (ctx) => {
      await set(ref(ctx.database(), sti(`leverandoerPortalBrugere/${LEV}/uid-ekstern-2`)), SPEJLING);
    });
    const db = medPerms("u-laes-brugere", [PERM.leverandoererLaes]);
    const snap = await assertSucceeds(get(ref(db, sti(`leverandoerPortalBrugere/${LEV}/uid-ekstern-2`))));
    assert.equal(snap.val().email, "ekstern@test.invalid");
  });

  it("⚠ UDEN leverandoerer.laes AFVISES LÆSNINGEN", async () => {
    const uden = medPerms("u-uden-laes-brugere",
      ALLE_PERMS.filter((p) => p !== PERM.leverandoererLaes));
    await assertFails(get(ref(uden, sti(`leverandoerPortalBrugere/${LEV}/uid-ekstern-2`))));
  });

  it("⚠ TENANT-ISOLATION: en admin i en ANDEN tenant kan ikke læse denne tenants spejling", async () => {
    await miljoe.withSecurityRulesDisabled(async (ctx) => {
      await set(ref(ctx.database(), `tenants/${UDEN_MODUL}/leverandoerPortalBrugere/${LEV}/uid-ekstern-3`), SPEJLING);
    });
    const somA = medPerms("u-tenant-a-brugere", [PERM.leverandoererLaes], T);
    await assertFails(get(ref(somA, `tenants/${UDEN_MODUL}/leverandoerPortalBrugere/${LEV}/uid-ekstern-3`)));
  });
});

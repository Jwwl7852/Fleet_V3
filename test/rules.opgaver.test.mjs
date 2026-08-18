/* test/rules.opgaver.test.mjs
 * Beslutning 21: opgaver.art, håndhævet af serveren.
 *
 * ⚠ HVORFOR DEN HER FIL BLEV SKREVET.
 * Da `art` blev gjort påkrævet, kørte hele suiten grønt med det samme — fordi
 * de eksisterende testfiler tilfældigvis allerede skrev `art: "vaerksted"` med
 * i deres opgaveposter. Suiten bekræftede altså kun reglens LYKKELIGE
 * tilfælde. En regel der kun er bekræftet i sit lykkelige tilfælde, er ikke
 * afprøvet — det står i rules.division.test.mjs' eget hoved, og det gjaldt
 * her.
 *
 * Filen tester derfor det reglen skal NÆGTE: en opgave uden art, og en opgave
 * med `langtur`, som netop IKKE er en gyldig art (se beslutning 21).
 *
 * Kør:  npm run test:rules
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import { ref, set, update } from "firebase/database";
import { permStrengFraRolle } from "../src/fleet/permissions.js";
import { DEMO_OPGAVER } from "../src/fleet/demo-opgaver.js";
import { ALLE_OPGAVE_ARTER } from "../src/fleet/opgaver.js";
import { ALLE_PRIORITETER } from "../src/fleet/prioritet.js";

/* Egen tenant: node --test kører testfilerne parallelt. */
const TENANT = "vognmandOpg";
let miljoe;

const som = (uid, rolle = "admin") =>
  miljoe.authenticatedContext(uid, {
    tenant: TENANT, rolle, perms: permStrengFraRolle(rolle),
  }).database();

const sti = (id) => `tenants/${TENANT}/opgaver/${id}`;

/** En gyldig opgave uden art — arten lægges på pr. test. */
/* ⚠ startMs, IKKE dato. Fixturet skrev `dato` — det samme felt indekset
   navngav og som ingen post har. Noden kraever nu startMs, fordi opgaven
   RESERVERER sin ressource og et vindue skal kunne regnes. */
const opgave = (ekstra = {}) => ({
  division: "gods",
  status: "planlagt",
  startMs: 1786000000000,
  estimeretMin: 90,
  beskrivelse: "Serviceeftersyn 30.000 km",
  ...ekstra,
});

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-opgaver",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync("firebase.rules.json", "utf8"),
    },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), `tenants/${TENANT}/_findes`), true);
  });
});

after(async () => {
  await miljoe?.cleanup();
});

describe("beslutning 21 — art på opgaver", () => {
  it("accepterer hver af de gyldige arter", async () => {
    const db = som("admin-opg");
    for (const art of ALLE_OPGAVE_ARTER) {
      await assertSucceeds(set(ref(db, sti(`o-${art}`)), opgave({ art })));
    }
  });

  /* Kataloget i fleet/opgaver.js og reglen skal beskrive det samme. Tilføjer
     nogen en art i den ene uden den anden, falder den her. */
  it("kender præcis de arter kataloget kender", async () => {
    assert.deepEqual([...ALLE_OPGAVE_ARTER].sort(), ["facility", "vaerksted"]);
  });

  it("afviser en opgave HELT uden art", async () => {
    const db = som("admin-opg");
    await assertFails(set(ref(db, sti("o-uden-art")), opgave()));
  });

  /* Den vigtigste afvisning i filen. `langtur` var den art README foreslog,
     før beslutning 16 gjorde den til en dublet af en etape. Bliver den gyldig
     igen, står en transportstrækning to steder — og så er vi tilbage ved
     DE-QR 777 mod DE-KL 404. */
  it("afviser 'langtur' — en langtur er en etape, ikke en opgave", async () => {
    const db = som("admin-opg");
    await assertFails(set(ref(db, sti("o-langtur")), opgave({ art: "langtur" })));
  });

  it("afviser ukendte og forkert formede arter", async () => {
    const db = som("admin-opg");
    for (const art of ["Vaerksted", "VAERKSTED", "vaerksted ", "", "vaerksted,facility", "service"]) {
      await assertFails(
        set(ref(db, sti("o-ugyldig")), opgave({ art })),
        `art="${art}" burde afvises`
      );
    }
  });

  it("afviser art som noget andet end en streng", async () => {
    const db = som("admin-opg");
    for (const art of [true, 1, null]) {
      await assertFails(set(ref(db, sti("o-type")), opgave({ art })));
    }
  });

  /* Division var påkrævet før beslutning 21 og er det stadig. Arten erstatter
     den ikke: en opgave er en TRANSAKTION og hører til én afdeling, mens
     arten siger hvad arbejdet udføres på. */
  it("kræver stadig division ved siden af art", async () => {
    const db = som("admin-opg");
    const uden = { ...opgave({ art: "vaerksted" }) };
    delete uden.division;
    await assertFails(set(ref(db, sti("o-uden-div")), uden));
  });

  it("afviser at arten fjernes ved en opdatering", async () => {
    const db = som("admin-opg");
    await assertSucceeds(set(ref(db, sti("o-fjern")), opgave({ art: "vaerksted" })));
    await assertFails(update(ref(db, sti("o-fjern")), { art: null }));
  });

  it("afviser at arten ændres til noget ugyldigt ved en opdatering", async () => {
    const db = som("admin-opg");
    await assertSucceeds(set(ref(db, sti("o-skift")), opgave({ art: "vaerksted" })));
    await assertFails(update(ref(db, sti("o-skift")), { art: "langtur" }));
    await assertSucceeds(update(ref(db, sti("o-skift")), { art: "facility" }));
  });

  /* Reglerne skal kunne forespørges på art — ellers kan Disponering ikke
     hente dagens værkstedsopgaver uden at hente hele noden ned. Et manglende
     .indexOn FEJLER ikke; det henter bare alt og advarer i konsollen. */
  it("⚠ INDEKSERER FELTER DER FAKTISK FINDES PÅ EN OPGAVE", () => {
    /* Her stod at .indexOn skulle indeholde "dato". Det gjorde det — og
       INGEN opgave har feltet: de bærer startMs. Et indeks på et felt der
       ikke findes, koster ingenting og beskytter ingenting, og den dag
       nogen sorterer på startMs, henter RTDB hele noden ned og sorterer i
       klienten: en advarsel i konsollen og en regning i stilhed.

       Det overlevede fordi ingen skærm forespurgte på noden — den var
       demo-drevet, og noden stod tom. Prøven spørger nu om DATAENE. */
    const regler = JSON.parse(
      readFileSync("firebase.rules.json", "utf8")
        .split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith("//")).join(String.fromCharCode(10))
    );
    const indeks = regler.rules.tenants.$tenantId.opgaver[".indexOn"];
    assert.ok(indeks.includes("art"), ".indexOn mangler art");
    assert.ok(indeks.includes("startMs"), ".indexOn mangler startMs");
    assert.ok(!indeks.includes("dato"), "dato er tilbage — intet felt hedder det");

    /* Og hvert indekseret felt skal findes på en rigtig post. */
    const felter = new Set(DEMO_OPGAVER.flatMap((o) => Object.keys(o)));
    for (const f of indeks) {
      assert.ok(felter.has(f), `.indexOn indekserer "${f}", som ingen opgave har`);
    }
  });
});

describe("prioriteten er tre trin, og serveren kender dem", () => {
  /* ⚠ NODEN ER LUKKET MED $andet: false. Uden en regel for feltet kunne
     prioriteten slet IKKE skrives — skærmen ville vise en vælger, serveren
     ville afvise, og fejlen ville se ud som en manglende permission. */

  it("tager hvert af de tre trin", async () => {
    const db = som("uid-a");
    for (const p of ALLE_PRIORITETER) {
      await assertSucceeds(set(ref(db, sti(`pri-${p}`)),
        opgave({ art: "vaerksted", prioritet: p })));
    }
  });

  it("⚠ AFVISER LABELET. Værdien er \"normal\" — \"mellem\" er det man SKRIVER", async () => {
    /* Den her er hele grunden til at ordlisten står som en regex og ikke som
       et længdetjek. "mellem" er præcis det ord skærmen viser, og en
       udvikler der skriver værdien af efter labelet, rammer det. Slap
       reglen den igennem, ville posten hverken tælle som lav, mellem eller
       høj på Driftskalenderen — den ville forsvinde mellem tre tal der
       alle så rigtige ud. */
    await assertFails(set(ref(som("uid-a"), sti("pri-label")),
      opgave({ art: "vaerksted", prioritet: "mellem" })));
  });

  it("afviser en prioritet der slet ikke findes", async () => {
    await assertFails(set(ref(som("uid-a"), sti("pri-x")),
      opgave({ art: "vaerksted", prioritet: "kritisk" })));
    await assertFails(set(ref(som("uid-a"), sti("pri-tal")),
      opgave({ art: "vaerksted", prioritet: 1 })));
  });

  it("⚠ EN OPGAVE UDEN PRIORITET ER GYLDIG — 'ikke vurderet' er et svar", async () => {
    /* Feltet står med vilje IKKE i hasChildren. Krævede vi det, ville den der
       opretter, gætte — og så var alt "Mellem" og tallet ubrugeligt. Se
       prioritet.js: prioritetFor() svarer null, aldrig PRIORITET.normal. */
    await assertSucceeds(set(ref(som("uid-a"), sti("pri-uden")),
      opgave({ art: "vaerksted" })));
  });

  it("⚠ SAMME ORDLISTE TRE STEDER — ikke en afskrift der kan drive", () => {
    /* Tre noder bærer feltet: opgaver, indberetninger og plukordrer. Skrev
       de hver sin ordliste, ville Driftskalenderens kasser tælle to noder
       med hvert sit ordforråd — og de står side om side i den samme kø.

       Prøven læser REGELFILEN og holder den op mod prioritet.js. En regex
       over rå tekst ville have været sin egen fejlkilde; her parses JSON,
       efter at kommentarlinjerne er strippet (regelfilen bærer //-noter,
       som Firebase tillader og JSON.parse ikke).

       ⚠ Og den kigger på ALLE tre. Rettede nogen kun den ene, ville de to
       andre stå tilbage — det er præcis sådan de to demo-datasæt for én
       node opstod. */
    const regler = JSON.parse(
      readFileSync("firebase.rules.json", "utf8")
        .split(String.fromCharCode(10))
        .filter((l) => !l.trim().startsWith("//"))
        .join(String.fromCharCode(10))
    );
    const t = regler.rules.tenants.$tenantId;
    const steder = {
      opgaver: t.opgaver.$opgaveId.prioritet,
      indberetninger: t.indberetninger.$id.prioritet,
      plukordrer: t.plukordrer.$ordreId.prioritet,
    };
    /* "matches(/^(" og ")$/" skrives af tegn frem for som literaler, saa
       proeven ikke selv skal escape en regex den handler om. */
    const SKRAA = String.fromCharCode(47);
    const AABN = "matches(" + SKRAA + String.fromCharCode(94) + "(";
    const LUK = ")" + String.fromCharCode(36) + SKRAA;
    const forventet = [...ALLE_PRIORITETER].sort();
    for (const [node, regel] of Object.entries(steder)) {
      assert.ok(regel, `${node} har ingen regel for prioritet — noden er lukket`);
      /* Ordlisten hentes ved at klippe mellem to faste stumper frem for med
         en regex. En regex om en regex er sin egen fejlkilde — og fejler den,
         fejler den ved at finde INGENTING, hvilket ser ud som en manglende
         regel frem for en daarlig proeve. */
      const v = regel[".validate"];
      const a = v.indexOf(AABN);
      assert.ok(a >= 0, `${node}s prioritet valideres ikke mod en ordliste`);
      const trin = v.slice(a + AABN.length, v.indexOf(LUK, a));
      assert.deepEqual(trin.split("|").sort(), forventet,
        `${node} kender ${trin} — prioritet.js kender ${ALLE_PRIORITETER}`);
    }
  });
});

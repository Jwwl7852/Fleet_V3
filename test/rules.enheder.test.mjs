/* test/rules.enheder.test.mjs
 * Enheden i reglerne — WAREHOUSE.md etape 9.
 *
 * `enheder/<serienummer>`
 *
 * ⚠ NODEN ER `.write: false` FOR ALLE, og det er ikke en manglende rettighed.
 * `enheder` og `beholdning` bærer den SAMME kendsgerning — det ene som rækker,
 * det andet som et tal — og det er bevidst valgt. Prisen betales blandt andet
 * ved at der kun findes ÉN skriver: `bevaegelseskriv`, som lægger begge dele i
 * den samme atomiske opdatering. To skrivere ville være to sandheder.
 *
 * ⚠ OG NØGLEN ER SERIENUMMERET SELV. Derfor prøves tegnreglen her: RTDB
 * tillader hverken punktum, #, $, [, ] eller / i en nøgle, og en skrivning med
 * et af dem fejler et helt andet sted end der hvor fejlen blev lavet.
 *
 * Koer: npm test
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import { ref, set, get } from "firebase/database";
import { ALLE_PERMS, permStreng, permStrengFraRolle } from "../src/fleet/permissions.js";
import { ALLE_ENHED_TILSTANDE } from "../src/fleet/warehouse.js";

const T = "tenantEnheder";
const UDEN_MODUL = "tenantUdenWmsE";
const PLADS = "p-a-01-02";
const KUNDE = "k-nordisk";
const CARRIER = "CRR-100245";
const VARE = "v-tool-1256";

let miljoe;

const medPerms = (uid, perms, tenant = T) =>
  miljoe.authenticatedContext(uid, {
    tenant, rolle: "lagermedarbejder", perms: permStreng(perms),
  }).database();

const somRolle = (uid, rolle, tenant = T) =>
  miljoe.authenticatedContext(uid, {
    tenant, rolle, perms: permStrengFraRolle(rolle),
  }).database();

const sti = (rest, tenant = T) => `tenants/${tenant}/${rest}`;
const enhedSti = (id, tenant = T) => sti(`enheder/${id}`, tenant);

const PAA_LAGER = {
  vareId: VARE, kundeId: KUNDE, carrierId: CARRIER, tilstand: "paaLager",
};

/* ⚠ SKRIVER UDEN OM REGLERNE. Noden er `.write: false` for alle, så en post
   kan kun komme derind som funktionen ville lægge den — og det er præcis dét
   prøverne herunder skal kunne skelne fra en klientskrivning. */
const somServeren = (fn) => miljoe.withSecurityRulesDisabled(async (ctx) => {
  await fn(ctx.database());
});

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-enheder",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync("firebase.rules.json", "utf8"),
    },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, `tenants/${T}/_findes`), true);
    await set(ref(db, `tenants/${T}/moduler`), { warehouse: true, unitbooking: false });
    await set(ref(db, sti(`reolpladser/${PLADS}`)), {
      hal: "Hovedlager", reol: "A01", fag: "02", hylde: "1", plads: "1",
    });
    await set(ref(db, sti(`kunder/${KUNDE}`)), {
      navn: "Nordisk Transport", aktiv: true,
    });
    await set(ref(db, sti(`carriers/${CARRIER}`)), {
      type: "pallekasse", ejerforhold: "ejet", status: "paaLager",
      pladsId: PLADS, kundeId: KUNDE,
    });
    await set(ref(db, sti(`varer/${VARE}`)), {
      kundeId: KUNDE, varenummer: "TOOL-1256", navn: "Slagnøgle",
      enhed: "stk", sporing: "serie", aktiv: true,
    });

    await set(ref(db, `tenants/${UDEN_MODUL}/_findes`), true);
    await set(ref(db, `tenants/${UDEN_MODUL}/moduler`), { warehouse: false, unitbooking: true });
  });
});

after(async () => {
  await miljoe?.cleanup();
});

describe("⚠ INGEN KLIENT MÅ SKRIVE EN ENHED", () => {
  it("heller ikke med ALLE permissions", async () => {
    /* Det er ikke en manglende rettighed — det er vejen der er lukket. En
       enhed ændres SAMMEN med beholdningen og bevægelsen, i én atomisk
       opdatering. Kunne en klient skrive rækken alene, ville de to kilder
       være ude af trit i det øjeblik den gjorde det. */
    const db = medPerms("uid-alt", ALLE_PERMS);
    await assertFails(set(ref(db, enhedSti("SN-4711")), PAA_LAGER));
  });

  it("heller ikke lagermedarbejderen, som ellers må registrere bevægelser", async () => {
    const db = somRolle("uid-lager", "lagermedarbejder");
    await assertFails(set(ref(db, enhedSti("SN-4712")), PAA_LAGER));
    /* Og heller ikke et enkelt felt. En delvis skrivning ville være samme hul
       som en hel — carrierId ER hvor enheden ligger. */
    await assertFails(set(ref(db, `${enhedSti("SN-4712")}/carrierId`), "CRR-anden"));
  });

  it("der findes ingen enheder.skriv at give", () => {
    /* En permission der fandtes, ville før eller siden blive givet — og så
       ville nogen bygge en formular til den. Se `kasseudlaan`, hvor
       permissionen findes men vejen er lukket; her findes den slet ikke,
       fordi en enhed ikke er noget et menneske registrerer direkte. */
    assert.ok(!ALLE_PERMS.some((p) => /^enhed/.test(p)),
      "der er kommet en enheds-permission — så skal vejen ind afklares først");
  });

  it("enhver i tenanten må læse dem", async () => {
    /* Ingen enheder.laes: der findes ingen klassificeret satellit at
       kontrastere mod, og så ville permissionen ikke beskytte noget. Samme
       begrundelse som varer, bevægelser og carriers. */
    await assertSucceeds(get(ref(somRolle("uid-laes", "chauffoer"), sti("enheder"))));
  });
});

describe("modulet spærrer noden", () => {
  it("⚠ EN TENANT UDEN WAREHOUSE KAN HVERKEN LÆSE ELLER SKRIVE", async () => {
    const db = medPerms("uid-udenmodul", ALLE_PERMS, UDEN_MODUL);
    await assertFails(get(ref(db, sti("enheder", UDEN_MODUL))));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⚠ FORMEN LÆSES AF REGELFILEN, IKKE PRØVET MED EN SKRIVNING — OG HVORFOR

   `.validate` på en `.write: false`-node bliver ALDRIG kørt. En klient stoppes
   af `.write` før valideringen kommer til orde, og serveren skriver med
   admin-SDK'et, som går uden om reglerne i det hele taget. En prøve der
   forsøgte at skrive en ugyldig enhed, ville derfor enten fejle af den
   FORKERTE grund (klienten) eller lykkes (serveren) — og i begge tilfælde
   sige noget forkert om hvad der beskytter noden.

   Den rigtige håndhævelse er `valideEnhed()` inde i `bevaegelseskriv`; den
   prøves i `sporbarhed.test.mjs` mod adfærden. Reglerne herunder er et
   SIKKERHEDSNET for den dag noden bliver skrivbar, og prøverne holder fast i
   at nettet stadig er spændt ud. Samme forhold som `beholdning`, `grundlag` og
   `kasseudlaan` — se rules.warehouse.test.mjs.
   ══════════════════════════════════════════════════════════════════════════ */
describe("formen på en enhed", () => {
  const regler = readFileSync("firebase.rules.json", "utf8");
  const blok = regler.slice(regler.indexOf('"enheder": {'),
                            regler.indexOf('"plukordrer": {'));

  it("tager imod en hel enhed skrevet af serveren", async () => {
    await somServeren((db) => set(ref(db, enhedSti("SN-4711")), PAA_LAGER));
  });

  /* ⚠ TEGNREGLEN PÅ NØGLEN. RTDB tillader ikke punktum i en nøgle, men
     emulatoren afviser den før reglerne kommer til orde — derfor prøves
     mønstret på REGELFILEN frem for med en skrivning. Prøven her holder fast
     i at reglen FINDES; `sporbarhed.test.mjs` prøver den mod adfærden. */
  it("⚠ NØGLEN ER BUNDET AF ET MØNSTER", () => {
    assert.ok(blok.includes("$serienummer.matches(/^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/)"),
      "serienummeret er ikke bundet som noegle — et punktum ville give en ugyldig sti");
  });

  it("⚠ VAREN, KUNDEN OG BEHOLDEREN SLÅS OP", () => {
    /* En enhed der pegede på en vare der ikke findes, ville stå i sporet uden
       at kunne forklares. Referencerne er kontrollerede, som overalt ellers. */
    for (const felt of ["vareId", "kundeId", "carrierId"]) {
      const linje = blok.split(/\r?\n/).find((l) => l.includes(`"${felt}": {`));
      assert.ok(linje?.includes(".exists()"),
        `${felt} slaas ikke op — en enhed kan pege paa noget der ikke findes`);
    }
  });

  it("en afsendt enhed uden beholder går igennem", async () => {
    /* Ude af huset. Rækken bliver stående — sletter man den, kan ingen svare
       på hvor enheden blev af. */
    await somServeren((db) => set(ref(db, enhedSti("SN-4699")),
      { vareId: VARE, kundeId: KUNDE, tilstand: "afsendt" }));
  });

  it("tilstanden er en af de to — og reglen kender de samme to", () => {
    /* ⚠ MOENSTRET I REGELFILEN ER EN AFSKRIFT AF ENHED_TILSTAND. Kommer der
       en tredje tilstand i domaenet uden at reglen faar den, afviser en
       fremtidig skrivning noget skaermen viser som gyldigt. Proeven laeser
       derfor moenstret UD af reglen og sammenligner med domaenet. */
    assert.deepEqual(ALLE_ENHED_TILSTANDE, ["paaLager", "afsendt"]);
    const linje = blok.split(/\r?\n/).find((l) => l.includes('"tilstand": {'));
    const iReglen = linje?.match(/\(([a-zA-Z|]+)\)/)?.[1].split("|") || [];
    assert.deepEqual(iReglen.slice().sort(), ALLE_ENHED_TILSTANDE.slice().sort(),
      "reglen og domaenet kender ikke de samme tilstande");
  });

  it("⚠ ET UKENDT FELT AFVISES", () => {
    /* Et felt der tages imod og ikke bruges, får den næste til at tro at det
       virker. Samme regel som på bevægelsen. */
    assert.ok(blok.includes('"$andet": { ".validate": false }'),
      "noden tager imod hvad som helst ved siden af de kendte felter");
  });

  it("⚠ INGEN pladsId PÅ EN ENHED", () => {
    /* Hylden er BEHOLDERENS adresse, ikke enhedens — præcis som på
       beholdningsposten. To steder til samme kendsgerning driver fra hinanden
       første gang nogen flytter beholderen. */
    assert.ok(!blok.includes('"pladsId"'),
      "enheden har faaet en egen plads — hylden er beholderens adresse");
  });

  it("de påkrævede felter er der", () => {
    assert.ok(blok.includes("newData.hasChildren(['vareId', 'kundeId', 'tilstand'])"));
    /* ⚠ carrierId er IKKE påkrævet — en afsendt enhed har ingen. Kravet
       "i huset ⇒ beholder" står i valideEnhed() og håndhæves af funktionen;
       reglerne kan ikke se enhedens tilstand og carrierId i samme udtryk uden
       at gøre en afsendt enhed uskrivelig. */
    assert.ok(!blok.includes("'carrierId', 'tilstand'"),
      "carrierId er gjort paakraevet — saa kan en afsendt enhed ikke skrives");
  });

  it("noden er indekseret på det skærmene slår op i", () => {
    /* Uden indeks henter RTDB hele noden ned og sorterer i klienten — med en
       advarsel i konsollen og en regning i stilhed. */
    const linje = blok.split(/\r?\n/).find((l) => l.includes(".indexOn"));
    assert.ok(linje?.includes("vareId") && linje.includes("carrierId"),
      "vareId og carrierId er ikke indekseret");
  });
});

describe("bevaegelseskriv er den eneste vej ind", () => {
  const kilde = readFileSync("functions/index.js", "utf8");

  it("⚠ ENHEDEN SKRIVES I DEN SAMME OPDATERING SOM BEHOLDNINGEN", () => {
    /* Det er hele prisen ved at have enheden som eget objekt: RTDB's
       multi-path update er atomisk, så bevægelsen, saldoen og enhedsrækken
       lander sammen eller slet ikke. To kald ville være to udfald — og så
       ville `enhedsafvigelse()` vise en uenighed vi selv havde lavet. */
    /* ⚠ ANKERET ER bevaegelseskriv, ikke det første `const opdatering` i
       filen — der er flere funktioner med samme mønster, og en løs søgning
       ville prøve den forkerte. */
    const fn = kilde.slice(kilde.indexOf("export const bevaegelseskriv"));
    const blok = fn.slice(fn.indexOf("const opdatering = {"));
    const tilUpdate = blok.slice(0, blok.indexOf("await rod.update(opdatering)"));
    assert.ok(tilUpdate.includes("enheder/${enhedsvirkning.serienummer}"),
      "enhedsraekken skrives ikke i den samme opdatering");
    assert.ok(!/await rod\.child\(`enheder/.test(kilde),
      "enheden skrives et andet sted, i sit eget kald");
  });

  it("⚠ EN ENHED KAN IKKE MODTAGES TO GANGE", () => {
    /* Den anden modtagelse ville overskrive den første uden spor — enheden
       ville have været to steder, og kun det sidste ville stå. */
    assert.ok(kilde.includes("kraeverLedigtSerienummer"));
    assert.ok(kilde.includes("Én enhed kan ikke modtages to gange."));
  });

  it("⚠ MEN EN AFSENDT ENHED MÅ KOMME RETUR", () => {
    /* Det er ikke en dublet — det er den samme enhed der kommer hjem, og den
       skal have en ny linje i sporet frem for en afvisning. */
    const blok = kilde.slice(kilde.indexOf("kraeverLedigtSerienummer"));
    assert.ok(blok.slice(0, 1200).includes("ENHED_TILSTAND[enhedFoer.tilstand]?.iHuset"),
      "tjekket spoerger ikke om enheden er i huset — saa kan en retur ikke tages imod");
  });

  it("⚠ OG DEN KAN IKKE PLUKKES FRA EN BEHOLDER DEN IKKE LIGGER I", () => {
    /* Så peger sporet det forkerte sted resten af enhedens liv. */
    assert.ok(kilde.includes("kraeverEnhedenLiggerI"));
    /* Begge halvdele: at enheden findes, OG at den ligger det rigtige sted.
       Kun det første ville lade et pluk fra en fremmed beholder gå igennem. */
    assert.ok(kilde.includes("findes ikke på lageret"),
      "en ukendt enhed kan plukkes");
    assert.ok(kilde.includes("enhedFoer.carrierId !== enhedsvirkning.kraeverEnhedenLiggerI"),
      "der proeves ikke om enheden ligger i den beholder klienten siger");
  });

  it("politikken er den delte fil, ikke en afskrift", () => {
    /* virkningPaaEnhed() og valideEnhed() er de SAMME funktioner som skærmen
       bruger. En afskrift ville betyde at klienten og serveren kunne blive
       uenige om hvor enheden endte. */
    assert.ok(/virkningPaaEnhed, valideEnhed, ENHED_TILSTAND/.test(kilde));
    assert.ok(kilde.includes('} from "./delt/warehouse.js"'));
  });
});

/* test/referencetjek.test.mjs
 * Hvert referencefelt i reglerne er enten tjekket eller begrundet.
 *
 * ⚠ HVORFOR FILEN FINDES. Målt i beslutning 92: **51 af 72 referencefelter**
 * i `firebase.rules.json` havde et eksistenstjek, 21 havde ikke. Ingen af de
 * 21 stod noget sted — de var bare ikke skrevet, og forskellen på "besluttet"
 * og "glemt" kunne ikke ses.
 *
 * To af dem var forkerte i den udrullede base: `materialelinjer.lagerId`
 * pegede på `lager-hoved`, som ikke findes i nogen tenant, og
 * `ind-006.indkoebId` på `ink-2026-0844`, som heller ikke gør.
 *
 * ⚠ ET FELT UDEN TJEK ER IKKE NØDVENDIGVIS EN FEJL. Nogle KAN ikke få et:
 * målnoden findes ikke (`sager/`), feltet peger på et login og ikke på en
 * post, eller nodens `.write` er `false` — og så kan en klient slet ikke nå
 * `.validate`, mens Admin SDK går uden om den. Håndhævelsen ligger dér i
 * funktionen, som slår referencen op selv.
 *
 * Kravet er derfor ikke "alle skal tjekkes". Det er: **hvert felt skal have
 * taget stilling.** Et nyt referencefelt uden tjek og uden begrundelse gør
 * prøven rød, og så skal nogen vælge — frem for at opdage det i en base.
 *
 * Se beslutning 101.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const REGLER = JSON.parse(
  readFileSync("firebase.rules.json", "utf8")
    .replace(/^﻿/, "")
    .replace(/^\s*\/\/.*$/gm, "")
).rules;

const TENANT = REGLER.tenants.$tenantId;

/**
 * Felter der IKKE har et eksistenstjek — hvert med sin grund.
 *
 * ⚠ NØGLEN ER STIEN, IKKE FELTNAVNET. `bookingId` er tjekket på
 * `indberetninger` og ubetinget på `grundlag`; ét navn med én begrundelse
 * ville dække begge og skjule den ene.
 */
const UDEN_TJEK = {
  /* ---- Målnoden findes ikke ------------------------------------------- */
  "opgaver/$opgaveId/besoegId":
    "et besøg BLEV en opgave i beslutning 21. Feltet er et spor bagud til en "
    + "id-serie der ikke har en node længere.",
  "indkoeb/$indkoebId/besoegId": "samme spor bagud som på `opgaver`.",
  /* ⚠ RETTET — SKIVE 4C. Her stod "DEV har ingen bucket (Spark)". Det er
     ikke længere sandt: DEV fik en Storage-bucket i Skive 4C (bekræftet
     Blaze, ikke Spark — se ARKITEKTUR.md). Men feltet er stadig ubygget: et
     indkøbslinje-bilag er en ANDEN dokumenttype end fakturabilag (som 4C
     byggede) — Procure-vedhæftninger er eksplicit uden for 4C's scope, se
     docs/security-compliance/09_FILE_STORAGE_SECURITY_GATE.md, Gate B §2.
     Reglerne kan i øvrigt aldrig slå op i Storage — kun i RTDB. */
  "indkoeb/$indkoebId/bilagId":
    "et bilag ligger i Storage, som reglerne ikke kan slå op i. Feltet er "
    + "en Procure-indkøbslinjes vedhæftning — en anden dokumenttype end "
    + "fakturabilag (Skive 4C) og ikke bygget endnu.",

  /* ---- Vejen ind er lukket: funktionen slår referencen op -------------- */
  "etaper/$etapeId/bookingId":
    "`etaper` er `.write: false`; `etapeskift` og `bookingopret` skriver dem, "
    + "og bookingen findes fordi den skrives i SAMME opdatering.",
  "grundlag/$grundlagId/bookingId":
    "`grundlag` er `.write: false` for alle, også admin. `grundlagskriv` slår "
    + "forløbet op — og et periodegrundlag fra Warehouse har slet intet bookingId.",
  "grundlag/$grundlagId/erstatterId":
    "peger inden for `grundlag` selv, og `erstat()` kræver `nytId` op front, så "
    + "referencen går begge veje. Vejen ind er lukket.",
  "grundlag/$grundlagId/erstattetAfId": "samme to-vejs-reference som `erstatterId`.",
  "indkoebsbehov/$behovId/leverandoerId":
    "`indkoebsbehov` er `.write: false`; `behovskriv` er vejen ind.",
  "indkoebsbehov/$behovId/ordreId":
    "sættes af `ordreskriv` når behovet bliver til en ordre — i samme opdatering "
    + "som ordren selv.",
  "indkoebsordrer/$ordreId/leverandoerId":
    "`ordreskriv` slår leverandøren op og afviser med not-found. Noden er "
    + "`.write: false`, så `.validate` kan ikke nås af en klient.",
  "indkoebsordrer/$ordreId/linjer/$linjeId/behovId":
    "samme lukkede vej; linjen skrives sammen med sit behov.",
  "sensitive/sager/$sagId/beskeder/$id/partId":
    "`sensitive/sager` er `.write: false` for alle; `sagMailSend` slår "
    + "partId op mod DENNE sags egne `sager/$sagId/parter` og afviser med "
    + "invalid-argument hvis det ikke findes, før noget skrives. Skive 3D.",
  "indkoebsordrer/$ordreId/linjer/$linjeId/forbrugsvareId":
    "samme lukkede vej — `ordreskriv` kender varen.",
  "optaellinger/$optaellingId/bevaegelseId":
    "`optaellingskriv` skriver optællingen OG bevægelsen i én opdatering; "
    + "bevægelsen findes fordi den lige er skrevet.",
  /* ⚠ SKIVE 4C — DE TO HER PEGER IKKE PÅ EN ANDEN SAMLING, DE ER LÅST TIL
     DERES EGET PATH-WILDCARD. `dokumentId` skal være lig $dokumentId, og
     `fakturaId` skal være lig $fakturaId — en existence-tjek mod en
     fremmed node giver ikke mening for et felt der DEFINERES af sin egen
     sti. Vejen ind er desuden lukket: `dokumenter/$dokumentId` ligger under
     `fakturaer/$fakturaId`, som er `.write: false` — kun
     dokumentUploadInitier (Admin SDK) skriver posten, og den har ALLEREDE
     hentet og verificeret at fakturaen findes, før den skrives. */
  "fakturaer/$fakturaId/dokumenter/$dokumentId/dokumentId":
    "lig $dokumentId, ikke en fremmed reference. `dokumenter` er `.write: "
    + "false`; dokumentUploadInitier bygger id'et af sit eget push()-kald.",
  "fakturaer/$fakturaId/dokumenter/$dokumentId/fakturaId":
    "lig $fakturaId, ikke en fremmed reference. dokumentUploadInitier har "
    + "allerede hentet og verificeret fakturaen før dokumentet skrives.",
  /* ⚠ F.2 — SAMME FIGUR, EN SØSTER-NODE. opgaver/$opgaveId/dokumenter/
     $dokumentId er det samme mønster igen, under en anden forælder:
     dokumentId og opgaveId er begge låst til deres eget path-wildcard, og
     opgaveDokumentUploadInitier har allerede hentet og verificeret opgaven
     før dokumentet skrives — samme "fetch and verify"-vej som fakturaen. */
  "opgaver/$opgaveId/dokumenter/$dokumentId/dokumentId":
    "lig $dokumentId, ikke en fremmed reference. `dokumenter` er `.write: "
    + "false`; opgaveDokumentUploadInitier bygger id'et af sit eget push()-kald.",
  "opgaver/$opgaveId/dokumenter/$dokumentId/opgaveId":
    "lig $opgaveId, ikke en fremmed reference. opgaveDokumentUploadInitier "
    + "har allerede hentet og verificeret opgaven før dokumentet skrives.",
  /* ⚠ G.2 — SAMME FIGUR. indkoebId på et braendstofmatch-match er låst til
     sit eget path-wildcard ($indkoebId), ikke en fremmed reference — se
     samme begrundelse ved fakturaId/opgaveId ovenfor. Selve linjens
     EKSISTENS tjekkes stadig, i selve .validate-blokken (root.child(...)
     .child($indkoebId).exists()), bare ikke i dette felts EGEN celle. */
  "braendstofmatch/$indkoebId/indkoebId":
    "lig $indkoebId, ikke en fremmed reference. Selve eksistensen af "
    + "linjen tjekkes i blokkens egen hasChildren-betingelse.",

  /* ---- Feltet peger slet ikke på en post ------------------------------- */
  "statushaendelser/$etapeId/$meldingId/klientId":
    "telefonens eget id for meldingen, så en gensendelse bliver den SAMME post "
    + "og ikke en post mere. Det peger på ingenting — det er en nøgle appen fandt på.",
  "statushaendelser/$etapeId/$meldingId/stopId":
    "peger på et stop i den UDLEDTE rute (`planlagteStop()`), ikke på en node. "
    + "Ruten gemmes ikke — den regnes af etapens fra/til og grænseovergange, så "
    + "der er intet at slå op i. `valideMelding()` prøver den mod netop den rute.",
  "sensitive/sager/$sagId/beskeder/$id/providerId":
    "et opakt id UDBYDEREN tildeler en accepteret mail (functions/mail/) — det "
    + "peger ikke på en post i denne database, kun i udbyderens eget system. "
    + "Skive 3D.",
  "indkoebsordrer/$ordreId/mail/$sendRequestId/providerId":
    "SAMME FELT SOM ovenfor, samme grund — et opakt id UDBYDEREN tildeler en "
    + "accepteret ordremail (functions/mail/), ikke en reference til en post "
    + "i denne database. Skive 4D.",

  /* ---- Polymorf reference: typen afgør målet, ikke feltet selv --------- */
  "sager/$sagId/objektId":
    "objektType afgør hvilken node feltet peger i — en værkstedssag mod en "
    + "opgave, en facility-sag mod et aktiv. Et fast eksistenstjek her kan "
    + "ikke skifte mål med typen. Se beslutning 20/112.",
  "sensitive/sager/$sagId/aftaleforslag/$id/ressourceId":
    "ressourceType afgør målet — koeretoej, medarbejder, facilityAktiv, "
    + "lokation eller lager, præcis som `reservationer/<type>`. Samme grund "
    + "som objektId ovenfor.",
  "retention/legalHold/$id/objektId":
    "polymorf reference — objekt afgør hvilken node feltet peger i. Et "
    + "legal hold kan sættes på hvilken som helst post; et fast "
    + "eksistenstjek kan ikke skifte mål. Se beslutning 115.",

  /* ---- Et åbent spørgsmål, ikke en forglemmelse ------------------------- */
  "indberetninger/$id/materialelinjer/$linjeId/lagerId":
    "⚠ ÅBENT: `lagre` beskrives tre steder som reservedelslageret under Procure, "
    + "men `pricing.js` slår op i `satsark.lagre[lagerId]` for LAGEROPHOLD med "
    + "døgnsatser. To betydninger, én node. Beslutning 92 fik referencen til at "
    + "resolve (`lag-kolding`), men den peger nu på en opbevaringslokation — "
    + "semantikken er ikke afgjort, og et tjek ville låse den ene læsning fast.",
};

/** Hvert felt der ender på Id, med sin fulde sti. */
function referencefelter(node, sti = "") {
  const ud = [];
  if (!node || typeof node !== "object") return ud;
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith(".")) continue;
    const nySti = sti ? `${sti}/${k}` : k;
    if (!k.startsWith("$") && /Id$/.test(k)) {
      const udtryk = v?.[".validate"];
      const tjekket = typeof udtryk === "string"
        && (udtryk.includes("root.child") || udtryk.includes("newData.parent()"));
      ud.push({ sti: nySti, tjekket });
    }
    ud.push(...referencefelter(v, nySti));
  }
  return ud;
}

const FELTER = referencefelter(TENANT);
const UDEN = FELTER.filter((f) => !f.tjekket);

describe("Referencer i regelfilen", () => {
  it("der ER felter at prøve", () => {
    assert.ok(FELTER.length > 60,
      `kun ${FELTER.length} referencefelter fundet — er regelfilen læst rigtigt?`);
  });

  /**
   * ⚠ DEN HER ER KRAVET. Et felt uden tjek OG uden begrundelse er et felt
   * ingen har taget stilling til — og så er det tilfældigt om det peger på
   * noget.
   */
  it("⚠ HVERT FELT UDEN TJEK HAR EN BEGRUNDELSE", () => {
    const ubegrundede = UDEN.filter((f) => !UDEN_TJEK[f.sti]).map((f) => f.sti);
    assert.deepEqual(ubegrundede, [],
      "referencefelter uden eksistenstjek og uden begrundelse. Tilføj enten "
      + "`root.child(...).exists()` i reglen, eller en linje i UDEN_TJEK der "
      + "siger hvorfor det ikke kan lade sig gøre:\n  " + ubegrundede.join("\n  "));
  });

  /**
   * ⚠ OG LISTEN SKAL BLIVE KORTERE. Står et felt her fordi målnoden ikke
   * findes endnu, hører begrundelsen væk samme dag noden bygges — ellers er
   * listen en opgaveliste ingen læser igen.
   */
  it("⚠ INGEN BEGRUNDELSE FOR ET FELT DER ER TJEKKET", () => {
    const overflod = Object.keys(UDEN_TJEK)
      .filter((sti) => FELTER.find((f) => f.sti === sti)?.tjekket);
    assert.deepEqual(overflod, [],
      "feltet HAR et eksistenstjek — begrundelsen for at undlade det skal væk:\n  "
      + overflod.join("\n  "));
  });

  it("⚠ OG INGEN BEGRUNDELSE FOR ET FELT DER IKKE FINDES", () => {
    const spoegelser = Object.keys(UDEN_TJEK)
      .filter((sti) => !FELTER.some((f) => f.sti === sti));
    assert.deepEqual(spoegelser, [],
      "en begrundelse peger på et felt regelfilen ikke har:\n  " + spoegelser.join("\n  "));
  });

  it("⚠ EN BEGRUNDELSE ER EN SÆTNING, IKKE ET ORD", () => {
    for (const [sti, grund] of Object.entries(UDEN_TJEK)) {
      assert.ok(grund.length > 25, `${sti} har ingen rigtig begrundelse: "${grund}"`);
    }
  });

  /**
   * ⚠ FLERTALLET SKAL VÆRE TJEKKET. Uden det her ville prøven være grøn den
   * dag nogen fjernede hvert eneste opslag og skrev en begrundelse i stedet.
   */
  it("⚠ DE FLESTE FELTER ER FAKTISK TJEKKET", () => {
    const tjekket = FELTER.length - UDEN.length;
    assert.ok(tjekket >= FELTER.length * 0.6,
      `kun ${tjekket} af ${FELTER.length} referencefelter har et eksistenstjek`);
  });
});

describe("De to nye tjek", () => {
  const validate = (sti) =>
    sti.split("/").reduce((o, k) => (o == null ? o : o[k]), TENANT)?.[".validate"];

  /**
   * ⚠ EN FROSSET POST KAN IKKE RETTES BAGEFTER. Underskriften er write-once
   * (beslutning 52), så et `personId` der peger på ingenting, står der for
   * altid — på det ene dokument der skal kunne bevise noget.
   */
  it("⚠ underskrift.personId SKAL FINDES I personale", () => {
    assert.match(
      validate("sensitive/indberetninger/$id/underskrift/personId") || "",
      /child\('personale'\)/);
  });

  /**
   * ⚠ MEN FELTET ER STADIG VALGFRIT. En kunde uden Planning har udmærket
   * indberetninger; seedet nuller koblingen (beslutning 100). En `.validate`
   * køres ikke på et felt der ikke er der.
   */
  it("⚠ indberetninger.bookingId SKAL FINDES I bookinger", () => {
    assert.match(
      validate("indberetninger/$id/bookingId") || "",
      /child\('bookinger'\)/);
    const paakraevede = TENANT.indberetninger.$id[".validate"];
    assert.ok(!/hasChildren\([^)]*bookingId/.test(paakraevede),
      "bookingId er blevet påkrævet — så kan en kunde uden Planning ikke oprette en indberetning");
  });
});

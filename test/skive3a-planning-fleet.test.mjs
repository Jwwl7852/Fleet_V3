/* test/skive3a-planning-fleet.test.mjs
 * Skive 3A — UI-oprydning i Planning/Fleet/Facility. VIEW_COMPOSITION.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ HVORFOR FILEN FINDES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ingen datamodel, serverlogik eller forretningsregel er ændret i denne
 * skive — kun hvilken SKÆRM der viser hvad, og hvordan man kommer derhen.
 * Filen her prøver netop dét, som tekst mod de faktiske filer, efter samme
 * mønster som test/skive2c-dashboard.test.mjs og test/skive2b-menu.test.mjs:
 *
 *   A. Værkstedsopgaver har ét kanonisk hjem: Fleet Driftskalenderen.
 *      Planning Disponering viser dem ikke længere som et gitter.
 *   B. Fleets Arbejdskø er en kontekstuel del af Driftskalenderen (et
 *      panel), ikke længere en side man forlader kalenderen for at se.
 *   C. Forslag & godkendelse er ÉN komponent, brugt både som deep link
 *      (/booking/forslag/:id) og som panel fra Disponering.
 *   D. Facility er utilsigtet upåvirket, og de to planlægningsdialoger er
 *      harmoniseret på visning — ikke på feltskema.
 *
 * Ingen af prøverne her renderer React — samme begrænsning som resten af
 * repoet (node:test kan ikke importere .jsx). De læser filerne som tekst,
 * og de rene funktioner (kanSkifteEtape, tilgaengeligeEtapeHandlinger)
 * prøves direkte.
 *
 * Kør: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  kanSkifteEtape, tilgaengeligeEtapeHandlinger,
} from "../src/fleet/booking-state.js";
import { PERM, permStrengFraRolle } from "../src/fleet/permissions.js";
import { DEMO_ETAPER } from "../src/fleet/demo-etaper.js";

const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const laes = (sti) => readFileSync(sti, "utf8");
const kode = (sti) => udenKommentarer(laes(sti));

const DISPONERING = "src/moduler/booking/Disponering.jsx";
const FORSLAG = "src/moduler/booking/Forslag.jsx";
const FLEET = "src/moduler/flaade/Vaerkstedskalender.jsx";
const ARBEJDSKOE = "src/moduler/flaade/Arbejdskoe.jsx";
const FACILITY = "src/moduler/facility/Servicekalender.jsx";
const SERVICEDIALOG = "src/moduler/facility/Servicedialog.jsx";
const PLANLAEGDIALOG = "src/fleet/Planlaegdialog.jsx";
const APP = "src/App.jsx";
const som = (rolle) => permStrengFraRolle(rolle);

describe("A) Planning Disponering indeholder ikke værksteds-dagsgitter", () => {
  const d = kode(DISPONERING);

  it("ingen Planlaegdialog, flytOpgave, kanFlyttes eller Statusskifte", () => {
    assert.doesNotMatch(d, /Planlaegdialog/, "dagsgitterets planlægningsdialog er her endnu");
    assert.doesNotMatch(d, /flytOpgave\(/, "dagsgitterets træk-og-slip-skrivning er her endnu");
    assert.doesNotMatch(d, /kanFlyttes\(/, "dagsgitterets flyt-tjek er her endnu");
    assert.doesNotMatch(d, /<Statusskifte/, "opgavens statusknapper er her endnu");
  });

  it("ingen af dagsgitterets rene hjælpefunktioner (kun til at TEGNE gitteret)", () => {
    assert.doesNotMatch(d, /raekkerIVindue\(/);
    assert.doesNotMatch(d, /\bressourceId\(/);
    assert.doesNotMatch(d, /\bslutter\(/);
    assert.doesNotMatch(d, /DAG_FRA_TIME|DAG_TIL_TIME/);
  });

  it("ingen fane-/dag-vælger tilbage — kun ugevisningen", () => {
    assert.doesNotMatch(d, /Dag — værksted/);
    assert.doesNotMatch(d, /role="tablist"/);
  });

  it("⚠ MEN VÆRKSTEDET INDGÅR STADIG I KONFLIKTTJEKKET — det er ikke fjernet, kun ikke tegnet", () => {
    /* En bil på løftet skal stadig spærre en tur. reservationFraOpgave()
       bygger stadig værkstedets reservationer ind i tjekDisponering(). */
    assert.match(d, /reservationFraOpgave\(/,
      "værkstedsreservationer bygges ikke længere ind i konflikttjekket");
    assert.match(d, /vaerkstedsopgaver/);
  });
});

describe("B) Fleet Driftskalender indeholder fortsat værkstedsplanlægning", () => {
  const f = kode(FLEET);

  it("Planlaegdialog, flytOpgave og kanFlyttes er her", () => {
    assert.match(f, /Planlaegdialog/);
    assert.match(f, /flytOpgave\(/);
    assert.match(f, /kanFlyttes\(/);
  });

  /* ⚠ FLEET TARGET (masterbrief §1/§9, produktejer-review 2026-09-01)
     SUPERSEDERER RESTEN AF DENNE DESCRIBE-BLOK. De fem "kasser" og
     arbejdskøen flyttede ud af Driftskalenderen til Overblik.jsx, som er
     modulets nye forside — se ArbejdskoeIndhold.jsx/Overblik.jsx's egne
     hoveder. `<Statusskifte` og reservationsvisningen findes stadig, men
     ét lag dybere: Vaerkstedskalender.jsx importerer den delte
     `Haendelsespanel`-komponent (fleet/Haendelsespanel.jsx) i stedet for at
     definere den selv — samme "genbrug, ikke kopi"-disciplin som resten af
     filen allerede prøver for Forslag/ArbejdskoeIndhold. */
  it("statusskifte findes via den delte, importerede Haendelsespanel — ikke en lokal kopi", () => {
    assert.match(f, /import Haendelsespanel from "\.\.\/\.\.\/fleet\/Haendelsespanel\.jsx";/);
    assert.doesNotMatch(f, /function Haendelsespanel/,
      "Fleet har sin egen kopi af Haendelsespanel");
    const panel = kode("src/fleet/Haendelsespanel.jsx");
    assert.match(panel, /<Statusskifte/);
  });

  it("de fem kategorier findes stadig, uændret som katalog — nu kun i Arbejdskoe.jsx's UDSNIT", () => {
    const noegler = [...laes(ARBEJDSKOE).matchAll(/^\s{2}([a-z]+): \{/gm)].map((m) => m[1]);
    assert.deepEqual(noegler.sort(),
      ["afventer", "forsinkede", "kommende", "nye", "planlagt"].sort());
    /* ⚠ OG IKKE OGSÅ I Vaerkstedskalender.jsx — Driftskalenderen er ikke
       længere kasernes hjem, og en overlevende kopi ville kunne drive fra
       Arbejdskoe.jsx's egen, hvis nogen rettede den ene og glemte den
       anden. */
    assert.doesNotMatch(f, /KASSER\s*=/, "Fleet har stadig sit eget KASSER-katalog");
  });
});

describe("C) Fleet TARGET: Overblik.jsx er arbejdskøens hjem — Driftskalenderen har intet panel", () => {
  const overblik = laes("src/moduler/flaade/Overblik.jsx");
  const f = laes(FLEET);

  it("Overblik importerer den DELTE ArbejdskoeIndhold — ikke kopieret", () => {
    assert.match(overblik, /import \{ ArbejdskoeIndhold \} from "\.\/Arbejdskoe\.jsx";/);
    assert.doesNotMatch(udenKommentarer(overblik), /function ArbejdskoeIndhold/,
      "Overblik har sin egen kopi af komponenten");
    assert.match(overblik, /<ArbejdskoeIndhold[\s\S]{0,200}vis=\{vis\}/);
  });

  it("⚠ Driftskalenderen embedder IKKE LÆNGERE ArbejdskoeIndhold — arkitekturen flyttede med vilje", () => {
    assert.doesNotMatch(f, /ArbejdskoeIndhold/,
      "Vaerkstedskalender.jsx importerer stadig arbejdskøen — Fleet TARGET flyttede den til Overblik.jsx");
  });

  it("⚠ 'ÅBN I NYT VINDUE' LEVER VIDERE — nu fra Overblik, samme kanoniske rute", () => {
    /* Den anden halvdel af den gamle Delknap-genvej: et REELT vindue på den
       kanoniske, URL-bårne rute, fordi et nyt vindue ikke arver nogen
       React-tilstand. Se Arbejdskoe.jsx's egen note om vis/frem i URL'en. */
    assert.match(overblik, /window\.open\(\s*`\/flaade\/koe\?vis=/);
  });
});

describe("⚠ INGEN DUPLIKERET driftstal()-/ARBEJDSKØLOGIK", () => {
  const driftskalenderJs = laes("src/fleet/driftskalender.js");
  const f = udenKommentarer(laes(FLEET));
  const koe = udenKommentarer(laes(ARBEJDSKOE));

  it("driftstal()/sorterKoe() er defineret ét sted", () => {
    assert.match(driftskalenderJs, /export function driftstal/);
    assert.match(driftskalenderJs, /export function sorterKoe/);
    assert.doesNotMatch(f, /function driftstal\(/, "Fleet har sin egen kopi af driftstal()");
    assert.doesNotMatch(f, /function sorterKoe\(/, "Fleet har sin egen kopi af sorterKoe()");
    assert.doesNotMatch(koe, /function driftstal\(/, "Arbejdskø har sin egen kopi af driftstal()");
  });

  it("pagineringen (PR_SIDE/Sider) findes kun i ArbejdskoeIndhold", () => {
    assert.match(koe, /PR_SIDE/);
    assert.doesNotMatch(f, /PR_SIDE/, "Fleet har sin egen paginering af køen");
  });

  it("ArbejdskoeIndhold er den delte, kontrollerede komponent", () => {
    assert.match(koe, /export function ArbejdskoeIndhold\(\{ vis, saetVis, fremDage, saetFremDage/);
    assert.match(koe, /export default function Arbejdskoe\(\)/);
  });
});

describe("D) Forslag fra Disponering bruger samme eksisterende forslag-/godkendelseslogik", () => {
  const disp = kode(DISPONERING);
  const forslag = laes(FORSLAG);

  it("Disponering importerer ForslagOgReservation — har ingen egen kopi", () => {
    assert.match(disp, /import \{ ForslagOgReservation \} from "\.\/Forslag\.jsx";/);
    assert.doesNotMatch(disp, /function ForslagOgReservation/,
      "Disponering har sin egen kopi af godkendelsesoplevelsen");
  });

  it("Forslag.jsx eksporterer den delte komponent OG en tynd rute ovenpå", () => {
    assert.match(forslag, /export function ForslagOgReservation\(\{ bookingId \}\)/);
    assert.match(forslag, /export default function Forslag\(\)/);
    assert.match(forslag, /return <ForslagOgReservation bookingId=\{id\} \/>;/);
  });

  it("panelet i Disponering åbner den SAMME komponent, i en Dialog", () => {
    assert.match(disp, /<Dialog bred titel="Forslag & reservation" onLuk=\{\(\) => setForslagPanel\(null\)\}>/);
    assert.match(disp, /<ForslagOgReservation bookingId=\{forslagPanel\} \/>/);
  });

  it("den kanoniske komponent bruger stadig de fem tjek og skiftEtape — uændret", () => {
    assert.match(forslag, /tjekDisponering\(/);
    assert.match(forslag, /skiftEtape\(/);
  });
});

describe("⚠ FIRE-ØJNE: UÆNDRET EFTER OMLÆGNINGEN — samme funktioner, samme svar", () => {
  /* Ikke en gentagelse af test/booking.test.mjs's fulde dækning — det er
     en REGRESSIONSPRØVE for netop denne skive: at flytningen af Forslag
     ind i et panel ikke har rørt ved hvem der må hvad. Se booking.test.mjs
     for den fulde beskrivelse af beslutning 5. */
  const medForslag = DEMO_ETAPER.find((e) => e.forslag?.length);
  const somValgt = { ...medForslag, valgtForslagId: medForslag.forslag[0].id };

  it("disponenten kan foreslå", () => {
    /* Fra afventerPlan (ingen forslag endnu) skal han kunne sende forslaget
       — den overgang der kræver booking.foreslaa. */
    const handlinger = tilgaengeligeEtapeHandlinger("afventerPlan", som("disponent"));
    assert.ok(handlinger.some((h) => h.til === "afventerKoord"),
      "disponenten kan ikke sende et forslag til koordinator");
    assert.ok(permStrengFraRolle("disponent").includes(PERM.bookingForeslaa));
  });

  it("disponenten kan FORTSAT ikke godkende sit eget forslag", () => {
    const svar = kanSkifteEtape(somValgt, "reserveret", som("disponent"));
    assert.equal(svar.ok, false);
    assert.match(svar.aarsag, /booking\.godkend/);
  });

  it("koordinatoren kan fortsat godkende efter de eksisterende regler", () => {
    const svar = kanSkifteEtape(somValgt, "reserveret", som("koordinator"));
    assert.equal(svar.ok, true);
  });
});

describe("E) Deep links er bevaret", () => {
  const app = laes(APP);

  it("/booking/forslag/:id peger stadig på Forslag, og filen har et default-eksport", () => {
    assert.match(app, /<Route path="booking\/forslag\/:id" element=\{<Forslag \/>\} \/>/);
    assert.match(laes(FORSLAG), /export default function Forslag/);
  });

  it("/flaade/koe peger stadig på Arbejdskoe, og filen har et default-eksport", () => {
    assert.match(app, /<Route path="flaade\/koe" element=\{<Arbejdskoe \/>\} \/>/);
    assert.match(laes(ARBEJDSKOE), /export default function Arbejdskoe/);
  });

  it("⚠ Arbejdskoe-ruten binder stadig vis/frem til URL'en, ikke til en useState", () => {
    /* Ellers dør deep link'et: et nyt browservindue ("Åbn i nyt vindue")
       arver ingen React-tilstand og har kun URL'en at læse fra. */
    const koe = udenKommentarer(laes(ARBEJDSKOE));
    assert.match(koe, /useSearchParams\(\)/);
    assert.match(koe, /params\.get\("vis"\)/);
    assert.match(koe, /params\.get\("frem"\)/);
  });
});

describe("F) Facility er ikke utilsigtet påvirket", () => {
  const facility = kode(FACILITY);

  it("Servicekalenderen importerer intet fra booking/ eller fra Disponering/Forslags egne filer", () => {
    assert.doesNotMatch(facility, /from ["'].*booking\//,
      "Facility er koblet til Planning — det skal den ikke være");
  });

  it("Servicekalenderen bruger stadig sin egen Servicedialog, uændret feltskema", () => {
    assert.match(facility, /Servicedialog/);
    assert.match(laes(SERVICEDIALOG), /aktivId: valgtRessource\.aktivId \|\| null/);
  });

  it("⚠ DEN DELTE Gitterkalender ER IKKE RØRT PÅ EN MÅDE DER ÆNDRER FACILITY", () => {
    const delt = laes("src/fleet/Gitterkalender.jsx");
    assert.match(delt, /export default function Gitterkalender/);
    assert.match(facility, /Gitterkalender/);
  });
});

describe("G) Servicedialog og Planlaegdialog: harmoniseret VISNING, eget feltskema", () => {
  const service = laes(SERVICEDIALOG);
  const fleet = laes(PLANLAEGDIALOG);

  it("⚠ SAMME Formular-KOMPONENT — knapplacering og status-feedback er ALTID ens", () => {
    /* Formular (ui.jsx) tegner Gem/Annullér og Formularsvar ét sted; de to
       dialoger kan strukturelt ikke blive uenige om knapplacering, fordi
       ingen af dem tegner sine egne knapper. */
    assert.match(service, /<Formular onGem=\{gem\} gemmer=\{gemmer\}/);
    assert.match(fleet, /<Formular onGem=\{gem\} gemmer=\{gemmer\}/);
  });

  it("⚠ SKIVE 4B — leverandørhintet er en ENKELT, ÆRLIG STRENG — harProcure-tilstanden er væk", () => {
    /* 3A's to-tilstands-hint ("Procure endnu ikke tilkøbt" vs. "eget
       personale") sagde et sted at leverandørkartoteket hørte til Procure —
       usandt siden 4B gjorde leverandoerer til fælles platform-masterdata.
       Prop'en harProcure er fjernet fra begge skærme, og hintet er nu det
       samme uanset om Procure-modulet er købt. */
    assert.match(service, /hint="Tom betyder eget personale\."/);
    assert.match(fleet, /hint="Tom betyder eget værksted\."/);
    /* ⚠ KODEN, IKKE KOMMENTARERNE. Begge filers hoved forklarer MED VILJE at
       harProcure blev fjernet — det ord i en forklarende kommentar er ikke
       det samme som en levende reference i koden. */
    assert.ok(!/harProcure/.test(udenKommentarer(service)),
      "Servicedialog.jsx nævner stadig harProcure i selve koden");
    assert.ok(!/harProcure/.test(udenKommentarer(fleet)),
      "Planlaegdialog.jsx nævner stadig harProcure i selve koden");
  });

  it("⚠ MEN FELTSKEMAET ER STADIG DERES EGET — ingen fælles feltliste er tvunget igennem", () => {
    assert.match(service, /aktivId: valgtRessource\.aktivId \|\| null/,
      "Servicedialog har sit eget ressourcefelt");
    assert.match(fleet, /koeretoejId: post\.koeretoejId \|\| null/,
      "Planlaegdialog har sit eget ressourcefelt");
    assert.doesNotMatch(service, /koeretoejId/, "Servicedialog har fået værkstedets feltnavn");
    assert.doesNotMatch(fleet, /aktivId/, "Planlaegdialog har fået facilityets feltnavn");
  });
});

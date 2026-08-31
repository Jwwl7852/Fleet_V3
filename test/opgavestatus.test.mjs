/* test/opgavestatus.test.mjs
 * At skifte en opgaves status — beslutning 50.
 *
 * HVORFOR FILEN FINDES. Maskinen havde seks tilstande og NUL veje imellem dem:
 * `opgaveplanlaeg` opretter som planlagt eller afventer, `opgaveflyt` rører
 * ikke status, og `opgaver` er `.write: false`. En værkstedsopgave kunne
 * oprettes og flyttes, men aldrig meldes i gang eller udført — mens
 * Arbejdskøen og Driftskalenderen viste statusserne og talte dem op.
 *
 * ⚠ OG ET STATUSSKIFTE RØRER RESERVATIONEN. Det er hele grunden til at det
 * ikke bare er et felt: en annulleret opgave skal give bilen fri igen, og en
 * udført skal holde op med at spærre den. Regnestykket ligger derfor i
 * `opgaveplan-regler.js` og er rent — følgerne kan prøves uden en emulator.
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  OPGAVE_OVERGANGE, RESERVATION_VED,
  kanSkifteOpgave, statusOpdatering, afkortTil,
} from "../src/fleet/opgaveplan-regler.js";
import { ALLE_OPGAVE_STATUS, OPGAVE_STATUS } from "../src/fleet/opgaver.js";

const MIN = 60000;
const T = 60 * MIN;
const START = Date.UTC(2026, 7, 24, 8, 0, 0);

/** En værkstedsopgave: kl. 08, estimeret to timer, altså spærret til kl. 10. */
const opg = (x = {}) => ({
  art: "vaerksted", status: "igang",
  koeretoejId: "kt-1", arbejdstype: "service", beskrivelse: "Service",
  startMs: START, estimeretMin: 120,
  ...x,
});

const UID = "u-vaerkfoerer";
const STI = "reservationer/koeretoej/kt-1/res-op-1";

/* ══════════════════════════════════════════════════════════════════════════
   MASKINEN
   ══════════════════════════════════════════════════════════════════════════ */

describe("OPGAVE_OVERGANGE", () => {
  test("hver tilstand noden kender, står i maskinen", () => {
    /* En status uden en raekke ville vaere en post man kunne havne i og aldrig
       komme ud af — uden at nogen havde besluttet det. */
    for (const s of ALLE_OPGAVE_STATUS) {
      assert.ok(OPGAVE_OVERGANGE[s], `"${s}" har ingen række i maskinen`);
    }
  });

  test("og hvert MÅL er en status noden kender", () => {
    /* En tastefejl i et maal ville tilbyde et skift til en tilstand der ikke
       findes — og skaermen ville tegne en knap der altid blev afvist. */
    for (const [fra, maal] of Object.entries(OPGAVE_OVERGANGE)) {
      for (const til of maal) {
        assert.ok(ALLE_OPGAVE_STATUS.includes(til), `${fra} → "${til}" findes ikke`);
      }
    }
  });

  test("⚠ udfoert OG annulleret ER ENDESTATIONER", () => {
    /* Samme regel som at en returneret kasse ikke kan sendes ud igen. En vej
       tilbage ville betyde at et afsluttet forloeb kunne genaabnes, og saa er
       "udfoert" ikke et svar man kan regne paa. */
    assert.deepEqual(OPGAVE_OVERGANGE.udfoert, []);
    assert.deepEqual(OPGAVE_OVERGANGE.annulleret, []);
  });

  test("⚠ MAN KAN IKKE AF-STARTE ET ARBEJDE", () => {
    /* igang → planlagt findes ikke. Bilen HAR vaeret paa liften, og en status
       der sagde andet, ville beskrive noget der ikke skete. Er den startet ved
       en fejl, er svaret `annulleret` med en begrundelse. */
    assert.equal(OPGAVE_OVERGANGE.igang.includes("planlagt"), false);
    assert.equal(OPGAVE_OVERGANGE.igang.includes("annulleret"), true);
  });

  test("⚠ UDFØRT KAN KUN NÅS FRA igang ELLER klar_til_afhentning", () => {
    /* Et vaerkstedsbesoeg kan ikke meldes faerdigt uden at nogen har haft
       bilen paa liften — samme spaerring som klargoeringstrinnet paa et
       kasseudlaan, hvor genvejen fra `booket` til `udlaant` er lukket.
       ⚠ SUPPLIER PORTAL UDVIDEDE, IKKE SLÆKKEDE, DEN REGEL. Listen var
       tidligere PRÆCIS ["igang"]; klar_til_afhentning er nu med, men den
       kan SELV kun nås fra `igang` (se testen nedenfor) — invarianten
       "udført forudsætter at bilen har været i arbejde" holder stadig,
       den er blot transitiv gennem ét ekstra, valgfrit mellemtrin. */
    const kan = Object.entries(OPGAVE_OVERGANGE)
      .filter(([, maal]) => maal.includes("udfoert")).map(([fra]) => fra);
    assert.deepEqual(kan, ["igang", "klar_til_afhentning"]);
  });

  test("⚠ OG klar_til_afhentning KAN SELV KUN NÅS FRA igang", () => {
    const kan = Object.entries(OPGAVE_OVERGANGE)
      .filter(([, maal]) => maal.includes("klar_til_afhentning")).map(([fra]) => fra);
    assert.deepEqual(kan, ["igang"]);
  });

  test("afventer går begge veje mod igang — og det gør klar_til_afhentning nu også", () => {
    /* Arbejdet kan stoppe fordi en reservedel mangler, og fortsaette naar den
       kommer. Og et eftersyn efter leverandørens "klar til afhentning" kan
       finde mere der skal gøres — samme figur, en anden grund. */
    assert.ok(OPGAVE_OVERGANGE.igang.includes("afventer"));
    assert.ok(OPGAVE_OVERGANGE.afventer.includes("igang"));
    assert.ok(OPGAVE_OVERGANGE.igang.includes("klar_til_afhentning"));
    assert.ok(OPGAVE_OVERGANGE.klar_til_afhentning.includes("igang"));
  });

  test("⚠ MEN klar_til_afhentning ER IKKE EN ENDESTATION — leverandøren lukker aldrig selv", () => {
    /* Tillægskravets §11: leverandøren melder kun sin del af arbejdet
       færdig, aldrig den interne sag. Reservationen rører sig heller ikke
       her — bilen er stadig fysisk hos leverandøren. */
    assert.ok(OPGAVE_OVERGANGE.klar_til_afhentning.length > 0);
    assert.equal(RESERVATION_VED.klar_til_afhentning, "uaendret");
  });

  test("alt kan annulleres — undtagen det der allerede er afsluttet", () => {
    for (const [fra, maal] of Object.entries(OPGAVE_OVERGANGE)) {
      if (!maal.length) continue;
      assert.ok(maal.includes("annulleret"), `${fra} kan ikke annulleres`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   SVARET
   ══════════════════════════════════════════════════════════════════════════ */

describe("kanSkifteOpgave", () => {
  test("⚠ EN ENDESTATION FÅR SIN EGEN SÆTNING", () => {
    /* "Udfoert kan ikke blive til planlagt" forklarer ingenting. Sætningen
       skal sige HVORFOR, og hvad man saa goer i stedet. */
    const svar = kanSkifteOpgave(opg({ status: "udfoert" }), "planlagt");
    assert.equal(svar.ok, false);
    assert.match(svar.aarsag, /genåbnes ikke/);
    assert.match(svar.aarsag, /ny opgave/);
  });

  test("et ulovligt skift siger hvad der SÅ kan lade sig gøre", () => {
    /* Et nej uden en vej videre er en doer uden et skilt. */
    const svar = kanSkifteOpgave(opg({ status: "planlagt" }), "udfoert");
    assert.equal(svar.ok, false);
    assert.match(svar.aarsag, /Herfra kan den blive/);
    for (const s of OPGAVE_OVERGANGE.planlagt) {
      assert.match(svar.aarsag, new RegExp(OPGAVE_STATUS[s].label));
    }
  });

  test("samme status er ikke et skift", () => {
    const svar = kanSkifteOpgave(opg({ status: "igang" }), "igang");
    assert.equal(svar.ok, false);
    assert.match(svar.aarsag, /allerede/);
  });

  test("de lovlige skift er lovlige", () => {
    for (const [fra, maal] of Object.entries(OPGAVE_OVERGANGE)) {
      for (const til of maal) {
        assert.equal(kanSkifteOpgave(opg({ status: fra }), til).ok, true,
          `${fra} → ${til} blev afvist`);
      }
    }
  });

  test("en ukendt art og en ukendt status afvises", () => {
    assert.equal(kanSkifteOpgave({ art: "ukendt", status: "igang" }, "udfoert").ok, false);
    assert.equal(kanSkifteOpgave(opg(), "faerdig").ok, false);
    assert.equal(kanSkifteOpgave(null, "udfoert").ok, false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   RESERVATIONENS FØLGE — det der gør skiftet til en serversag
   ══════════════════════════════════════════════════════════════════════════ */

describe("⚠ EN UDFØRT OPGAVE HOLDER OP MED AT SPÆRRE", () => {
  test("meldes den færdig undervejs, afkortes reservationen til nu", () => {
    /* Reservationen loeb til kl. 10. Meldes besoeget faerdigt kl. 09, ser
       bilen ellers optaget ud i en time hvor den er fri — og saa leder den
       naeste disponent efter en bil der staar lige der. */
    const nu = START + 1 * T;
    const { opdatering } = statusOpdatering("op-1", opg(), "udfoert", { uid: UID, nu });
    assert.equal(opdatering[STI].til, nu);
    assert.equal(opdatering[STI].fra, START);
  });

  test("⚠ OG FLAGET ER VIGTIGERE END TALLET", () => {
    /* Uden `afkortet` laeses "til kl. 09" som en plan der altid sagde 09, og
       man kan ikke se forskel paa et besoeg der VAR kort og et der SLUTTEDE
       tidligt. Samme regel som dageUde() i Unitbooking. */
    const { opdatering } = statusOpdatering("op-1", opg(), "udfoert",
      { uid: UID, nu: START + 1 * T });
    assert.equal(opdatering[STI].afkortet, true);
  });

  test("⚠ MEN DEN FORLÆNGES ALDRIG", () => {
    /* Loeb arbejdet OVER sin tid, er "afkort til nu" i virkeligheden en
       UDVIDELSE — og fremtiden er maaske allerede givet vaek: en booking kan
       lovligt vaere startet da reservationen udloeb. En udvidelse ville lave
       et overlap datamodellen afviser, og gitteret ville tegne en konflikt der
       ikke er nogens skyld. Overskridelsen ses paa opgaven i stedet, hvor
       faktiskMin er stoerre end estimeretMin. */
    const nu = START + 5 * T;
    const { opdatering } = statusOpdatering("op-1", opg(), "udfoert",
      { faktiskMin: 300, uid: UID, nu });
    assert.equal(STI in opdatering, false,
      "reservationen blev rørt, selv om arbejdet løb tiden ud");
    assert.equal(opdatering["opgaver/op-1/faktiskMin"], 300);
  });

  test("⚠ MELDES DEN FÆRDIG FØR DEN BEGYNDTE, SPÆRREDE DEN ALDRIG NOGET", () => {
    /* Et vindue med til <= fra findes ikke i modellen. Reservationen fjernes
       frem for at blive et tomt interval ingen kan tolke. */
    const { opdatering } = statusOpdatering("op-1", opg(), "udfoert",
      { uid: UID, nu: START - 1 });
    assert.equal(opdatering[STI], null);
  });

  test("afkortTil svarer selv på de tre tilfælde", () => {
    const r = { fra: START, til: START + 2 * T };
    assert.equal(afkortTil(r, START + 1 * T), START + 1 * T);   // undervejs
    assert.equal(afkortTil(r, START + 9 * T), START + 2 * T);   // over tiden
    assert.equal(afkortTil(r, START), null);                    // før start
    assert.equal(afkortTil(null, START), null);
  });
});

describe("⚠ EN ANNULLERET OPGAVE GIVER BILEN FRI IGEN", () => {
  test("reservationen fjernes", () => {
    /* Samme regel som etapeskift haandhaever paa en annulleret tur: bliver den
       staaende, ser bilen optaget ud resten af dagen. */
    for (const fra of ["indberettet", "planlagt", "afventer", "igang"]) {
      const { opdatering } = statusOpdatering("op-1", opg({ status: fra }), "annulleret",
        { uid: UID, nu: START });
      assert.equal(opdatering[STI], null, `${fra} → annulleret frigav ikke`);
    }
  });

  test("og statussen skrives med", () => {
    const { opdatering } = statusOpdatering("op-1", opg(), "annulleret",
      { uid: UID, nu: START });
    assert.equal(opdatering["opgaver/op-1/status"], "annulleret");
  });
});

describe("de skift der IKKE rører reservationen", () => {
  test("igang, afventer og planlagt lader den stå", () => {
    /* Bilen er paa liften, ogsaa mens der ventes paa en reservedel. Estimatet
       er maaske forkert nu, men det GAETTES ikke — en disponent kan flytte
       opgaven, og det er en anden handling med sin egen funktion. */
    for (const til of ["igang", "afventer"]) {
      const { opdatering } = statusOpdatering("op-1", opg({ status: "planlagt" }), til,
        { uid: UID, nu: START + 30 * MIN });
      assert.equal(STI in opdatering, false, `${til} rørte reservationen`);
    }
  });

  test("kataloget siger hvad hvert skift gør ved den", () => {
    /* RESERVATION_VED staar for sig, saa foelgen kan LAESES frem for at skulle
       udledes af en if-kaede. */
    assert.equal(RESERVATION_VED.udfoert, "afkort");
    assert.equal(RESERVATION_VED.annulleret, "frigiv");
    assert.equal(RESERVATION_VED.igang, "uaendret");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   TRE TAL, TRE BETYDNINGER
   ══════════════════════════════════════════════════════════════════════════ */

describe("⚠ faktiskMin UDLEDES IKKE AF DET AFKORTEDE VINDUE", () => {
  test("en bil kan stå på liften i seks timer og blive arbejdet på i to", () => {
    /* Vinduet siger hvor laenge RESSOURCEN var optaget; faktiskMin hvor laenge
       ARBEJDET tog. Regnede vi det ene af det andet, ville ventetiden paa en
       reservedel blive til arbejdstid — og tallet bruges til at vurdere
       estimater. */
    const foer = opg({ estimeretMin: 6 * 60 });
    const nu = START + 6 * T;
    const { opdatering } = statusOpdatering("op-1", foer, "udfoert",
      { faktiskMin: 120, uid: UID, nu });
    assert.equal(opdatering["opgaver/op-1/faktiskMin"], 120);
    /* Vinduet loeb tiden ud og roeres ikke — de to tal er uafhaengige. */
    assert.equal(STI in opdatering, false);
  });

  test("⚠ OG DEN ER VALGFRI — null ER ET SVAR", () => {
    /* En vaerkfoerer der lukker ti opgaver, ved ikke noedvendigvis hvor laenge
       hver af dem tog, og et kraevet felt ville blive udfyldt med fiktion.
       kpi.opgaver.udenTidsregistrering TAELLER dem der mangler. */
    const { opdatering } = statusOpdatering("op-1", opg(), "udfoert",
      { uid: UID, nu: START + 1 * T });
    assert.equal("opgaver/op-1/faktiskMin" in opdatering, false);
    assert.equal(opdatering["opgaver/op-1/status"], "udfoert");
  });

  test("den skrives kun ved udfoert", () => {
    /* Et arbejde der er sat i gang, er ikke faerdigt, og en "faktisk tid" paa
       det ville vaere en maaling af noget der ikke er sket endnu. */
    const { opdatering } = statusOpdatering("op-1", opg({ status: "planlagt" }), "igang",
      { faktiskMin: 60, uid: UID, nu: START });
    assert.equal("opgaver/op-1/faktiskMin" in opdatering, false);
  });

  test("KPI-tallet der gør hullet synligt, findes stadig", () => {
    /* Er den taelling vaek, er feltets valgfrihed pludselig bare et hul ingen
       kan se — og saa er argumentet for at goere det valgfrit forsvundet. */
    const kpi = readFileSync("src/fleet/kpi-aggregering.js", "utf8");
    assert.match(kpi, /udenTidsregistrering/);
    assert.match(kpi, /status === "udfoert" && !Number\.isFinite\(o\.faktiskMin\)/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   EN OPGAVE UDEN VINDUE HAR INGEN RESERVATION AT RØRE
   ══════════════════════════════════════════════════════════════════════════ */

describe("uden estimat", () => {
  test("statussen skifter, og der røres ingen reservation", () => {
    /* reservationFraOpgave() kaster paa et manglende vindue frem for at gaette
       et, saa posten fik aldrig en reservation. En sti bygget paa et gaettet
       vindue ville ramme en ANDEN opgaves post. */
    const { opdatering, reservationssti } = statusOpdatering(
      "op-1", opg({ estimeretMin: null }), "annulleret", { uid: UID, nu: START });
    assert.equal(reservationssti, null);
    assert.equal(opdatering["opgaver/op-1/status"], "annulleret");
    assert.equal(Object.keys(opdatering).length, 1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   FACILITY BRUGER DEN SAMME MASKINE
   ══════════════════════════════════════════════════════════════════════════ */

describe("facility", () => {
  test("et servicebesøg annulleres og giver hele lokationen fri", () => {
    /* Arten flyttes ikke med, og maskinen kender den ikke: en opgave er en
       opgave. Ressourcen foelger arten gennem reservationFraOpgave(). */
    const foer = {
      art: "facility", status: "igang",
      lokationId: "lok-halb", beskrivelse: "Epoxygulv",
      startMs: START, estimeretMin: 720,
    };
    const { opdatering } = statusOpdatering("fs-1", foer, "annulleret",
      { uid: UID, nu: START });
    assert.equal(opdatering["reservationer/lokation/lok-halb/res-fs-1"], null);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   HÅNDHÆVELSEN
   ══════════════════════════════════════════════════════════════════════════ */

const kilde = readFileSync("functions/index.js", "utf8");
const blok = (() => {
  const start = kilde.indexOf("export const opgavestatus");
  assert.ok(start >= 0, "functions/index.js har ingen opgavestatus");
  const naeste = kilde.indexOf(String.fromCharCode(10) + "export const ", start + 1);
  return naeste < 0 ? kilde.slice(start) : kilde.slice(start, naeste);
})();

describe("opgavestatus håndhæver den samme maskine som skærmen tegner", () => {
  test("⚠ KALDER kanSkifteOpgave(), ikke en afskrift", () => {
    /* Skrev serveren sin egen udgave, ville skaermen tilbyde et skift der blev
       sagt nej til bagefter — uden at nogen kunne se hvorfor. */
    assert.ok(blok.includes("kanSkifteOpgave("), "maskinen prøves ikke");
    assert.ok(blok.includes("statusOpdatering("), "opdateringen bygges ikke ét sted");
  });

  test("⚠ MASKINEN LIGGER IKKE I FUNKTIONEN", () => {
    /* Laa foelgerne her, kunne de kun proeves ved at koere funktionen mod en
       emulator. Samme grund som beregnKpi() ikke regnes i jobbet. */
    assert.ok(!blok.includes("OPGAVE_OVERGANGE"),
      "funktionen har sin egen kopi af tilstandsmaskinen");
    assert.ok(!blok.includes("reservationer/"),
      "funktionen bygger selv reservationsstien i stedet for at bruge statusOpdatering()");
  });

  test("⚠ PERMISSIONEN, IKKE ROLLEN", () => {
    assert.match(blok, /perms\.includes\("\|opgaver\.skriv\|"\)/);
    assert.ok(!/rolle === "(admin|disponent|vaerkfoerer)"/.test(blok),
      "der spørges på rollen frem for på permissionen");
  });

  test("⚠ ABONNEMENT, TENANT OG MODUL PRØVES", () => {
    assert.ok(blok.includes('child("abonnement/status")'), "abonnementet prøves ikke");
    assert.ok(blok.includes('child("_findes")'), "tenanten prøves ikke");
    assert.ok(blok.includes("MODUL_FOR_ART"), "modulspærringen prøves ikke");
  });

  test("⚠ ALT LANDER I ÉN rod.update()", () => {
    /* Statussen og reservationens foelge sammen eller slet ikke. Landede kun
       den ene halvdel, ville en annulleret opgave efterlade en reservation der
       spaerrer en bil ingen har brug for. */
    assert.equal((blok.match(/await rod\.update\(/g) || []).length, 1,
      "der skrives i mere end ét kald");
  });

  test("⚠ faktiskMin PRØVES — noden er .write:false, så kontrollen ligger HER", () => {
    /* Reglen paa noden kraever isNumber() og >= 0, men den kan ikke naas af en
       klient laengere. Et negativt tal ville ellers staa i en rapport som en
       opgave der tog minus tid. */
    assert.match(blok, /faktiskMin/);
    assert.ok(blok.includes("< 0"), "der prøves ikke for negative minutter");
    assert.ok(blok.includes("Math.round("), "et brudt minuttal skrives råt");
  });

  test("⚠ SKIFTET LOGGES som et tilstandsskift", () => {
    assert.ok(blok.includes("logOpgave("), "skiftet logges ikke");
    assert.ok(blok.includes("AUDIT.tilstandsskift"),
      "skiftet logges som noget andet end et tilstandsskift");
  });

  test("⚠ STATUS KOMMER FRA KLIENTEN, MEN MASKINEN AFGØR", () => {
    /* Det er ikke det samme som at klienten SAETTER den: kanSkifteOpgave()
       staar imellem, og den kender kun de overgange der findes. */
    assert.match(blok, /kortStreng\(d\.status/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   SKÆRMENE — én knaprække, tre steder
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ KOMMENTARERNE VÆK FØRST.
 *
 * Første udgave af de to prøver nedenfor læste filerne råt — og faldt over
 * MINE EGNE noter: kommentaren der forklarer at knapperne tegnes af
 * `OPGAVE_OVERGANGE`, og den der siger at attrappen "Marker udført" er væk.
 * Begge er beskrivelser af at reglen er OVERHOLDT, og de blev læst som brud.
 *
 * Det er samme fejl som prøven der søgte efter `.fc-btn` i hele filen og fandt
 * en længere selektor: en prøve der leder det forkerte sted, er værre end
 * ingen — den fejler på det rigtige og fjerner grunden til at skrive noget ned.
 */
const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("Statusskifte er ét sted", () => {
  /* ⚠ SKIVE 3A — TO SKÆRME, IKKE TRE. Disponering.jsx viste `opgaver`-status
     kun for sit dagsgitter (værkstedet), som er flyttet til Fleet
     Driftskalenderen. Disponering handler nu udelukkende om ETAPER, hvis
     tilstand skifter gennem `etapeskift`/`skiftEtape` — ikke gennem
     `<Statusskifte>`, som er `opgaver`-nodens egen maskine. */
  const SKAERME = [
    "src/moduler/flaade/Vaerkstedskalender.jsx",
    "src/moduler/facility/Servicekalender.jsx",
  ];

  test("alle tre bruger den delte komponent", () => {
    for (const sti of SKAERME) {
      const s = readFileSync(sti, "utf8");
      assert.ok(s.includes("<Statusskifte"), `${sti} tegner ikke statusskiftet`);
      assert.ok(s.includes('from "../../fleet/Statusskifte.jsx"'),
        `${sti} henter komponenten et andet sted fra`);
    }
  });

  test("⚠ INGEN AF DEM HAR SIN EGEN KNAPRÆKKE", () => {
    /* Byggede hver skaerm sin egen, ville de foer eller siden vaere uenige om
       hvilke skift der findes — og den ene ville tilbyde et skift serveren
       afviser. */
    for (const sti of SKAERME) {
      const s = udenKommentarer(readFileSync(sti, "utf8"));
      assert.ok(!s.includes("OPGAVE_OVERGANGE"),
        `${sti} tegner knapperne af maskinen selv i stedet for gennem komponenten`);
      assert.ok(!s.includes("skiftOpgaveStatus("),
        `${sti} kalder serveren uden om den delte komponent`);
    }
  });

  test("⚠ KNAPPERNE TEGNES AF MASKINEN, ikke af en liste i komponenten", () => {
    /* En knap uden en overgang er en paen knap; en overgang uden en knap er en
       vej ingen kan finde. */
    const k = readFileSync("src/fleet/Statusskifte.jsx", "utf8");
    assert.ok(k.includes("OPGAVE_OVERGANGE[opgave.status]"),
      "komponenten har sin egen liste over skift");
    for (const s of ALLE_OPGAVE_STATUS) {
      /* Hver status skal have en etiket — ellers staar der en raa noegle paa
         en knap den dag maskinen faar en overgang mere. */
      assert.ok(OPGAVE_STATUS[s]?.label, `"${s}" har ingen etiket i kataloget`);
    }
  });

  test("⚠ DE DEAKTIVEREDE ATTRAPPER ER VÆK", () => {
    /* Driftskalenderen havde "Marker udført" og "Flyt" som graa knapper med
       begrundelsen at skrivningen hoerte i en Cloud Function. Begge findes nu,
       og en attrap ved siden af en rigtig knap er vaerre end foer. */
    const s = udenKommentarer(readFileSync("src/moduler/flaade/Vaerkstedskalender.jsx", "utf8"));
    assert.ok(!s.includes("Marker udført"), "attrappen står der stadig");
    assert.ok(!/Skrivning er ikke bygget/.test(s),
      "begrundelsen for en attrap der ikke findes længere, står stadig");
  });

  test("⚠ INGEN AF DEM SKRIVER SELV", () => {
    for (const sti of [...SKAERME, "src/fleet/Statusskifte.jsx"]) {
      const s = readFileSync(sti, "utf8");
      assert.ok(!/db\.ref\(/.test(s), `${sti} skriver uden om serveren`);
    }
  });

  test("⚠ INGEN BEGRUNDELSE PÅ VEJ MOD AUDITLOGGEN", () => {
    /* Allowlisten i audit-regler.js findes for at holde tastet tekst ude. En
       begrundelse fra en formular ville vaere fritekst; noten paa auditposten
       skrives af SERVEREN, af felter den selv kender. */
    const k = readFileSync("src/fleet/Statusskifte.jsx", "utf8");
    assert.ok(!/begrundelse/i.test(k.replace(/\/\*[\s\S]*?\*\//g, "")),
      "komponenten sender en begrundelse med");
  });
});

/* test/opgaveplan.test.mjs
 * "Planlæg aktivitet" — validering, svartolkning og håndhævelsen på serveren.
 *
 * ⚠ TO HALVDELE, OG DEN ANDEN ER DEN VIGTIGE.
 *
 * Første halvdel prøver `valideOpgaveplan()` som en almindelig ren funktion.
 * Anden halvdel læser `functions/index.js` SOM TEKST og spørger om
 * håndhævelsen — at funktionen faktisk kalder de samme filer som skærmen, at
 * den skriver i ÉN update(), og at den ikke overskriver en booking.
 *
 * At funktionerne findes er ikke det samme som at de håndhæves. Det står i
 * etapeskift.test.mjs' eget hoved, og det gælder her.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PLANSVAR, planBesked, tolkPlanfejl, valideOpgaveplan,
  PLANLAEGBAR_STATUS, MAKS_MINUTTER,
} from "../src/fleet/opgaveplan-regler.js";
import { ALLE_OPGAVE_STATUS, ALLE_ARBEJDSTYPER } from "../src/fleet/opgaver.js";
import { DELTE_FILER } from "../scripts/kopier-delt.mjs";

const gyldig = (o = {}) => ({
  art: "vaerksted",
  koeretoejId: "kt-012",
  division: "gods",
  arbejdstype: "service",
  status: "planlagt",
  beskrivelse: "Serviceeftersyn 30.000 km",
  startMs: 1787000000000,
  estimeretMin: 120,
  ...o,
});

describe("valideOpgaveplan", () => {
  it("godtager en fuld post", () => {
    const r = valideOpgaveplan(gyldig());
    assert.deepEqual(r.fejl, {});
    assert.equal(r.ok, true);
  });

  it("⚠ DIVISIONEN KRÆVES, OG DEN KAN IKKE UDLEDES AF ENHEDEN", () => {
    /* Beslutning 19 forbyder feltet på koeretoejer/, mens opgaver/ kræver det.
       Udfyldte formularen det ud fra bilen, ville vi genindføre præcis den
       kobling beslutningen fjernede — og sætningen siger det til brugeren. */
    const r = valideOpgaveplan(gyldig({ division: null }));
    assert.match(r.fejl.division, /kan ikke udledes af enheden/i);
  });

  it("⚠ VARIGHEDEN KRÆVES — uden den bliver enheden ikke spærret", () => {
    /* Uden estimeretMin har opgaven ingen slutning: reservationFraOpgave()
       kaster, og enheden ser FRI ud i disponeringen. En standardlængde ville
       spærre den i et tidsrum ingen har besluttet — samme holdning som den
       manglende momssats. */
    for (const v of [null, 0, -30, "halvanden time"]) {
      const r = valideOpgaveplan(gyldig({ estimeretMin: v }));
      assert.ok(r.fejl.estimeretMin, `${v} skulle afvises`);
    }
  });

  it("⚠ OG DEN HAR ET LOFT PÅ 90 DØGN", () => {
    /* Et besøg der varer længere, er ikke ét besøg — det er en enhed taget ud
       af drift, og den tilstand hører på enheden. Uden loftet kunne en
       tastefejl i minutfeltet spærre en bil i årevis, og fejlen ville kun
       kunne ses ved at åbne posten. */
    assert.equal(valideOpgaveplan(gyldig({ estimeretMin: MAKS_MINUTTER })).ok, true);
    assert.ok(valideOpgaveplan(gyldig({ estimeretMin: MAKS_MINUTTER + 1 })).fejl.estimeretMin);
  });

  it("⚠ KUN planlagt OG afventer KAN OPRETTES", () => {
    /* Kunne formularen sætte `udfoert` direkte, kunne et værkstedsbesøg meldes
       færdigt uden at nogen havde haft enheden på liften — samme fejl som
       kassens klargøringstrin, hvor genvejen er lukket med vilje. */
    for (const v of PLANLAEGBAR_STATUS) {
      assert.equal(valideOpgaveplan(gyldig({ status: v })).ok, true, v);
    }
    for (const v of ALLE_OPGAVE_STATUS.filter((x) => !PLANLAEGBAR_STATUS.includes(x))) {
      assert.ok(valideOpgaveplan(gyldig({ status: v })).fejl.status, `${v} skulle afvises`);
    }
  });

  it("⚠ KUN VÆRKSTED — facility har sin egen skærm på den SAMME node", () => {
    const r = valideOpgaveplan(gyldig({ art: "facility", koeretoejId: null, aktivId: "fa-1" }));
    assert.ok(r.fejl.art);
  });

  it("kræver en kendt arbejdstype", () => {
    assert.ok(valideOpgaveplan(gyldig({ arbejdstype: null })).fejl.arbejdstype);
    assert.ok(valideOpgaveplan(gyldig({ arbejdstype: "kaffe" })).fejl.arbejdstype);
    for (const t of ALLE_ARBEJDSTYPER) {
      assert.equal(valideOpgaveplan(gyldig({ arbejdstype: t })).ok, true, t);
    }
  });

  it("⚠ PRIORITETEN ER VALGFRI — tom er 'ikke vurderet', og det er et svar", () => {
    assert.equal(valideOpgaveplan(gyldig({ prioritet: null })).ok, true);
    assert.equal(valideOpgaveplan(gyldig({ prioritet: "hoej" })).ok, true);
    /* "mellem" er LABELET, ikke værdien. Den skal afvises begge steder. */
    assert.ok(valideOpgaveplan(gyldig({ prioritet: "mellem" })).fejl.prioritet);
  });

  it("⚠ LEVERANDØREN ER VALGFRI — ingen betyder eget værksted", () => {
    assert.equal(valideOpgaveplan(gyldig({ leverandoerId: null })).ok, true);
    /* Men en ukendt er en fejlstavning der ellers blev til et værksted ingen
       kan finde igen. Listen sendes kun med når kalderen HAR den. */
    assert.equal(valideOpgaveplan(gyldig({ leverandoerId: "lv-x" })).ok, true);
    assert.ok(valideOpgaveplan(gyldig({ leverandoerId: "lv-x" }),
      { leverandoerer: ["lv-daf"] }).fejl.leverandoerId);
  });

  it("slår enheden op når listen sendes med", () => {
    assert.ok(valideOpgaveplan(gyldig(), { enheder: ["kt-999"] }).fejl.koeretoejId);
    assert.equal(valideOpgaveplan(gyldig(), { enheder: ["kt-012"] }).ok, true);
  });

  it("kræver en beskrivelse, og højst 500 tegn", () => {
    assert.ok(valideOpgaveplan(gyldig({ beskrivelse: "  " })).fejl.beskrivelse);
    assert.ok(valideOpgaveplan(gyldig({ beskrivelse: "x".repeat(501) })).fejl.beskrivelse);
  });

  it("⚠ HVER SÆTNING ER EN SÆTNING, ikke et feltnavn", () => {
    /* Serveren afviser med den SAMME tekst, og den lander i en fejlboks hos
       brugeren. "division" ville ikke fortælle nogen hvad de skal gøre. */
    const r = valideOpgaveplan({});
    for (const [felt, tekst] of Object.entries(r.fejl)) {
      assert.ok(tekst.length > 12 && /[.!]$/.test(tekst),
        `${felt}: "${tekst}" er ikke en sætning`);
    }
  });
});

describe("svartolkningen", () => {
  it("⚠ EN AFVIST SKRIVNING ER IKKE EN NETVÆRKSFEJL", () => {
    /* permission-denied betyder at reglerne VIRKER. Oversat til "prøv igen"
       lærer brugeren at systemet er i stykker — se skriv.js. */
    assert.equal(tolkPlanfejl({ code: "functions/permission-denied" }).art, PLANSVAR.naegtet);
    assert.equal(tolkPlanfejl({ code: "unauthenticated" }).art, PLANSVAR.naegtet);
  });

  it("⚠ EN OPTAGET ENHED ER ET SVAR, OG SERVERENS TEKST BEHOLDES", () => {
    /* Den navngiver hvad der spærrer og hvornår. En generisk "kunne ikke
       gemmes" ville lade disponenten prøve igen med samme dato uden
       nogensinde at få at vide hvad der stod i vejen. */
    const r = tolkPlanfejl({
      code: "functions/failed-precondition",
      message: "Bil 104 er reserveret 18-08 kl. 08.00–16.00 af et værkstedsbesøg.",
    });
    assert.equal(r.art, PLANSVAR.konflikt);
    assert.match(r.besked, /Bil 104/);
  });

  it("en ukendt kode bliver til forbindelse", () => {
    assert.equal(tolkPlanfejl({ code: "unavailable" }).art, PLANSVAR.forbindelse);
    assert.equal(tolkPlanfejl({}).art, PLANSVAR.forbindelse);
  });

  it("hver art der ikke bærer serverens tekst, har sin egen besked", () => {
    for (const art of [PLANSVAR.naegtet, PLANSVAR.ugyldig, PLANSVAR.forbindelse, PLANSVAR.demo]) {
      assert.ok(planBesked(art), art);
    }
    /* ⚠ IKKE konflikt: dér ER serverens tekst svaret. En generisk besked ville
       overskrive den ene ting brugeren har brug for at vide. */
    assert.equal(planBesked(PLANSVAR.konflikt), null);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   HÅNDHÆVELSEN

   At funktionerne findes er ikke det samme som at de håndhæves.
   ══════════════════════════════════════════════════════════════════════════ */

const kilde = readFileSync("functions/index.js", "utf8");
const blok = (() => {
  const start = kilde.indexOf("export const opgaveplanlaeg");
  assert.ok(start >= 0, "functions/index.js har ingen opgaveplanlaeg");
  const naeste = kilde.indexOf(String.fromCharCode(10) + "export const ", start + 1);
  return naeste < 0 ? kilde.slice(start) : kilde.slice(start, naeste);
})();

describe("opgaveplanlaeg håndhæver det skærmen viser", () => {
  it("⚠ KALDER SKÆRMENS EGEN VALIDERING, ikke en afskrift", () => {
    /* En klientvalidering der ikke også står på serveren, er en pæn knap. Og
       en serverafskrift ved siden af ville betyde at skærmen sagde ja og
       serveren nej, uden at nogen kunne se hvorfor. */
    assert.ok(blok.includes("valideOpgaveplan("), "valideOpgaveplan kaldes ikke");
    assert.ok(blok.includes("opgaveMangler("), "nodens eget katalog spørges ikke");
    assert.ok(kilde.includes('from "./delt/opgaveplan-regler.js"'));
    assert.ok(kilde.includes('from "./delt/opgaver.js"'));
  });

  it("⚠ BEGGE FILER ER I DELTE_FILER — ellers fejler den ved DEPLOY", () => {
    /* Firebase deployer kun functions/-mappen. En import op gennem træet
       virker lokalt og fejler i skyen, altså på det dårligst mulige
       tidspunkt. Listen er lukket under import. */
    for (const f of ["opgaveplan-regler.js", "opgaver.js", "prioritet.js", "reservations.js"]) {
      assert.ok(DELTE_FILER.includes(f), `${f} mangler i DELTE_FILER`);
    }
  });

  it("⚠ PERMISSIONEN, IKKE ROLLEN", () => {
    /* Spørg hvad handlingen kræver, ikke hvem brugeren er — CLAUDE.md. */
    assert.match(blok, /perms\.includes\("\|opgaver\.skriv\|"\)/);
    assert.ok(!/rolle === "(admin|disponent)"/.test(blok),
      "der spørges på rollen frem for på permissionen");
  });

  it("⚠ ABONNEMENT OG MODUL PRØVES — admin-SDK'et går uden om reglerne", () => {
    /* Reglerne er det eneste sted de to spærringer ellers står. Uden de her
       blokke er funktionen en åben dør rundt om begge. */
    assert.ok(blok.includes('child("abonnement/status")'), "abonnementet prøves ikke");
    assert.ok(blok.includes('child("flaade")'), "modulspærringen prøves ikke");
    assert.ok(blok.includes('child("_findes")'), "tenanten prøves ikke");
  });

  it("⚠ ARTEN SÆTTES AF SERVEREN, ikke af klienten", () => {
    /* Kom arten udefra, kunne driftskalenderens formular oprette
       facility-poster — og de to har ikke samme feltskema. */
    assert.match(blok, /art:\s*"vaerksted"/);
    assert.ok(!/art:\s*kortStreng\(d\.art/.test(blok), "arten tages fra klienten");
  });

  it("⚠ RESERVATIONEN BYGGES ÉT STED", () => {
    assert.ok(blok.includes("reservationFraOpgave("),
      "funktionen bygger sin egen reservation frem for at bruge den delte");
  });

  it("⚠ ALT LANDER I ÉN rod.update()", () => {
    /* Opgaven og reservationen skal skrives sammen eller slet ikke. Landede
       kun opgaven, ville enheden have et værkstedsbesøg uden at være spærret
       — og så ser den FRI ud i disponeringen. */
    const tilUpdate = blok.slice(0, blok.indexOf("await rod.update(opdatering)"));
    assert.ok(tilUpdate.includes("opdatering[`opgaver/${opgaveId}`]"));
    assert.ok(tilUpdate.includes("opdatering[`reservationer/"));
    assert.equal((blok.match(/await rod\.update\(/g) || []).length, 1,
      "der skrives i mere end ét kald");
    assert.ok(!/\.set\(/.test(blok), "der skrives med set() ved siden af update()");
  });

  it("⚠ DEN OVERSKRIVER IKKE EN BOOKING — DEN AFVISER", () => {
    /* Et værkstedsbesøg har prioritet 40 og KUNNE slå en booking. Men at
       annullere en booking er et etapeskift med årsag og historik, og det er
       `etapeskift`s arbejde. To veje ind i etapens tilstand er den "anden vej
       til ét felt" beslutning 40 lukkede. */
    assert.ok(blok.includes("tjekLedigMod("), "der prøves ikke mod de eksisterende");
    assert.ok(blok.includes('throw new HttpsError("failed-precondition"'),
      "en optaget enhed afvises ikke");
    assert.ok(!/tving:\s*true/.test(blok), "der reserveres med tving");
    assert.ok(!/etaper\//.test(blok), "funktionen rører etaper — det er etapeskifts arbejde");
    assert.ok(!/bookinger\//.test(blok), "funktionen rører bookinger");
  });

  it("⚠ RESERVATIONENS ID ER UDLEDT AF OPGAVEN, ikke en ny push-nøgle", () => {
    /* Så kan den samme opgave ikke lægge to reservationer på den samme enhed,
       hvis funktionen kaldes to gange — og en senere frigivelse kan finde den
       uden at søge. Samme greb som res-<etapeId>-<i> i etapeskift. */
    assert.match(blok, /res-\$\{opgaveId\}/);
  });

  it("⚠ EN SOLGT ELLER SKROTTET ENHED AFVISES", () => {
    /* Posten bliver stående i flåden — regnskabsdata hardslettes ikke — men
       den kan ikke komme på værksted. */
    assert.match(blok, /status === "solgt" \|\| kt\.status === "skrottet"/);
  });

  it("⚠ INGEN MAIL. Beslutning 20 er fase 0", () => {
    /* sager/ står ikke i firebase.rules.json. Sendte funktionen en mail,
       ville den skrive til en node der ikke har regler. */
    assert.ok(!/sager\//.test(blok), "funktionen rører sager/");
    assert.ok(!/sendMail|nodemailer|sendgrid/i.test(blok), "funktionen sender mail");
  });
});

describe("klienten skriver ikke uden om serveren", () => {
  const klient = readFileSync("src/fleet/opgaveplan.js", "utf8");

  it("⚠ INGEN gem() OG INGEN db.ref() — vejen går gennem funktionen", () => {
    /* `skriv.js` er vejen ind for det klienten må skrive selv. Planlægningen
       går gennem serveren, og de to veje skal ikke blandes sammen. */
    assert.ok(!/from "\.\/skriv\.js"/.test(klient), "opgaveplan.js importerer skriv.js");
    assert.ok(!/db\.ref\(|\.set\(|\.update\(/.test(klient), "der skrives direkte");
    assert.ok(klient.includes("kaldFunktion("), "der kaldes ingen funktion");
  });

  it("⚠ KASTER ALDRIG — en afvisning er et svar, ikke et nedbrud", () => {
    /* Kaster den, bliver "du må ikke", "enheden er optaget" og "ingen
       forbindelse" til den samme røde boks. */
    assert.ok(klient.includes("try {") && klient.includes("catch (fejl)"));
    assert.ok(klient.includes("tolkPlanfejl(fejl)"));
  });

  it("⚠ FUNKTIONSNAVNET MATCHER functions/index.js", () => {
    const m = /PLANFUNKTION = "([a-z]+)"/.exec(klient);
    assert.ok(m, "PLANFUNKTION findes ikke");
    assert.ok(kilde.includes(`export const ${m[1]} = onCall`),
      `functions/index.js har ingen ${m[1]}`);
    /* Småt navn: en 2. generations funktion bliver en Cloud Run-tjeneste, og
       et tjenestenavn må kun være småt. */
    assert.equal(m[1], m[1].toLowerCase());
  });

  it("⚠ INGEN id FRA KLIENTEN — serveren laver push-nøglen", () => {
    /* En klient der navngav sin egen post, kunne overskrive en andens. */
    assert.ok(!/\bid:\s*post\.id/.test(klient));
    assert.match(blok, /rod\.child\("opgaver"\)\.push\(\)\.key/);
  });
});

/* test/statusmelding.test.mjs
 * Chaufførens melding: formen, koblingen og de to der ikke må forveksles.
 *
 * ⚠ HVORFOR FILEN FINDES. `rutestatus.js` har kunnet LÆSE meldinger siden
 * beslutning 22, og der var ingen der kunne skrive dem: `statushaendelser`
 * stod hverken i `firebase.rules.json` eller i seedet, og Rute & status læste
 * `demoHaendelser()` **direkte — også i drift**. Skærmen viste "Ingen
 * meldinger" på hver eneste tur, for alle, og den var ikke i stykker; der var
 * bare ingen kilde.
 *
 * Se beslutning 103.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  HAENDELSE, ALLE_HAENDELSER, MELDING_FELTER, valideMelding, byggMelding,
  meldingerFor, foreslaaedeMeldinger, planlagteStop, seneste, stilhedMin,
  meldingerVedStop, erStopFaerdigt, naesteForStop,
} from "../src/fleet/rutestatus.js";
import { DEMO_STATUSHAENDELSER, DEMO_STATUS_POSTER, DEMO_ETAPER, demoHaendelser }
  from "../src/fleet/demo-etaper.js";
import { DEMO_PERSONALE } from "../src/fleet/demo-personale.js";
import { PERSON_FOR_ROLLE, DEV_BRUGERE } from "../src/fleet/dev-brugere.js";
import { NODE_MODUL } from "../src/fleet/moduler.js";

const REGLER = JSON.parse(
  readFileSync("firebase.rules.json", "utf8")
    .replace(/^﻿/, "")
    .replace(/^\s*\/\/.*$/gm, "")
).rules.tenants.$tenantId;

const NODE = REGLER.statushaendelser;
const POST = NODE.$etapeId.$meldingId;

const udenKommentarer = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const etape = DEMO_ETAPER.find((e) => e.id === "et-001");
const melding = (o = {}) => ({
  type: "afgang", ms: Date.now(), klientId: "k-1", ...o,
});

describe("Meldingens form", () => {
  it("hver type i HAENDELSE står også i reglens ordliste", () => {
    /* ⚠ TO ORDLISTER DER KAN DRIVE. Tilføjes en type i koden uden i reglen,
       afvises meldingen af serveren efter at knappen har været trykket — og
       chaufføren står i en lastbil og tror appen er i stykker. */
    const udtryk = POST.type[".validate"];
    for (const type of ALLE_HAENDELSER) {
      assert.ok(udtryk.includes(type), `reglen kender ikke "${type}"`);
    }
  });

  it("og reglen kender ingen type koden ikke har", () => {
    const iRegel = udtryk_typer(POST.type[".validate"]);
    assert.deepEqual(iRegel.sort(), [...ALLE_HAENDELSER].sort());
  });

  it("de fire påkrævede felter er de fire reglen kræver", () => {
    const m = POST[".validate"].match(/hasChildren\(\[([^\]]*)\]\)/);
    const kraevet = m[1].split(",").map((s) => s.trim().replace(/['"]/g, ""));
    assert.deepEqual(kraevet.sort(), ["klientId", "ms", "type", "uid"]);
  });

  /**
   * ⚠ ALLOWLISTEN GÅR BEGGE VEJE. Et felt koden bygger og reglen forbyder,
   * afvises af serveren; et felt reglen tillader og koden ikke kender, kan
   * skrives af en klient og læses af ingen.
   */
  it("⚠ MELDING_FELTER OG REGLEN ER ENIGE", () => {
    const iRegel = Object.keys(POST).filter((k) => !k.startsWith(".") && k !== "$andet");
    assert.deepEqual(iRegel.sort(), [...MELDING_FELTER].sort());
    assert.equal(POST.$andet[".validate"], false, "et ukendt felt skal afvises");
  });

  /**
   * ⚠ DER ER INTET `sted`. Demosættet bar det, og en position er præcis det
   * beslutning 22 siger vi ikke har. Stedet står i den planlagte rute:
   * `stopId` peger på et stop, og stoppet bærer navnet. En melding uden
   * stopId — en pause, en forsinkelse — har intet kendt sted.
   */
  it("⚠ INGEN sted-FELT NOGEN STEDER", () => {
    assert.ok(!MELDING_FELTER.includes("sted"));
    assert.ok(!("sted" in POST));
    for (const meldinger of Object.values(DEMO_STATUSHAENDELSER)) {
      for (const m of Object.values(meldinger || {})) {
        assert.ok(!("sted" in m), `demo-meldingen ${m.klientId} bærer et sted`);
      }
    }
  });
});

describe("valideMelding svarer på hvorfor", () => {
  it("en gyldig melding giver ingen fejl", () => {
    assert.deepEqual(valideMelding(melding(), { etape }), []);
  });

  it("en ukendt type stopper med det samme", () => {
    const fejl = valideMelding(melding({ type: "ankommet" }), { etape });
    assert.equal(fejl.length, 1, "resten af tjekkene er meningsløse uden en type");
    assert.match(fejl[0], /Ukendt meldingstype/);
  });

  it("uden klientId afvises den", () => {
    /* ⚠ FELTET ER NØGLEN. Uden det ville en gensendelse blive en post mere. */
    assert.match(valideMelding(melding({ klientId: "" }), { etape }).join(), /klientId/);
  });

  it("uden tidspunkt afvises den", () => {
    assert.match(valideMelding(melding({ ms: null }), { etape }).join(), /tidspunkt/);
  });

  /**
   * ⚠ ET stopId SKAL STÅ PÅ ETAPENS EGEN RUTE. Et frit id ville lade en
   * melding "nå" et sted der ikke er på turen, og `naesteStop()` ville springe
   * et rigtigt stop over uden at nogen kunne se hvorfor.
   */
  it("⚠ ET UKENDT STOP AFVISES, ET KENDT GÅR IGENNEM", () => {
    const kendt = planlagteStop(etape)[0].id;
    assert.deepEqual(valideMelding(melding({ stopId: kendt }), { etape }), []);
    assert.match(
      valideMelding(melding({ stopId: "roskilde" }), { etape }).join(),
      /står ikke på etapens rute/);
  });

  it("et ukendt felt afvises", () => {
    assert.match(valideMelding(melding({ sted: "Padborg" }), { etape }).join(),
      /Ukendt felt: sted/);
  });

  /**
   * ⚠ EN FORSINKELSE UDEN MINUTTER ER TILLADT. Chaufføren ved det måske ikke
   * endnu — men et tal skal være et tal.
   */
  it("⚠ forsinketMin MÅ MANGLE, MEN IKKE VÆRE HALV", () => {
    assert.deepEqual(valideMelding(melding({ type: "forsinkelse" }), { etape }), []);
    assert.match(
      valideMelding(melding({ type: "forsinkelse", forsinketMin: 7.5 }), { etape }).join(),
      /hele minutter/);
  });

  it("noten er tekst med et loft", () => {
    const lang = "x".repeat(201);
    assert.match(valideMelding(melding({ note: lang }), { etape }).join(), /200 tegn/);
    assert.equal(Number(POST.note[".validate"].match(/length <= (\d+)/)[1]), 200,
      "reglens loft og funktionens skal være det samme tal");
  });
});

describe("byggMelding udelader frem for at nulle", () => {
  /**
   * ⚠ ET null OVERLEVER IKKE EN SKRIVNING TIL RTDB — feltet SLETTES. En post
   * hvor halvdelen af felterne er forsvundet, ligner en post der er blevet
   * rettet, og det er en anden historie end en melding uden note.
   */
  it("⚠ TOMME FELTER ER SLET IKKE MED", () => {
    const m = byggMelding({ type: "pause", ms: 1, klientId: "k", note: "  " });
    assert.deepEqual(Object.keys(m).sort(), ["klientId", "ms", "type"]);
  });

  it("noten trimmes, og et tal på nul er et tal", () => {
    const m = byggMelding({
      type: "forsinkelse", ms: 1, klientId: "k", forsinketMin: 0, note: " kø ",
    });
    assert.equal(m.note, "kø");
    assert.equal(m.forsinketMin, 0, "nul minutters forsinkelse er en oplysning");
  });

  /**
   * ⚠ uid SÆTTES AF SERVEREN, IKKE HER. En klient der måtte skrive sit eget,
   * kunne melde i en kollegas navn.
   */
  it("⚠ byggMelding SÆTTER ALDRIG uid", () => {
    const m = byggMelding({ type: "afgang", ms: 1, klientId: "k", uid: "uid-tyv" });
    assert.ok(!("uid" in m));
  });
});

describe("Nodeformen — ikke en array", () => {
  /**
   * ⚠ DET ER BESLUTNING 76 OM IGEN. Dér talte `kanSkifteEtape()` med
   * `post.forslag?.length` — `undefined` på nodeform — så tre overgange var
   * lukkede i produktion **mens de virkede i demo**, fordi demosættet brugte
   * arrays.
   */
  it("⚠ DEMOSÆTTET HAR NODENS FORM, IKKE ARRAYS", () => {
    for (const [etapeId, meldinger] of Object.entries(DEMO_STATUSHAENDELSER)) {
      assert.ok(!Array.isArray(meldinger), `${etapeId} er en array`);
      for (const [noegle, m] of Object.entries(meldinger || {})) {
        assert.equal(noegle, m.klientId, "nøglen ER meldingens klientId");
      }
    }
  });

  it("⚠ OG demoHaendelser GIVER NODEFORM VIDERE", () => {
    /* Gav den en liste, ville demo og drift kunne opføre sig forskelligt. */
    const h = demoHaendelser("et-001");
    assert.ok(!Array.isArray(h));
    assert.equal(h, DEMO_STATUSHAENDELSER["et-001"]);
  });

  it("meldingerFor sorterer i tid og bærer id videre", () => {
    const h = meldingerFor(DEMO_STATUS_POSTER.find((p) => p.id === "et-008"));
    assert.deepEqual(h.map((m) => m.type),
      ["afgang", "graense", "pause", "ankomstLosning", "afsluttet"]);
    assert.ok(h.every((m) => m.id));
  });

  /**
   * ⚠ POSTEN BÆRER OGSÅ ET `id` FRA useListe. Uden filteret ville etapens
   * eget id blive læst som en melding uden type — og `seneste()` ville svare
   * med den.
   */
  it("⚠ ETAPENS id TÆLLER IKKE MED SOM EN MELDING", () => {
    const h = meldingerFor({ id: "et-001", ...DEMO_STATUSHAENDELSER["et-001"] });
    assert.equal(h.length, 3);
    assert.ok(h.every((m) => HAENDELSE[m.type]));
  });

  it("en etape uden meldinger giver en tom liste, ikke et brag", () => {
    assert.deepEqual(meldingerFor(null), []);
    assert.deepEqual(meldingerFor({ id: "et-002" }), []);
  });
});

describe("Knapperne sorteres, de spærres ikke", () => {
  /**
   * ⚠ VIRKELIGHEDEN KOMMER IKKE I RÆKKEFØLGE. Han kan holde pause før afgang
   * eller melde forsinkelse tre gange. En knap der er væk, tvinger ham til at
   * melde noget der ikke passer.
   */
  it("⚠ ALLE TYPER ER ALTID TILGÆNGELIGE", () => {
    for (const meldinger of [[], meldingerFor(DEMO_STATUS_POSTER[0])]) {
      assert.deepEqual([...foreslaaedeMeldinger(meldinger)].sort(),
        [...ALLE_HAENDELSER].sort());
    }
  });

  it("den næste i rækken står først", () => {
    assert.equal(foreslaaedeMeldinger([])[0], "afgang");
    assert.equal(foreslaaedeMeldinger([{ type: "afgang" }])[0], "ankomstLaesning");
  });
});

describe("Koblingen mellem et login og en medarbejder", () => {
  /**
   * ⚠ DEN FANDTES IKKE. `brugere/<uid>` bar email, navn, rolle og spaerret, og
   * intet der sagde hvilken medarbejder kontoen tilhører. En chauffør kunne
   * logge ind, og systemet kunne ikke svare på hvilke ture der var hans.
   */
  it("⚠ brugere/$uid HAR ET personId, OG DET SKAL FINDES I personale", () => {
    const v = REGLER.brugere.$uid.personId[".validate"];
    assert.match(v, /child\('personale'\)/);
    assert.match(v, /newData\.isString\(\)/);
  });

  /**
   * ⚠ FELTET ER VALGFRIT. En admin på kontoret er ikke nødvendigvis en post i
   * `personale`, og en chauffør har måske slet intet login. Var det påkrævet,
   * kunne ingen bruger oprettes før nogen havde peget på en medarbejder.
   */
  it("⚠ MEN DET ER IKKE PÅKRÆVET", () => {
    const paa = REGLER.brugere.$uid[".validate"];
    assert.ok(!paa || !/hasChildren\([^)]*personId/.test(paa));
  });

  it("DEV-chaufføren peger på en medarbejder der findes", () => {
    for (const [rolle, personId] of Object.entries(PERSON_FOR_ROLLE)) {
      const p = DEMO_PERSONALE.find((x) => x.id === personId);
      assert.ok(p, `${rolle} peger på "${personId}", som ikke står i DEMO_PERSONALE`);
      /* ⚠ OG MEDARBEJDEREN SKAL HAVE TURE. Et medarbejderkort uden etaper
         giver en tom app, og en tom app ligner en fejl. */
      assert.ok(DEMO_ETAPER.some((e) => e.personId === personId),
        `${personId} er chauffør på nul etaper — appen ville stå tom`);
    }
    assert.equal(DEV_BRUGERE.find((b) => b.rolle === "chauffoer").personId,
      PERSON_FOR_ROLLE.chauffoer);
  });
});

describe("Vejen ind er lukket", () => {
  const FUNKTIONER = readFileSync("functions/index.js", "utf8");
  const KODE = udenKommentarer(FUNKTIONER);

  it("⚠ statushaendelser ER .write: false", () => {
    /* En regel kan ikke svare på "er den her etape chaufførens": etapen bærer
       et personId, tokenet et uid, og oversættelsen er et opslag. Sendte
       klienten sit eget personId med, kunne han melde på en fremmed tur. */
    assert.equal(NODE[".write"], false);
  });

  it("statusmelding findes og slår koblingen op selv", () => {
    assert.match(KODE, /export const statusmelding = onCall/);
    assert.match(KODE, /brugere\/\$\{uid\}\/personId/);
  });

  /**
   * ⚠ uid SKRIVES, personId SLÅS OP. Byttede vi om, ville meldingen stå i
   * navnet på en medarbejder frem for på det login der sendte den — og
   * ejerskabstjek andre steder ville sammenligne et personId med et uid.
   */
  it("⚠ SERVEREN SKRIVER SIT EGET uid, IKKE KLIENTENS", () => {
    const krop = KODE.split("export const statusmelding")[1].split("export const")[0];
    assert.match(krop, /\.\.\.forslag,\s*uid\s*\}/, "uid skal komme fra auth, ikke fra req.data");
    assert.ok(!/d\.uid/.test(krop), "funktionen læser et uid fra klienten");
  });

  /**
   * ⚠ NØGLEN ER klientId, IKKE push(). Sender telefonen den samme melding to
   * gange — fordi svaret forsvandt i en tunnel — skal den anden være den
   * SAMME post. Med push() ville en dårlig forbindelse give dobbelte
   * meldinger, og `stilhedMin()` ville se en aktivitet der ikke fandt sted.
   */
  it("⚠ SKRIVNINGEN NØGLES PÅ klientId", () => {
    const krop = KODE.split("export const statusmelding")[1].split("export const")[0];
    assert.match(krop, /statushaendelser\/\$\{etapeId\}\/\$\{forslag\.klientId\}/);
    assert.ok(!/\.push\(\)/.test(krop), "push() ville lave en post mere ved en gensendelse");
  });

  it("den prøver med den SAMME valideMelding som skærmen", () => {
    /* ⚠ SPØRG HVAD DER IMPORTERES, IKKE HVORDAN LINJEN ER SKREVET. Prøven
       matchede ordret på `{ valideMelding, byggMelding }` og faldt da et
       tredje navn kom til — den målte formuleringen, ikke kravet. */
    const linje = KODE.match(/import \{([^}]*)\} from "\.\/delt\/rutestatus\.js"/);
    assert.ok(linje, "functions/index.js importerer ikke den delte rutestatus");
    const navne = linje[1].split(",").map((s) => s.trim());
    for (const n of ["valideMelding", "byggMelding"]) assert.ok(navne.includes(n));
    /* ⚠ KOPIEN BÆRER ET ADVARSELSHOVED — det er den der sammenlignes uden.
       `test/functions-delt.test.mjs` holder de to filer identiske; her prøves
       kun at rutestatus.js OVERHOVEDET er på listen. Var den ikke det, ville
       serveren fejle ved DEPLOY og ikke ved test. */
    const kopi = readFileSync("functions/delt/rutestatus.js", "utf8");
    assert.match(kopi, /export function valideMelding/);
    assert.match(readFileSync("scripts/kopier-delt.mjs", "utf8"), /"rutestatus\.js"/);
  });

  /**
   * ⚠ DER SKRIVES INGEN AUDITPOST, OG DET ER ET VALG. Meldingen ER sit eget
   * spor: den bærer uid og ms, noden er `.write: false`, og der findes ingen
   * vej der kan rette eller slette den. En auditpost ville være den samme
   * kendsgerning gemt to steder — det er `bemanding.ledig` igen.
   */
  it("⚠ INGEN AUDITPOST, MED VILJE", () => {
    const krop = KODE.split("export const statusmelding")[1].split("export const")[0];
    assert.ok(!/await log/.test(krop));
    assert.match(FUNKTIONER, /DER SKRIVES INGEN AUDITPOST/,
      "valget skal stå skrevet, ellers ligner det en forglemmelse");
  });
});

describe("Modulet og læsningen", () => {
  it("noden hører til booking, i både tabellen og reglen", () => {
    assert.equal(NODE_MODUL.statushaendelser, "booking");
    assert.match(NODE[".read"], /child\('booking'\)/);
  });

  it("⚠ INGEN .read PÅ MELDINGEN SELV", () => {
    /* `.read` kaskaderer. En på $meldingId ville være uden virkning, og en på
       $etapeId ville kunne løsne klausulen ovenfor uden at nogen så det. */
    assert.ok(!(".read" in NODE.$etapeId));
    assert.ok(!(".read" in POST));
  });

  it("der er et indeks på ms", () => {
    assert.deepEqual(NODE.$etapeId[".indexOn"], ["ms"]);
  });
});

describe("Skærmen læser noden, ikke demofilen", () => {
  const SKAERM = udenKommentarer(readFileSync("src/moduler/booking/LiveKort.jsx", "utf8"));

  /**
   * ⚠ DET VAR DEN SIDSTE DIREKTE DEMO-LÆSNING PÅ EN SEEDET NODE. Beslutning
   * 64 fik tallet til nul og lod to sæt stå fordi deres node ikke fandtes.
   * `statushaendelser` var det ene af dem, og nu findes den.
   */
  it("⚠ LiveKort KALDER IKKE demoHaendelser LÆNGERE", () => {
    assert.ok(!/demoHaendelser/.test(SKAERM),
      "skærmen læser demofilen direkte — også i drift");
    assert.match(SKAERM, /useListe\("statushaendelser"/);
  });

  it("og den går gennem meldingerFor", () => {
    assert.match(SKAERM, /meldingerFor\(/);
    assert.ok(!/Object\.values\(/.test(SKAERM),
      "formen oversættes ét sted — se meldingerFor()");
  });

  /* ⚠ Turplan AFLØSTE MinTur i beslutning 110 — samme skærm, nu med stop. */
  const APP = udenKommentarer(readFileSync("src/moduler/app/Turplan.jsx", "utf8"));

  /**
   * ⚠ FILTERET ER personId, IKKE uid. Sammenlignede appen de to direkte,
   * ville intet nogensinde matche, og skærmen ville stå tom **uden at fejle**.
   */
  it("⚠ CHAUFFØRAPPEN FILTRERER PÅ personId", () => {
    assert.match(APP, /e\.personId === minPersonId/);
    assert.ok(!/e\.personId === bruger/.test(APP));
  });

  it("⚠ OG DEN LAVER INGEN SIDEBAR", () => {
    /* Rammen er App.jsx' Chauffoerramme — skærmen må ikke bygge sin egen. */
    assert.ok(!/nav\.js|Sidebar|AppShell/.test(APP));
  });

  it("appen prøver med den samme valideMelding før den sender", () => {
    assert.match(APP, /valideMelding\(melding, \{ etape \}\)/);
    assert.match(APP, /kaldFunktion\("statusmelding"/);
  });
});

describe("Meldingerne når hele vejen igennem", () => {
  /**
   * ⚠ DET ER PRØVEN PÅ AT DER ER NOGET AT SE. Noden kunne stå tom og alt
   * ovenfor være grønt — det var netop tilstanden før beslutning 103.
   */
  it("⚠ SEEDET KENDER NODEN", () => {
    const prov = readFileSync("scripts/provisioner-dev.mjs", "utf8");
    assert.match(prov, /node: "statushaendelser", data: DEMO_STATUSHAENDELSER/);
    assert.match(prov, /statushaendelser\/\$\{etapeId\}\/\$\{meldingId\}\/uid/,
      "pladsholderen skal skrives om til et rigtigt uid");
  });

  it("en tur i gang kan aflæses: sidste melding og hvor længe siden", () => {
    const h = meldingerFor(DEMO_STATUS_POSTER.find((p) => p.id === "et-001"));
    const sidst = seneste(h);
    assert.equal(sidst.type, "graense");
    assert.ok(Number.isFinite(stilhedMin(h)));
  });
});

/** Typerne ud af regeludtrykkets regex — samme liste, læst den anden vej. */
function udtryk_typer(udtryk) {
  const m = udtryk.match(/\^\(([^)]*)\)\$/);
  return m[1].split("|");
}

/**
 * ⚠ DE TO FEJL EN ENDE-TIL-ENDE-KØRSEL FANDT, OG PRØVERNE IKKE GJORDE.
 *
 * Alt ovenfor var grønt, funktionen var udrullet, og noden havde data. Så blev
 * `statusmelding` kaldt ni gange mod DEV som fire forskellige roller, og to
 * svar var forkerte:
 *
 *   7 forbudt felt      → **OK**, feltet blev droppet i stilhed
 *   8 disponent         → *"din bruger er ikke koblet til en medarbejder"*
 *
 * Ingen af dem kunne ses ved at læse koden: den ene fordi `byggMelding()`
 * havde filtreret feltet væk FØR prøven kørte, den anden fordi permissionen
 * jeg tjekkede på, **ikke findes**. De to er de sidste prøver i filen, fordi
 * de er dem der ville have sparet kørslen.
 */
describe("Det kørslen fandt", () => {
  const KODE = udenKommentarer(readFileSync("functions/index.js", "utf8"));
  const KROP = KODE.split("export const statusmelding")[1].split("\nexport const")[0];

  /**
   * ⚠ EN PERMISSION DER IKKE FINDES, ER EN GREN DER ALDRIG FYRER. Undtagelsen
   * for disponenten var skrevet ned og virkede ikke — han fik at vide at HANS
   * bruger manglede et medarbejderkort. Det er "en pæn knap" spejlvendt.
   */
  it("⚠ HVER PERMISSION FUNKTIONEN TJEKKER, FINDES FAKTISK", async () => {
    const { ROLLE_PERMS } = await import("../src/fleet/permissions.js");
    const findes = new Set(Object.values(ROLLE_PERMS).flat());
    const brugte = [...KROP.matchAll(/perms\.includes\("\|([^|]+)\|"\)/g)].map((m) => m[1]);
    assert.ok(brugte.length >= 2, "fandt ingen permissionstjek at prøve");
    for (const p of brugte) {
      assert.ok(findes.has(p), `funktionen tjekker "${p}", som ingen rolle har`);
    }
  });

  it("og det er booking.udfoer der åbner for en disponent", () => {
    /* `booking.opret` ville være forkert: den der opretter en forespørgsel,
       har ikke med turen at gøre når den ruller. */
    assert.match(KROP, /booking\.udfoer/);
    assert.ok(!/booking\.skriv/.test(KROP), "booking.skriv findes ikke");
  });

  /**
   * ⚠ ET UKENDT FELT SKAL AFVISES, IKKE DROPPES. `byggMelding()` kopierer felt
   * for felt, så `sted: "Padborg"` var væk før `valideMelding()` kørte —
   * klienten sendte noget systemet ikke forstår og fik OK tilbage. Reglens
   * `$andet: false` fanger det ikke: noden er `.write: false`, så en klient
   * når aldrig `.validate`.
   */
  it("⚠ PRØVEN STÅR PÅ DET KLIENTEN SENDTE, IKKE PÅ DET VI BYGGEDE", () => {
    const i = KROP.indexOf("Object.keys(d)");
    const j = KROP.indexOf("byggMelding(");
    assert.ok(i > 0, "der er intet tjek af klientens egne felter");
    assert.ok(i < j, "tjekket skal ligge FØR byggMelding, ellers er feltet væk");
    assert.match(KROP, /Ukendt felt/);
  });

  it("⚠ OG uid AFVISES FREM FOR AT BLIVE OVERSKREVET I STILHED", () => {
    assert.match(KROP, /"uid" in d/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   V1-BRUGERTEST §10.2 — "MELDT" ER IKKE DET SAMME SOM FÆRDIG
   ══════════════════════════════════════════════════════════════════════════
   En ankomst-melding på et leverings-stop må ikke gøre kortet til et
   dødvande: chaufføren skal stadig kunne melde afgang/afslutning bagefter,
   og kunne se hvad han allerede har sendt. Se rutestatus.js's egen note. */
describe("erStopFaerdigt/naesteForStop — stoppets EGEN rolle, ikke etapens hele liste", () => {
  it("meldingerVedStop filtrerer på stopId, sorteret i tid", () => {
    const alle = [
      { stopId: "stop-2", type: "afsluttet", ms: 200 },
      { stopId: "stop-1", type: "ankomstLaesning", ms: 100 },
      { stopId: "stop-1", type: "afgangLaesning", ms: 150 },
    ];
    const her = meldingerVedStop(alle, "stop-1");
    assert.deepEqual(her.map((m) => m.type), ["ankomstLaesning", "afgangLaesning"]);
  });

  it("⚠ EN ANKOMST ALENE GØR IKKE ET LEVERINGS-STOP FÆRDIGT", () => {
    const her = [{ stopId: "s1", type: "ankomstLosning", ms: 1 }];
    assert.equal(erStopFaerdigt("levering", her), false,
      "kun 'ankomstLosning' er meldt — 'afsluttet' mangler stadig");
    assert.equal(naesteForStop("levering", her), "afsluttet",
      "næste handling skal være den konkrete afslutning, ikke et dødvande");
  });

  it("⚠ ET AFHENTNINGS-STOP ER FÆRDIGT VED afgangLaesning, IKKE FØR", () => {
    const kunAnkomst = [{ stopId: "s1", type: "ankomstLaesning", ms: 1 }];
    assert.equal(erStopFaerdigt("afhentning", kunAnkomst), false);
    assert.equal(naesteForStop("afhentning", kunAnkomst), "afgangLaesning");

    const faerdigt = [...kunAnkomst, { stopId: "s1", type: "afgangLaesning", ms: 2 }];
    assert.equal(erStopFaerdigt("afhentning", faerdigt), true);
    assert.equal(naesteForStop("afhentning", faerdigt), null,
      "et færdigt stop har ingen næste handling");
  });

  it("en ukendt rolle falder tilbage på 'der er meldt noget' — samme polaritet som erNaaet()", () => {
    assert.equal(erStopFaerdigt("ukendt", []), false);
    assert.equal(erStopFaerdigt("ukendt", [{ stopId: "s1", type: "pause", ms: 1 }]), true);
    assert.equal(naesteForStop("ukendt", [{ stopId: "s1", type: "pause", ms: 1 }]), null,
      "en ukendt rolle har ingen kendt rækkefølge at foreslå næste af");
  });

  it("⚠ TURPLAN.JSX BRUGER DISSE — IKKE erNaaet() — TIL AT AFGØRE OM KORTET ER FÆRDIGT", () => {
    const kilde = readFileSync("src/moduler/app/Turplan.jsx", "utf8");
    assert.match(kilde, /erStopFaerdigt\(s\.rolle, meldingerHer\)/,
      "kortets faerdig-status skal komme fra erStopFaerdigt, ikke fra erNaaet alene");
    assert.match(kilde, /naesteForStop\(s\.rolle, meldingerHer\)/);
    /* Regressionslås mod den oprindelige fejl: et "✓ Meldt"-dødvande uden
       videre handling må ikke stå tilbage i den gren der viser NOGET meldt
       men IKKE færdigt. */
    assert.ok(!kilde.includes('<p className="fc-app-besoeg">✓ Meldt</p>'),
      "det gamle, handlingsløse '✓ Meldt' er stadig i skærmen");
  });
});

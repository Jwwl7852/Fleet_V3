/* test/etapeskifte.test.mjs
 * Har hver overgang i etapemaskinen en dør? — beslutning 57.
 *
 * HVORFOR FILEN FINDES. Maskinen havde ni tilstande og ÉN dør. `skiftEtape()`
 * blev kaldt fra præcis ét sted — Forslag-skærmen, som afgør `afventerKoord`.
 * Alt andet i `ETAPE_OVERGANGE` havde ingen knap der kunne trykkes:
 *
 *   kladde → afventerPlan   "Send til planlægning"
 *   kladde → annulleret     "Annullér"
 *   aaben → afventerPlan    "Tag af venteliste"
 *   reserveret → udfoert    "Markér udført"
 *   reserveret → annulleret "Annullér etape"
 *   afvist → afventerPlan   "Genåbn etape"
 *
 * Bookingoversigten LISTEDE dem endda — genereret af maskinen, hvilket er
 * rigtigt — men hver knap var `disabled` med titlen *"Skrivning er ikke bygget
 * (fase 0)"*. En booking oprettet med `bookingopret` (beslutning 55) begyndte
 * som `kladde` og kunne aldrig komme videre.
 *
 * ⚠ EN OVERGANG UDEN EN KNAP ER EN VEJ INGEN KAN FINDE — og maskinen så hel
 * ud, netop fordi tabellen var komplet.
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  TILSTAND, tilgaengeligeEtapeHandlinger, kanSkifteEtape,
} from "../src/fleet/booking-state.js";
import { PERM, permStreng } from "../src/fleet/permissions.js";

const ALLE_PERMS = permStreng(Object.values(PERM));

const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const fil = (sti) => readFileSync(sti, "utf8");
const kode = (sti) => udenKommentarer(fil(sti));

const ETAPESKIFTE = "src/fleet/Etapeskifte.jsx";
const OVERSIGT = "src/moduler/booking/Oversigt.jsx";
const FORSLAG = "src/moduler/booking/Forslag.jsx";
const DISPONERING = "src/moduler/booking/Disponering.jsx";

/* ══════════════════════════════════════════════════════════════════════════
   HVER OVERGANG SKAL HAVE EN DØR
   ══════════════════════════════════════════════════════════════════════════ */

describe("Etapemaskinens døre", () => {
  /** Hver (fra → til) i tabellen, læst gennem maskinen selv. */
  const alleOvergange = () => {
    const ud = [];
    for (const tilstand of Object.keys(TILSTAND)) {
      for (const o of tilgaengeligeEtapeHandlinger(tilstand, ALLE_PERMS)) {
        ud.push({ fra: tilstand, ...o });
      }
    }
    return ud;
  };

  test("maskinen har overgange at prøve", () => {
    assert.ok(alleOvergange().length >= 15,
      "tabellen er skrumpet — eller opslaget er i stykker");
  });

  /**
   * ⚠ DEN VIGTIGE. En overgang der ikke kan nås fra nogen skærm, er kode der
   * ser bygget ud. To slags døre, og de er ikke vilkårlige:
   *
   *   · kræver et FORSLAG  → Disponering og Forslag, hvor turen kan SES.
   *     En knap andre steder ville åbne en dialog man ikke kunne udfylde.
   *   · alt andet          → `Etapeskifte.jsx`, som fire skærme kan bruge.
   */
  test("⚠ HVER OVERGANG KAN NÅS FRA EN SKÆRM", () => {
    const skifte = kode(ETAPESKIFTE);
    const forslag = kode(FORSLAG);
    const disponering = kode(DISPONERING);

    /* Etapeskifte tegner ALLE overgange maskinen giver, minus dem der kræver
       et forslag — den filtrerer på netop de to felter. */
    const tegnerAlleAndre = skifte.includes("tilgaengeligeEtapeHandlinger(")
      && skifte.includes("kraeverForslag")
      && skifte.includes("kraeverValgtForslag");

    const uden = [];
    for (const o of alleOvergange()) {
      const kraeverForslag = Boolean(o.kraeverForslag || o.kraeverValgtForslag);
      const naaet = kraeverForslag
        ? (forslag.includes("skiftEtape(") || disponering.includes("skiftEtape("))
        : tegnerAlleAndre;
      if (!naaet) uden.push(`${o.fra} → ${o.til} (${o.handling})`);
    }
    assert.deepEqual(uden, [],
      "overgange uden en dør. En overgang uden en knap er en vej ingen kan finde.");
  });

  /* Og maskinen skal stadig afvise dem der mangler noget — ellers ville
     komponenten tilbyde et skift serveren siger nej til. */
  test("de forslagsbærende overgange afvises uden et forslag", () => {
    const etape = { id: "e-1", tilstand: "afventerPlan", forslag: [] };
    const svar = kanSkifteEtape(etape, "afventerKoord", ALLE_PERMS);
    assert.equal(svar.ok, false);
    assert.match(svar.aarsag, /forslag/i);
  });

  test("og en frist kræves på vej til aaben", () => {
    const etape = { id: "e-1", tilstand: "afventerPlan", forslag: [] };
    const svar = kanSkifteEtape(etape, "aaben", ALLE_PERMS, { begrundelse: "x" });
    assert.equal(svar.ok, false);
    assert.match(svar.aarsag, /frist/i);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   KOMPONENTEN
   ══════════════════════════════════════════════════════════════════════════ */

describe("Etapeskifte", () => {
  const k = kode(ETAPESKIFTE);

  test("⚠ KNAPPERNE TEGNES AF MASKINEN, ikke af en liste i filen", () => {
    assert.ok(k.includes("tilgaengeligeEtapeHandlinger("));
    /* En håndskrevet tabel over overgange ville være et andet sted de stod. */
    assert.ok(!/const\s+OVERGANGE\s*=/.test(k), "komponenten har sin egen overgangstabel");
  });

  test("⚠ SVARER FØRST SELV — med serverens egen funktion", () => {
    assert.ok(k.includes("kanSkifteEtape("),
      "komponenten spørger ikke maskinen om hvorfor et skift er spærret");
  });

  test("⚠ SKRIVER GENNEM etapeskift, ikke direkte", () => {
    assert.ok(k.includes("skiftEtape("));
    assert.ok(!k.includes("db.ref"), "komponenten skriver direkte");
    assert.ok(!k.includes("gem({"), "komponenten går gennem skriv.js");
  });

  /**
   * ⚠ BEGRUNDELSEN ER PÅKRÆVET HVOR MASKINEN SIGER DET, og den må ikke gøre
   * knappen grå: så kunne man aldrig nå at give den. Dialogen spørger.
   */
  test("⚠ BEGRUNDELSE OG FRIST SPØRGES DER OM I EN DIALOG", () => {
    assert.ok(k.includes("kraeverBegrundelse"));
    assert.ok(k.includes("kraeverFrist"));
    assert.ok(k.includes("Dialog"), "der er ingen dialog at give dem i");
  });

  /* ⚠ Og begrundelsen er fritekst — den hører på etapens historik, ikke i
     auditloggen, hvor LOGBARE_FELTER er en allowliste netop for at holde
     tastet tekst ude. */
  test("siger hvor begrundelsen havner", () => {
    assert.match(fil(ETAPESKIFTE), /auditlog/i);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   SKÆRMEN
   ══════════════════════════════════════════════════════════════════════════ */

describe("Bookingoversigten har ikke sin egen knaprække", () => {
  const o = kode(OVERSIGT);

  test("⚠ ATTRAPPEN ER VÆK", () => {
    assert.ok(!o.includes("fase 0"), "knapperne siger stadig at der ikke skrives");
    assert.ok(o.includes("Etapeskifte"), "skærmen bruger ikke den delte komponent");
  });

  test("⚠ OG DEN KALDER IKKE SERVEREN UDEN OM KOMPONENTEN", () => {
    assert.ok(!o.includes("skiftEtape("),
      "skærmen kalder etapeskift selv i stedet for gennem komponenten");
  });

  /**
   * ⚠ ET SKIFT RØRER TRE NODER — etapen, dens reservationer og bookingens
   * AFLEDTE tilstand. Hentede skærmen kun etaperne igen, ville tabellen stå
   * med den gamle bookingtilstand, og det er netop den uenighed skærmen
   * findes for at gøre synlig.
   */
  test("⚠ HENTER BÅDE ETAPER OG BOOKINGER IGEN EFTER ET SKIFT", () => {
    assert.match(o, /onSkiftet=\{\(\) => \{[\s\S]*etapeListe\.genindlaes\(\)[\s\S]*bookingListe\.genindlaes\(\)/);
  });
});

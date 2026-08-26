/* test/laeseadgang.test.mjs
 * Hvem må LÆSE hvad — og hvilke huller der stadig står åbne.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ HVORFOR FILEN FINDES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Målt i regelfilen før beslutning 104:
 *
 *   39 af 51 læsbare noder krævede INGEN permission overhovedet
 *   15 domæner havde en `.skriv` og ingen `.laes`
 *
 * Systemet krævede altså en tilladelse for at **ændre** en pris og ingen for
 * at **læse** den. Det var ikke besluttet: læsegating blev sat på de fire
 * noder der har en `sensitive/`-satellit (beslutning 17), og resten fulgte
 * ikke med. Noten ved `bookingLaes` i `permissions.js` skrev det endda ud —
 * *"det ER asymmetrisk, og det er med vilje"* — og tilføjede at en stramning
 * ville kræve **sin egen beslutning med sin egen begrundelse**.
 *
 * Beslutning 104 er den beslutning, og den dækker **tre** af de femten:
 * `satser.laes`, `grundlag.laes` og `indkoeb.laes`. De tolv øvrige står
 * stadig åbne — og de står nu **her, med en grund hver.**
 *
 * ⚠ KRAVET ER IKKE AT ALLE SKAL LUKKES. Det er at ingen bliver glemt. Et hul
 * man kan tælle, er et andet hul end et ingen har set — samme figur som
 * `UDEN_TJEK` i `referencetjek.test.mjs` (beslutning 101).
 *
 * ⚠ OG PRØVEN PÅ EN NY LÆSE-PERMISSION ER FORDELINGEN, IKKE ANTALLET. Noten
 * ved `bookingLaes` advarer mod at tilføje tretten permissions *"som alle
 * presets alligevel skulle have"* — det ville give et katalog der er dobbelt
 * så stort og præcis lige så sikkert. Prøven nedenfor håndhæver det: en
 * læse-permission som alle syv roller har, er ikke en spærring.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PERM, ROLLE_PERMS } from "../src/fleet/permissions.js";

const REGLER = JSON.parse(
  readFileSync("firebase.rules.json", "utf8")
    .replace(/^﻿/, "")
    .replace(/^\s*\/\/.*$/gm, "")
).rules.tenants.$tenantId;

const ROLLER = Object.keys(ROLLE_PERMS);
const ALLE_PERMS = [...new Set(Object.values(ROLLE_PERMS).flat())];

/** De permissions et `.read`-udtryk kræver. */
const permsI = (udtryk) =>
  typeof udtryk !== "string" ? []
    : [...new Set([...udtryk.matchAll(/perms\.contains\('\|([^|]+)\|'\)/g)]
      .map((m) => m[1]))];

/** Hver node med en egen `.read`, og hvad den kræver. */
function laesbareNoder(node = REGLER, sti = "") {
  const ud = [];
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith(".") || !v || typeof v !== "object") continue;
    const s = sti ? `${sti}/${k}` : k;
    if (v[".read"] !== undefined) ud.push({ sti: s, perms: permsI(v[".read"]) });
    if (!k.startsWith("$")) ud.push(...laesbareNoder(v, s));
  }
  return ud;
}

const NODER = laesbareNoder();

/* ══════════════════════════════════════════════════════════════════════════
   DE TRE DER BLEV LUKKET
   ══════════════════════════════════════════════════════════════════════════ */

/** Node → den permission dens `.read` skal kræve. */
const LUKKET = {
  grundlag: "grundlag.laes",
  satser: "satser.laes",
  omkostninger: "satser.laes",
  indkoeb: "indkoeb.laes",
  /* ⚠ SKIVE 4B — VAR "indkoeb.laes". Leverandøren er ikke længere Procures
     egen (Model B, `04_DATA_AND_PERMISSION_IMPACT.md` §28) — dækker nu
     Fleet/Facility/Procure med samme permission. */
  leverandoerer: "leverandoerer.laes",
  indkoebsbehov: "indkoeb.laes",
  indkoebsordrer: "indkoeb.laes",
  forbrugsvarer: "indkoeb.laes",
  forbrugsvarebevaegelser: "indkoeb.laes",
  godkendelsesregler: "indkoeb.laes",
  /* ⚠ SKIVE 4A — DEN FJERDE, EFTER DE TRE FRA BESLUTNING 104. `fakturaer`
     havde ingen `.read`-permission overhovedet (se filens egen note i
     firebase.rules.json); det var ikke en åben `UDEN_LAES`-begrundelse
     nedenfor, men et rent hul. `fakturaer.laes` dækker begge forbrugere
     (Procures Fakturaer og det fælles Fakturacenter) med vilje, i stedet
     for at genbruge `indkoeb.laes` og låse den ene skærm bag den andens
     modulnavn. */
  fakturaer: "fakturaer.laes",
};

describe("De ti kommercielle noder er lukket", () => {
  it("hver af dem kræver sin permission i regelfilen", () => {
    for (const [node, perm] of Object.entries(LUKKET)) {
      const n = NODER.find((x) => x.sti === node);
      assert.ok(n, `noden ${node} har ingen egen .read`);
      assert.ok(n.perms.includes(perm),
        `${node} kræver ${n.perms.join(", ") || "ingen permission"} — forventede ${perm}`);
    }
  });

  it("og permissionen står i kataloget", () => {
    for (const perm of new Set(Object.values(LUKKET))) {
      assert.ok(ALLE_PERMS.includes(perm),
        `${perm} står i en regel men i ingen rolle — så kan ingen læse noden`);
    }
  });

  /**
   * ⚠ DEN VIGTIGSTE I FILEN. Noten ved `bookingLaes` advarer mod permissions
   * *"alle presets alligevel skulle have"*. En læse-permission som alle syv
   * roller har, er en linje i et katalog og ikke en spærring — den kan ikke
   * afvise nogen, og den ville få kataloget til at se strammere ud end
   * systemet er.
   */
  it("⚠ INGEN AF DE TRE HAVES AF ALLE SYV ROLLER", () => {
    for (const perm of new Set(Object.values(LUKKET))) {
      const har = ROLLER.filter((r) => ROLLE_PERMS[r].includes(perm));
      assert.ok(har.length < ROLLER.length,
        `${perm} haves af alle ${ROLLER.length} roller — den spærrer for ingen`);
      assert.ok(har.length > 0, `${perm} haves af ingen rolle`);
    }
  });

  /**
   * ⚠ OG CHAUFFØREN ER DEN DER MÆRKER DEM. Det var hans app (beslutning 103)
   * der fik spørgsmålet stillet: han har seks permissions, og han kunne læse
   * hver eneste pris, hvert fakturagrundlag og hvert leverandørvilkår.
   */
  it("⚠ CHAUFFØREN HAR INGEN AF DE TRE", () => {
    for (const perm of new Set(Object.values(LUKKET))) {
      assert.ok(!ROLLE_PERMS.chauffoer.includes(perm),
        `chaufføren har ${perm}`);
    }
  });

  it("revisoren har dem alle tre — ellers kan han ikke revidere", () => {
    for (const perm of new Set(Object.values(LUKKET))) {
      assert.ok(ROLLE_PERMS.revisor.includes(perm), `revisor mangler ${perm}`);
    }
    /* Og presettet indeholder stadig ikke én eneste .skriv. */
    assert.ok(!ROLLE_PERMS.revisor.some((p) => !p.endsWith("laes")),
      "revisorpresettet har fået noget der ikke er en læsning");
  });

  /**
   * ⚠ LAGERMEDARBEJDEREN SKAL HAVE satser.laes, OG DET BLEV MÅLT.
   * `permissions.js` påstod at rollen ikke kan "se en pris". Warehouses
   * Afregning og Volumen læser `satser/standard` for at prissætte håndtering
   * — uden permissionen ville to af hans egne skærme stå med en afvist
   * læsning.
   */
  it("⚠ LAGERMEDARBEJDEREN HAR satser.laes — hans egne skærme kræver det", () => {
    assert.ok(ROLLE_PERMS.lagermedarbejder.includes(PERM.satserLaes));
    for (const fil of ["src/moduler/warehouse/Afregning.jsx",
      "src/moduler/warehouse/Volumen.jsx"]) {
      assert.match(readFileSync(fil, "utf8"), /useListe\(`satser\//,
        `${fil} læser ikke satser længere — er permissionen stadig nødvendig?`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   DE TOLV DER STADIG STÅR ÅBNE
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Domæner med en `.skriv` og ingen `.laes` — hvert med sin grund.
 *
 * ⚠ EN GRUND ER IKKE EN UNDSKYLDNING. To slags står her: dem hvor læsningen
 * ikke er følsom (en opgave siger at bilen er på værksted), og dem hvor
 * spørgsmålet er ÅBENT. De sidste skal væk igen.
 */
const UDEN_LAES = {
  /* ---- Læsningen er ikke følsom -------------------------------------- */
  opgaver:
    "en driftsopgave siger AT bilen er på værksted. Det skal chaufføren vide — "
    + "det er hans bil. Noden bærer intet beløb; estimatet er i minutter.",
  facility:
    "en bygning, et anlæg og en klimamåling. Hvem der må ÆNDRE dem er et "
    + "spørgsmål; hvem der må se at porten er i stykker, er det ikke.",
  indberetninger:
    "chaufføren skriver sine egne, og ejerskabet tjekkes på `oprettetAf`. Det "
    + "følsomme ligger allerede i `sensitive/indberetninger`, som HAR en "
    + "permission (beslutning 17) — noden ved siden af bærer kilometerstand.",
  kompetencer:
    "et kørekort og et ADR-bevis med en udløbsdato. `tjekDisponering()` slår "
    + "op i dem, og en chauffør skal kunne se hvornår hans eget bevis udløber.",
  brugere:
    "⚠ KAN IKKE LUKKES SOM DET ER. Noden er det ene sted et navn kan slås op "
    + "på et uid — auditloggen, godkendervælgeren og Brugere & roller læser "
    + "den alle — og siden beslutning 103 er det også dér `personId` står, som "
    + "chaufførappen skal bruge for at vide hvilke ture der er hans. En "
    + "spærring her ville lukke hans egen app.",

  /* ---- Lageret: hvem der må se en hylde ------------------------------- */
  kasser:
    "en transportkasse og dens fysiske tilstand. Museet der lejer, er kunden; "
    + "kassen er vores. Der er intet kommercielt i rækken — prisen står i "
    + "`kassetyper` og i satserne.",
  kasseudlaan:
    "hvem der har kassen og hvornår den kommer hjem. Samme som ovenfor: "
    + "beløbet står ikke på udlånet.",
  reolpladser:
    "en hylde og dens mål. Delt ejerskab mellem unitbooking og warehouse "
    + "(beslutning 93), så en permission skulle dække begge.",
  varer:
    "kundens gods på vores lager. ⚠ ÅBENT: rækken bærer `kundeId`, så en "
    + "3PL-kunde kan udledes af den. Det er et andet spørgsmål end priser og "
    + "hører sammen med at Warehouse får sin første rigtige kunde.",
  bevaegelser:
    "ind og ud af lageret. Samme åbne spørgsmål som `varer` — og de to skal "
    + "afgøres sammen, for en bevægelse peger på en vare.",
  carriers:
    "en palle eller en bur, og hvor den står. Ingen pris, ingen kunde.",

  /* ---- Et åbent spørgsmål, ikke en forglemmelse ------------------------ */
  lagre:
    "⚠ ÅBENT, OG DET ER DET SAMME SPØRGSMÅL SOM I BESLUTNING 101: `lagre` "
    + "beskrives tre steder som reservedelslageret under Procure, mens "
    + "`pricing.js` slår op i `satsark.lagre[lagerId]` for LAGEROPHOLD med "
    + "døgnsatser. Er det det første, hører det under `indkoeb.laes`; er det "
    + "det andet, under `satser.laes`. Semantikken skal afgøres først.",
};

describe("De øvrige domæner står åbne — med en grund", () => {
  /** Domæner der har en skrive-permission. */
  const medSkriv = [...new Set(ALLE_PERMS
    .filter((p) => !p.endsWith("laes") && !p.endsWith("Laes"))
    .map((p) => p.split(".")[0]))];

  const medLaes = new Set(ALLE_PERMS
    .filter((p) => p.endsWith(".laes"))
    .map((p) => p.split(".")[0]));

  it("der ER domæner at prøve", () => {
    assert.ok(medSkriv.length > 10, `kun ${medSkriv.length} domæner med .skriv`);
  });

  /**
   * ⚠ KRAVET. Et domæne man skal have lov at ændre, og som enhver må læse,
   * er enten en beslutning eller en forglemmelse — og de to kan ikke skelnes
   * uden at nogen skriver hvilken.
   */
  it("⚠ HVERT DOMÆNE MED .skriv HAR ENTEN .laes ELLER EN BEGRUNDELSE", () => {
    const ubegrundede = medSkriv
      .filter((d) => !medLaes.has(d) && !UDEN_LAES[d]);
    assert.deepEqual(ubegrundede, [],
      "domæner hvor en permission kræves for at ÆNDRE og ingen for at LÆSE. "
      + "Tilføj enten en `<domæne>.laes` med en gate i firebase.rules.json, "
      + "eller en linje i UDEN_LAES der siger hvorfor læsningen er åben:\n  "
      + ubegrundede.join("\n  "));
  });

  /**
   * ⚠ OG LISTEN SKAL KUNNE BLIVE KORTERE. Står et domæne her fordi
   * spørgsmålet er åbent, hører begrundelsen væk samme dag det er besvaret —
   * ellers er listen en opgaveliste ingen læser igen.
   */
  it("⚠ INGEN BEGRUNDELSE FOR ET DOMÆNE DER HAR FÅET SIN .laes", () => {
    const overflod = Object.keys(UDEN_LAES).filter((d) => medLaes.has(d));
    assert.deepEqual(overflod, [],
      "domænet HAR en læse-permission — begrundelsen for at undlade den skal væk:\n  "
      + overflod.join("\n  "));
  });

  it("⚠ OG INGEN BEGRUNDELSE FOR ET DOMÆNE DER IKKE FINDES", () => {
    const spoegelser = Object.keys(UDEN_LAES).filter((d) => !medSkriv.includes(d));
    assert.deepEqual(spoegelser, [],
      "en begrundelse peger på et domæne uden en skrive-permission:\n  "
      + spoegelser.join("\n  "));
  });

  it("⚠ EN BEGRUNDELSE ER EN SÆTNING, IKKE ET ORD", () => {
    for (const [d, grund] of Object.entries(UDEN_LAES)) {
      assert.ok(grund.length > 40, `${d} har ingen rigtig begrundelse: "${grund}"`);
    }
  });

  /**
   * ⚠ HULLET SKAL VÆRE TÆLLELIGT. Tallet står i README, og det er dét der
   * gør forskellen på et hul nogen har set og et ingen har.
   */
  it("⚠ TALLET ER TOLV — og det skal ned, ikke op", () => {
    assert.equal(Object.keys(UDEN_LAES).length, 12,
      "listen har ændret længde. Er et domæne lukket, hører linjen væk og "
      + "tallet i README ned. Er et NYT domæne åbnet, er det en beslutning "
      + "der skal skrives ned.");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   OG DEN BREDE MÅLING
   ══════════════════════════════════════════════════════════════════════════ */

describe("Hvor mange noder står åbne", () => {
  /**
   * ⚠ TALLET ER IKKE ET MÅL, DET ER EN MÅLING. En node uden permission er
   * ikke i sig selv forkert — `virksomhed`, `moduler` og `abonnement` SKAL
   * kunne læses af enhver i tenanten, ellers kan låseskærmen ikke tegnes.
   * Prøven står her så tallet ikke kan stige i tavshed.
   */
  it("⚠ ANTALLET AF NODER UDEN LÆSE-PERMISSION ER MÅLT", () => {
    /* ⚠ 29 → 30, Skive 2B: `navvisning` tilføjet, MED VILJE UDEN
       læse-permission — samme begrundelse som `dashboardvisning` ved
       siden af, som allerede talte med i de 29. En VISNING (hvilke
       topniveaupunkter en bruger får vist) er ikke en sikkerhedsgrænse:
       enhver i tenanten skal kunne se sin egen indstilling, og noden
       læses aldrig af nogen anden regel. Se src/fleet/navvisning.js's
       hoved. Dette er en dokumenteret stigning, ikke en tavs én. */
    const uden = NODER.filter((n) => !n.perms.length);
    assert.ok(uden.length <= 30,
      `${uden.length} noder kræver ingen læse-permission — det var 39 før `
      + `beslutning 104, 29 efter, og 30 fra Skive 2B (navvisning). Er en `
      + `node blevet åbnet igen?\n  `
      + uden.map((n) => n.sti).join("\n  "));
  });

  it("⚠ OG DE TOLV SENSITIVE ER UÆNDRET GATED", () => {
    /* Beslutning 17's opdeling må ikke tabes undervejs. */
    const med = NODER.filter((n) => n.perms.length);
    assert.ok(med.length >= 22,
      `kun ${med.length} noder kræver en permission — der var 12 før 104 og `
      + `22 efter (10 nye)`);
    for (const sti of ["sensitive/bookinger", "sensitive/kunder",
      "sensitive/personale", "vaerdi/bookinger"]) {
      assert.ok(NODER.find((n) => n.sti === sti)?.perms.length,
        `${sti} har mistet sin permission`);
    }
  });
});

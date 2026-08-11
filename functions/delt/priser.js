/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/priser.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/* src/fleet/priser.js
 * Prislisten for abonnementet — og hvordan en periode bliver til linjer.
 *
 * ---------------------------------------------------------------------------
 * TRE AKSER PR. MODUL, OG DE ER UAFHÆNGIGE
 *
 *   basisOere         pr. måned, uanset kundens størrelse
 *   prBrugerOere      pr. login, og med FORSKELLIG pris pr. brugerart
 *   prKoeretoejOere   pr. køretøj i flåden
 *
 * Et modul kan bruge én, to eller alle tre. Er en sats 0 eller fraværende,
 * faktureres den akse ikke — så Flåde kan koste pr. køretøj, Bemanding pr.
 * chauffør, og Opsætning ingenting.
 *
 * ⚠ ANTALLET ER TENANTENS, SATSEN ER MODULETS. Det er værd at have præcist:
 * har kunden fire moduler der hver koster pr. bruger, betaler han fire gange
 * pr. bruger. Det er sådan modellen VIRKER, og det er sjældent sådan man vil
 * sælge. Vil man have brugerprisen én gang for hele platformen, sættes den på
 * ét modul — i praksis `dashboard`, som ingen kan fravælge.
 *
 * ---------------------------------------------------------------------------
 * ⚠ EN BRUGER ER ET LOGIN, IKKE EN MEDARBEJDER.
 *
 * `personale/` er alle ansatte. `brugere/` er dem der har en konto. En
 * chauffør har måske slet intet login (det står i CLAUDE.md), og at fakturere
 * for ham ville være at fakturere for en række i et kartotek. Tællingen sker
 * på brugerindekset.
 *
 * Brugerarten udledes af ROLLEN på loginnet — ikke af et felt nogen sætter.
 * Et felt ville kunne stå og pege på noget andet end rollen, og så ville
 * fakturaen og adgangen være uenige om hvad personen er.
 *
 * ---------------------------------------------------------------------------
 * INGEN IMPORTS UD OVER beloeb.js. Begge kopieres til functions/delt/, fordi
 * den funktion der fryser en periode kører server-side. Aritmetikken må ikke
 * skrives af — se noten i beloeb.js.
 */
import {
  ANTAL_SKALA, antalFraTal, rabatteretSatsOere, totalerAfLinjer,
} from "./beloeb.js";

/* ---- Brugerarter ------------------------------------------------------- */

/**
 * ⚠ TO ARTER, OG GRÆNSEN GÅR VED ROLLEN.
 *
 * En chauffør bruger appen i en lastbil og skriver indberetninger. Alle andre
 * roller sidder ved en skærm og disponerer, godkender eller bogfører. De to
 * koster ikke det samme at levere, og de skal ikke koste det samme.
 *
 * Listen er UDTØMMENDE med vilje: en ny rolle i `permissions.js` uden en art
 * her skal fælde en prøve. Ellers ville den lydløst blive faktureret som
 * desktop, hvilket er den dyre af de to.
 */
export const BRUGERART = {
  chauffoer: {
    art: "chauffoer",
    label: "Chauffør",
    hvad: "Kører og indberetter. Bruger appen i bilen.",
    roller: ["chauffoer"],
  },
  desktop: {
    art: "desktop",
    label: "Desktopbruger",
    hvad: "Disponerer, godkender, bogfører eller reviderer.",
    roller: ["casehandler", "disponent", "koordinator", "revisor", "admin"],
  },
};

export const ALLE_BRUGERARTER = Object.keys(BRUGERART);

/**
 * Rollen → brugerarten.
 *
 * ⚠ EN UKENDT ROLLE GIVER null, IKKE "desktop". Fejler man åbent her,
 * fakturerer man for noget man ikke kan gøre rede for. Kalderen skal opdage
 * at der er en rolle han ikke kender — ikke få den dyreste sats som gæt.
 */
export function brugerartFor(rolle) {
  for (const a of ALLE_BRUGERARTER) {
    if (BRUGERART[a].roller.includes(rolle)) return a;
  }
  return null;
}

/**
 * Tæl logins pr. brugerart.
 *
 * ⚠ SPÆRREDE LOGINS TÆLLER IKKE MED. Et spærret login kan ikke bruges, og
 * at fakturere for det ville være at fakturale for en adgang der er lukket.
 * Det er samtidig den ærlige vej rundt om et spørgsmål: en kunde der fyrer en
 * chauffør, spærrer loginnet — han sletter det ikke, fordi der hænger
 * indberetninger på uid'et.
 *
 * `ukendte` returneres frem for at blive slugt: en rolle uden art er en fejl
 * i kataloget, ikke en gratis bruger.
 */
export function taelBrugere(brugere = {}) {
  const antal = Object.fromEntries(ALLE_BRUGERARTER.map((a) => [a, 0]));
  const ukendte = [];
  for (const b of Object.values(brugere || {})) {
    if (b?.spaerret === true) continue;
    const art = brugerartFor(b?.rolle);
    if (!art) { ukendte.push(b?.rolle ?? null); continue; }
    antal[art] += 1;
  }
  return { antal, ukendte };
}

/**
 * Tæl køretøjer i flåden.
 *
 * ⚠ SOLGTE OG SKROTTEDE TÆLLER IKKE MED. De bliver stående for evigt — en
 * solgt bil hardslettes aldrig, der hænger indberetninger og
 * omkostningshistorik på id'et (beslutning 18). Talte de med, ville en kundes
 * regning vokse hvert år uden at han fik mere.
 *
 * En trailer tæller som ét køretøj. Skal påhæng koste noget andet, er det en
 * ny sats i prislisten — ikke en undtagelse her.
 */
export const AFGAAEDE_STATUS = ["solgt", "skrottet"];

export function taelKoeretoejer(koeretoejer = {}) {
  return Object.values(koeretoejer || {})
    .filter((k) => !AFGAAEDE_STATUS.includes(k?.status)).length;
}

/* ---- Målinger ---------------------------------------------------------- */

/**
 * ÉN MÅLING I DØGNET PR. KUNDE — og den svarer på alt fakturaen skal vide.
 *
 * ```
 * udbyder/maalinger/<kundeId>/<YYYY-MM-DD>/
 *   ms, status, moduler: { flaade: true, … },
 *   brugere: { chauffoer: 12, desktop: 4 }, koeretoejer: 14
 * ```
 *
 * ⚠ DEN KAN IKKE LAVES BAGUD, og det er hele grunden til at den bygges før
 * skærmen. Et slutantal kan ikke rekonstruere en top: en kunde med 30
 * chauffører den 3. og 8 den 31. ville blive faktureret for 8. Vælger man at
 * fakturere på højeste antal, SKAL der samples.
 *
 * ⚠ MÅLINGEN ERSTATTER DEN HÆNDELSESLOG JEG SELV FORESLOG. En daglig prøve
 * bærer både modullisten og statussen, så moduldage kan tælles direkte —
 * dage hvor modulet var slået til. To kilder til "hvad havde kunden hvornår"
 * ville drive fra hinanden, og målingen skal alligevel findes.
 *
 * Auditloggen beholder sin egen post: den svarer på HVEM der slog modulet
 * fra, og det er et andet spørgsmål end hvad der skal faktureres.
 *
 * ⚠ ET MODUL DER VAR TILVALGT I TRE TIMER, FAKTURERES IKKE. Der måles én
 * gang i døgnet. Det står på grundlaget, så ingen tror det er en fejl.
 */
export const MAALING_PR_DOEGN = 1;

/** YYYY-MM-DD i UTC. Samme partitionering som auditloggen bruger. */
export function maalingsdato(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-` +
         `${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Sammenfat en periodes målinger til det linjerne skal bruge.
 *
 * ⚠ HØJESTE ANTAL, PR. BRUGERART FOR SIG. En kunde med 12 chauffører den 3.
 * og 4 desktopbrugere den 27. faktureres for begge toppe, også selvom de
 * aldrig var der samtidig. Det er den regel der er valgt, og den skal stå
 * skrevet: alternativet — toppen af den samlede regning — ville betyde at
 * to kunder med samme forbrug kunne få forskellig pris afhængigt af
 * rækkefølgen.
 *
 * ⚠ DAGE UDEN MÅLING TÆLLER IKKE. En kunde oprettet den 12. har ingen
 * målinger før den 12., og skal ikke faktureres for dem. Det samme gælder en
 * dag hvor funktionen ikke kørte — og DET er værd at kunne se, derfor
 * returneres `dageMaalt`.
 *
 * ⚠ DAGE PÅ PAUSE TÆLLER HELLER IKKE. Beslutning 32 gjorde pause teknisk;
 * her bliver den kommerciel. En pause der ikke fjerner en dag fra regningen,
 * er ikke en pause.
 */
export function sammenfatMaalinger(maalinger = {}) {
  const dage = Object.keys(maalinger || {}).sort();
  const brugere = Object.fromEntries(ALLE_BRUGERARTER.map((a) => [a, 0]));
  const moduldage = {};
  let koeretoejer = 0;
  let dageMaalt = 0;
  let dageFaktureres = 0;

  for (const d of dage) {
    const m = maalinger[d];
    if (!m) continue;
    dageMaalt += 1;
    /* Kun aktive dage tæller. En manglende status er aktiv — samme retning
       som erAktiv() i abonnement.js. */
    if (m.status && m.status !== "aktiv") continue;
    dageFaktureres += 1;

    for (const a of ALLE_BRUGERARTER) {
      const n = Number(m.brugere?.[a]) || 0;
      if (n > brugere[a]) brugere[a] = n;
    }
    const kt = Number(m.koeretoejer) || 0;
    if (kt > koeretoejer) koeretoejer = kt;

    for (const [modul, til] of Object.entries(m.moduler || {})) {
      if (til === true) moduldage[modul] = (moduldage[modul] || 0) + 1;
    }
  }

  return {
    brugere, koeretoejer, moduldage,
    dageMaalt, dageFaktureres,
    foersteDag: dage[0] || null,
    sidsteDag: dage[dage.length - 1] || null,
  };
}

/* ---- Perioden ---------------------------------------------------------- */

/** "2026-08". Én måned. Se noten ved interval i kundeabonnement. */
export const PERIODE_MOENSTER = /^(\d{4})-(\d{2})$/;

/**
 * Periodens grænser og længde.
 *
 * ⚠ UTC HELE VEJEN, som målingernes datoer og auditloggens partitioner. En
 * blanding af UTC og lokal tid ville give 30 eller 32 dage i en måned med
 * sommertidsskifte, og forholdsmæssigheden ville være forkert i to måneder
 * om året — de to hvor ingen leder efter fejlen.
 */
export function periodeGraenser(periode) {
  const m = PERIODE_MOENSTER.exec(String(periode || ""));
  if (!m) return null;
  const aar = Number(m[1]);
  const maaned = Number(m[2]);
  if (maaned < 1 || maaned > 12) return null;
  const fra = Date.UTC(aar, maaned - 1, 1);
  const til = Date.UTC(aar, maaned, 1) - 1;
  return { fra, til, dage: new Date(Date.UTC(aar, maaned, 0)).getUTCDate() };
}

/** Hører datoen "2026-08-11" til perioden "2026-08"? */
export const datoIPeriode = (dato, periode) =>
  typeof dato === "string" && dato.slice(0, 7) === periode;

/** Målingerne der hører til perioden. Resten ignoreres. */
export function maalingerIPeriode(alle = {}, periode) {
  const ud = {};
  for (const [dato, m] of Object.entries(alle || {})) {
    if (datoIPeriode(dato, periode)) ud[dato] = m;
  }
  return ud;
}

/* ---- Prislisten -------------------------------------------------------- */

/**
 * Momssatsen på ABONNEMENTET. Fast 25 %.
 *
 * ⚠ DET SER UD SOM ET BRUD PÅ EN REGEL, OG DET ER DET IKKE — men forskellen
 * er værd at have præcist, for de to ligner hinanden.
 *
 * `CLAUDE.md` siger: *sæt aldrig en momssats fordi den mangler — ikke 25,
 * ikke 0.* Den regel gælder KUNDENS fakturagrundlag (vognmanden → hans
 * kunder), hvor satsen faktisk varierer: kørsel til udlandet, EU-handel med
 * omvendt betalingspligt og momsfri persontransport har ikke 25. Dér ville et
 * gæt være en forkert momsangivelse.
 *
 * Det her er en anden faktura: FleetControl → en dansk vognmand, for et
 * stykke software. Den er 25 % hver eneste gang så længe kunden er dansk. At
 * lade et felt stå åbent ville ikke give præcision — det ville give en
 * tastefejl at lave, og en pris der pludselig var 2,5 %.
 *
 * ⚠ FORUDSÆTNINGEN ER AT ALLE KUNDER ER DANSKE. Kommer den første kunde i
 * Sverige eller Tyskland, er det omvendt betalingspligt og 0 %, og så skal
 * satsen ligge på KUNDEN. Den står derfor ét sted — her — så det bliver én
 * linje at rette og ikke en jagt. Reglerne validerer stadig 0-100, så
 * datamodellen behøver ikke ændres den dag.
 */
export const MOMSSATS = 25;

/* Graenserne for hvornaar en prisliste kan gaelde fra. Se validerPrisliste. */
export const GYLDIG_FRA_TIDLIGST = Date.UTC(2020, 0, 1);
export const GYLDIG_FRA_SENEST = Date.UTC(2100, 0, 1);

/** En tom prisliste for de moduler der kan sælges. */
export function tomPrisliste(moduler = []) {
  const ud = {};
  for (const m of moduler) {
    ud[m] = {
      basisOere: 0,
      prBrugerOere: Object.fromEntries(ALLE_BRUGERARTER.map((a) => [a, 0])),
      prKoeretoejOere: 0,
    };
  }
  return ud;
}

const erHeltal = (n) => Number.isInteger(n) && n >= 0;

/**
 * ⚠ SATSER ER ØRE SOM INTEGER. Ikke kroner, ikke float. Beslutning 2, og den
 * gælder også når det er OS der sender regningen.
 *
 * ⚠ MOMSSATSEN VALIDERES, MEN GÆTTES IKKE. Mangler den, er prislisten
 * ugyldig — den bliver ikke bare til 25. Se validerLinje() i grundlag.js.
 */
export function validerPrisliste(liste = {}, { kendteModuler = [] } = {}) {
  const fejl = [];

  if (!Number.isFinite(liste.momssats)) {
    fejl.push("Momssatsen mangler. Den gættes ikke — heller ikke til 25.");
  } else if (liste.momssats < 0 || liste.momssats > 100) {
    fejl.push("Momssatsen skal være mellem 0 og 100.");
  }
  /* ⚠ EN DATO, IKKE BARE ET TAL. Number.isFinite(0) er sandt, og 0 er
     1. januar 1970 — en prisliste der gaelder fra dengang, vinder over
     ingenting og staar foerst i enhver sortering. Den slap igennem, fordi
     tjekket kun spurgte om vaerdien var et TAL.

     Nedre graense er 2020: foer det fandtes hverken FleetControl eller en
     kunde. Oevre er ti aar frem — en pris man laegger laengere ude end det, er
     en tastefejl i aarstallet, ikke en plan. */
  if (!Number.isFinite(liste.gyldigFraMs)) {
    fejl.push("gyldigFraMs mangler. En prisliste uden dato kan ikke stilles op mod en periode.");
  } else if (liste.gyldigFraMs < GYLDIG_FRA_TIDLIGST || liste.gyldigFraMs > GYLDIG_FRA_SENEST) {
    fejl.push("Datoen ser forkert ud. Den skal ligge mellem 2020 og ti år frem.");
  }

  const moduler = liste.moduler || {};
  for (const [modul, p] of Object.entries(moduler)) {
    if (kendteModuler.length && !kendteModuler.includes(modul)) {
      fejl.push(`Ukendt modul: ${modul}`);
    }
    if (p?.basisOere != null && !erHeltal(p.basisOere)) {
      fejl.push(`${modul}: basisOere skal være hele øre.`);
    }
    if (p?.prKoeretoejOere != null && !erHeltal(p.prKoeretoejOere)) {
      fejl.push(`${modul}: prKoeretoejOere skal være hele øre.`);
    }
    for (const [art, sats] of Object.entries(p?.prBrugerOere || {})) {
      if (!ALLE_BRUGERARTER.includes(art)) fejl.push(`${modul}: ukendt brugerart "${art}".`);
      else if (sats != null && !erHeltal(sats)) {
        fejl.push(`${modul}: prBrugerOere.${art} skal være hele øre.`);
      }
    }
  }
  return fejl;
}

/**
 * Den prisliste der gjaldt på et tidspunkt.
 *
 * ⚠ SENESTE gyldigFraMs SOM IKKE ER EFTER ms. Samme mønster som `gyldigFra`
 * på en sats (CLAUDE.md): en ny pris er en NY post, og den gamle bliver
 * stående. Ingen liste rettes.
 */
export function gaeldendePrisliste(lister = {}, ms) {
  const kandidater = Object.entries(lister || {})
    .map(([id, l]) => ({ id, ...l }))
    .filter((l) => Number.isFinite(l.gyldigFraMs) && l.gyldigFraMs <= ms)
    .sort((a, b) => b.gyldigFraMs - a.gyldigFraMs);
  return kandidater[0] || null;
}

/* ---- Fra periode til linjer -------------------------------------------- */

export const LINJEAKSE = {
  basis: { akse: "basis", label: "Abonnement", enhed: "måned" },
  bruger: { akse: "bruger", label: "Brugere", enhed: "bruger" },
  koeretoej: { akse: "koeretoej", label: "Køretøjer", enhed: "køretøj" },
};

/**
 * Linjerne for én kunde i én periode.
 *
 * ⚠ FORHOLDSMÆSSIGHED GÅR I `antal`, IKKE I SATSEN. En kunde der havde
 * Bemanding i 19 af 31 dage får `antal = 613` (altså 0,613 måned) og den
 * fulde månedssats. Regnede vi en dagspris ud i stedet, ville der afrundes
 * pr. dag, og 31 dage ville ikke give en hel måned tilbage.
 *
 * ⚠ RABATTEN REGNES IND I SATSEN, ÉN GANG. Se rabatteretSatsOere() i
 * beloeb.js: lagde man den oven på linjebeløbet, ville der afrundes to gange,
 * og summen af linjerne ville holde op med at stemme med totalen.
 *
 * Linjen bærer `listeprisOere` og `rabatBps` som DOKUMENTATION — men ét tal
 * går ind i regnestykket.
 *
 * @param prisliste   { momssats, moduler: { <modul>: {...} } }
 * @param moduldage   { <modul>: antal dage modulet var tilvalgt i perioden }
 * @param dageIPerioden
 * @param antalBrugere { chauffoer, desktop }
 * @param antalKoeretoejer
 * @param rabatBps
 */
/**
 * Hvilken rabat gælder på ET modul?
 *
 * ⚠ EN GENEREL RABAT OVERRULER ALT. Er der tastet en procent i kundens
 * rabatfelt, gælder den på hver linje — også på et modul der har sin egen.
 * Modulrabatterne er stadig gemt, så de træder i kraft igen i det øjeblik den
 * generelle sættes til nul.
 *
 * ⚠ REGLEN STÅR HER OG KUN HER. Skrev skærmen sin egen udgave, ville den vise
 * ét tal og serveren fakturere et andet — og det ville først blive opdaget når
 * kunden lagde linjerne sammen. Både formularen, generatoren og eksporten
 * spørger den her funktion.
 *
 * NUL BETYDER "INGEN GENEREL RABAT", ikke "0 % på alt". Det er forskellen på
 * et tomt felt og et felt med et nul i, og den skal kunne mærkes: ellers
 * kunne man ikke slå den generelle fra igen uden at miste modulrabatterne.
 */
export function rabatFor(modul, { rabatBps = 0, rabatModulBps = {} } = {}) {
  const generel = Number.isInteger(rabatBps) ? rabatBps : 0;
  if (generel > 0) return generel;
  const paaModul = rabatModulBps?.[modul];
  return Number.isInteger(paaModul) && paaModul > 0 ? paaModul : 0;
}

export function linjerForPeriode({
  prisliste, moduldage = {}, dageIPerioden,
  antalBrugere = {}, antalKoeretoejer = 0, rabatBps = 0, rabatModulBps = {},
} = {}) {
  const linjer = [];
  if (!prisliste || !Number.isFinite(dageIPerioden) || dageIPerioden <= 0) return linjer;

  const momssats = prisliste.momssats;
  const moduler = prisliste.moduler || {};

  const laeg = ({ modul, akse, brugerart, enheder, listeprisOere, dage }) => {
    /* ⚠ RABATTEN SLAAS OP PR. MODUL. rabatFor() afgoer om den generelle
       overruler modulets — reglen staar ét sted, saa skaerm og server ikke
       kan regne forskelligt. */
    const bps = rabatFor(modul, { rabatBps, rabatModulBps });
    if (!erHeltal(listeprisOere) || listeprisOere === 0) return;
    if (!enheder || enheder <= 0) return;
    const andel = Math.min(1, Math.max(0, dage / dageIPerioden));
    if (andel === 0) return;
    /* antal = enheder × andel af perioden, i tusindedele. */
    const antal = antalFraTal(enheder * andel);
    if (antal === 0) return;
    linjer.push({
      modul, akse, brugerart: brugerart || null,
      antal,
      satsOere: rabatteretSatsOere(listeprisOere, bps),
      momssats,
      /* Dokumentation. Ikke regnegrundlag. */
      listeprisOere, rabatBps: bps, enheder, dage, dageIPerioden,
    });
  };

  for (const modul of Object.keys(moduler).sort()) {
    const p = moduler[modul] || {};
    const dage = moduldage[modul] ?? 0;
    if (dage <= 0) continue;

    laeg({ modul, akse: "basis", enheder: 1, listeprisOere: p.basisOere, dage });

    for (const art of ALLE_BRUGERARTER) {
      laeg({
        modul, akse: "bruger", brugerart: art,
        enheder: antalBrugere[art] || 0,
        listeprisOere: p.prBrugerOere?.[art], dage,
      });
    }

    laeg({
      modul, akse: "koeretoej", enheder: antalKoeretoejer,
      listeprisOere: p.prKoeretoejOere, dage,
    });
  }
  return linjer;
}

/** Totalerne for et sæt abonnementslinjer. Samme funktion som kundefakturaen. */
export const abonnementstotaler = (linjer) => totalerAfLinjer(linjer);

export { ANTAL_SKALA };

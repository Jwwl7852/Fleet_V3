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

/* ---- Prislisten -------------------------------------------------------- */

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
  if (!Number.isFinite(liste.gyldigFraMs)) {
    fejl.push("gyldigFraMs mangler. En prisliste uden dato kan ikke stilles op mod en periode.");
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
export function linjerForPeriode({
  prisliste, moduldage = {}, dageIPerioden,
  antalBrugere = {}, antalKoeretoejer = 0, rabatBps = 0,
} = {}) {
  const linjer = [];
  if (!prisliste || !Number.isFinite(dageIPerioden) || dageIPerioden <= 0) return linjer;

  const momssats = prisliste.momssats;
  const moduler = prisliste.moduler || {};

  const laeg = ({ modul, akse, brugerart, enheder, listeprisOere, dage }) => {
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
      satsOere: rabatteretSatsOere(listeprisOere, rabatBps),
      momssats,
      /* Dokumentation. Ikke regnegrundlag. */
      listeprisOere, rabatBps, enheder, dage, dageIPerioden,
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

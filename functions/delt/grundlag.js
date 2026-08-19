/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/grundlag.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/* src/fleet/grundlag.js
 * Fakturagrundlaget. BESLUTNING 25.
 *
 * ⚠ BESLUTNING 25 ER ANTAGELSER, IKKE AFGJORTE KRAV. Hele denne fil bygger på
 * hvordan vi TROR en vognmand arbejder. Den skal efterprøves hos første kunde,
 * og de steder hvor et forkert gæt ville koste penge, gætter vi ikke — se
 * momssatsen nedenfor.
 *
 * INGEN FIREBASE-IMPORT. Ren kerne, som gitter.js og opgaver.js: den Cloud
 * Function der godkender og låser et grundlag, skal bruge NØJAGTIG samme
 * regler som skærmen. Ligger reglen kun i skærmen, er den ikke en regel.
 *
 * ---------------------------------------------------------------------------
 * HVAD ET GRUNDLAG ER, OG HVAD DET IKKE ER
 *
 * Et grundlag er den OPGØRELSE vi mener kunden skal betale for — linjerne,
 * satserne og hvor hver linje kommer fra. Det er IKKE en faktura. Fakturaen
 * dannes i regnskabssystemet ud fra grundlaget, og fakturanummeret hører dér.
 *
 * Grunden til at skille dem: en faktura er et bogføringsdokument med sine egne
 * krav, og en vognmand har allerede et system der laver dem. Byggede vi
 * fakturaen her, ville vi konkurrere med e-conomic om noget de gør bedre — og
 * så ville tallene stå to steder. Grundlaget er derimod vores: det er os der
 * ved hvad bilen kørte, hvem der sad i den, og hvad der blev brugt.
 * ---------------------------------------------------------------------------
 */

import { naesteNummer, forloebstilstand } from "./booking-state.js";
import {
  linjeBeloebOere, linjeMomsOere, totalerAfLinjer,
} from "./beloeb.js";

/* ---- Nummerserie ----------------------------------------------------- */

/** GRL-ÅÅÅÅ-NNNNN. Samme counter-mekanisme som beslutning 8 — ikke et nyt
 *  system. Skrives af en Cloud Function; klienten kalder den aldrig selv. */
export const naesteGrundlagsnummer = (db, path) =>
  naesteNummer(db, path, { praefiks: "GRL", serie: "grundlag" });

/* ---- Linjearter ------------------------------------------------------ */

/**
 * Hvad en linje KOMMER FRA — ikke hvad den hedder på fakturaen.
 *
 * Arten afgør om linjen kan efterprøves. En `koersel`-linje peger på en etape
 * og kan holdes op mod den; en `manuel` linje er disponentens ord. Begge må
 * findes, men de er ikke lige meget værd, når kunden ringer og spørger.
 * Derfor står `kraeverKilde` her frem for i en kommentar: den er en regel.
 */
export const LINJE_ART = {
  koersel: {
    art: "koersel", label: "Kørsel", kraeverKilde: true, kildeArt: "etape",
    enhed: "tur",
  },
  ventetid: {
    art: "ventetid", label: "Ventetid", kraeverKilde: true, kildeArt: "etape",
    enhed: "time",
  },
  tillaeg: {
    /* Bro, færge, ADR-tillæg, weekendtillæg. Kommer fra bookingens satser. */
    art: "tillaeg", label: "Tillæg", kraeverKilde: false, kildeArt: null,
    enhed: "stk",
  },
  materiale: {
    /* Chaufførappens materialelinjer. Se indberetninger.js — den linje der
       står her, er hvad vi SÆLGER. Lagertrækket er en anden postering. */
    art: "materiale", label: "Materiale", kraeverKilde: true, kildeArt: "indberetning",
    enhed: "stk",
  },
  lager: {
    /* ⚠ EN LAGERLINJE PEGER IKKE PÅ ÉN KILDE, og det er ikke sjusk.
       Afregningen grupperer mange bevægelser til én linje pr. ydelse og pr.
       sats — "3 håndteringer à 120,00". Et enkelt kilde-id ville udpege den
       ene af dem og skjule de to andre. Linjen kan stadig efterprøves: den
       bærer perioden gennem grundlaget, og bevægelserne ligger i basen.
       Se afregningslinjer() i warehouse.js. */
    art: "lager", label: "Lagerydelse", kraeverKilde: false, kildeArt: null,
    enhed: "stk",
  },
  manuel: {
    art: "manuel", label: "Manuel linje", kraeverKilde: false, kildeArt: null,
    enhed: "stk",
  },
};

export const ALLE_LINJEARTER = Object.keys(LINJE_ART);

/* ---- Tilstande -------------------------------------------------------- */

/**
 * Tre tilstande. Ikke fire — "erstattet" er IKKE en tilstand, se erstat().
 *
 * kladde   → kan redigeres af hvem som helst med grundlag.skriv
 * godkendt → linjerne er låst; kan stadig trækkes tilbage til kladde
 * laast    → eksporteret. Kan ikke ændres og ikke trækkes tilbage.
 *
 * Låsningen er ikke pænhed. Når grundlaget er eksporteret til regnskabet,
 * findes tallet et sted vi ikke kontrollerer. Ændrer vi vores kopi bagefter,
 * har vi to sandheder og ingen måde at se hvilken der blev faktureret.
 */
export const GRUNDLAG_TILSTAND = {
  kladde:   { label: "Kladde",   pill: "info", redigerbar: true,  eksporterbar: false },
  godkendt: { label: "Godkendt", pill: "warn", redigerbar: false, eksporterbar: true  },
  laast:    { label: "Låst", pill: "ok", redigerbar: false, eksporterbar: true  }
};

export const erRedigerbar = (g) => Boolean(GRUNDLAG_TILSTAND[g?.tilstand]?.redigerbar);

/**
 * ⚠ GÆLDENDE ER ET AFLEDT SPØRGSMÅL — det gemmes ikke. Beslutning 6.
 *
 * Et grundlag er gældende, når intet andet har erstattet det. Gemte vi et
 * `gaeldende: true`, skulle to poster opdateres i takt hver gang noget blev
 * erstattet, og den dag de to kom ud af trit, ville vi enten fakturere det
 * samme to gange eller slet ikke.
 */
export const erGaeldende = (g) => Boolean(g) && !g.erstattetAfId;

/**
 * Et grundlag som det ligger i RTDB → den form domænet regner med.
 *
 * ⚠ RTDB HAR INGEN ARRAYS. `linjer` og `historik` ligger som objekter, mens
 * hver eneste funktion herunder itererer dem: `kanGodkende()` gør
 * `for (const l of grundlag.linjer)`, `godkend()` gør `[...historik]`. Et
 * objekt kaster begge steder — og fejlen kommer ud et sted der intet har med
 * årsagen at gøre. Serveren så det som "INTERNAL"; skærmen så det som en
 * hvid side.
 *
 * ⚠ OG OVERSÆTTELSEN STÅR HÉR, ÉT STED. Den var skrevet af inde i
 * `hentGrundlag()` i functions/index.js, og da skærmen begyndte at læse
 * noden, manglede den samme oversættelse i klienten. To kopier af den samme
 * kendsgerning, hvor den ene ikke fandtes endnu. Filen kopieres til
 * `functions/delt/`, så serveren kalder den samme.
 */
export function fraDb(post, id) {
  if (!post) return null;
  return {
    ...post,
    id: id ?? post.id,
    linjer: Array.isArray(post.linjer) ? post.linjer : Object.values(post.linjer || {}),
    historik: Array.isArray(post.historik) ? post.historik : Object.values(post.historik || {}),
  };
}

/* ---- Beløb ------------------------------------------------------------ */

/* ⚠ ARITMETIKKEN ER FLYTTET TIL beloeb.js, OG DEN BLIVER DÉR.
 *
 * Abonnementsfaktureringen (FleetControl → vognmanden) skal regne præcis
 * som den her (vognmanden → hans kunde), og den kører server-side i en
 * Cloud Function. Filen her importerer booking-state.js og kan derfor ikke
 * kopieres til functions/delt/ — så uden udskillelsen skulle tallene skrives
 * af, og der ville være TO afrundingsregler i ét repo. Det er den fejl der
 * bliver ved: Bil 104 med to nummerplader, to divisionsfiltre, to demo-sæt.
 *
 * De re-eksporteres, så ingen kalder skal ændres. Der er stadig ÉN
 * definition; den ligger bare et sted både klienten og serveren kan nå. */
export {
  ANTAL_SKALA, antalFraTal, talFraAntal, linjeBeloebOere, linjeMomsOere,
} from "./beloeb.js";

/**
 * Totalerne. BEREGNET, aldrig gemt — beslutning 6.
 *
 * `momsOere` er null, hvis bare én linje mangler sin sats. Et halvt momsbeløb
 * er værre end intet: det ser ud som om det er regnet ud.
 */
export const totaler = (grundlag) => totalerAfLinjer(grundlag?.linjer || []);

/* ---- Validering ------------------------------------------------------- */

/**
 * validerLinje(linje) → string[] med fejl. Tom liste betyder gyldig.
 *
 * ⚠ MOMSSATSEN GÆTTES IKKE. Den står pr. linje, og en linje uden sats
 * blokerer eksporten.
 *
 * Det ville være nemt at sætte 25 som standard — det er den danske sats, og
 * det ville være rigtigt de fleste gange. Men "de fleste gange" er ikke godt
 * nok her: kørsel til udlandet, EU-handel med omvendt betalingspligt og
 * momsfri persontransport har ikke 25. Rammer vi forkert, er det ikke en
 * visningsfejl — det er en momsangivelse der er forkert, og den opdages af
 * SKAT frem for af os. Et system der gætter rigtigt ni gange ud af ti, lærer
 * brugeren at stole på det tiende gæt.
 *
 * ÅBENT SPØRGSMÅL: satserne og hvornår hver især gælder, skal bekræftes af en
 * bogholder FØR første eksport. Se README's liste over hvad der blokerer
 * fase 2. Indtil da er feltet påkrævet og tomt — det tvinger et menneske til
 * at tage stilling, hvilket er det rigtige svar så længe vi ikke kender reglen.
 */
export function validerLinje(linje) {
  const fejl = [];
  const art = LINJE_ART[linje?.art];
  if (!art) {
    fejl.push(`Ukendt linjeart "${linje?.art}".`);
    return fejl; /* Resten kan ikke vurderes uden arten. */
  }
  if (!linje.tekst?.trim()) fejl.push("Linjen mangler en tekst.");
  if (!Number.isInteger(linje.antal) || linje.antal <= 0) {
    fejl.push("Antal skal være et positivt heltal i tusinddele.");
  }
  if (!Number.isInteger(linje.satsOere)) {
    fejl.push("Satsen skal være hele ører som integer.");
  }
  if (art.kraeverKilde && !linje.kilde?.id) {
    fejl.push(`En ${art.label.toLowerCase()}-linje skal pege på en ${art.kildeArt}.`);
  }
  /* Momssatsen valideres, men gør ikke linjen ugyldig at GEMME — kun at
     EKSPORTERE. Man skal kunne skrive grundlaget færdigt og spørge bogholderen
     bagefter. Se kanEksportere(). */
  if (linje.momssats !== undefined && linje.momssats !== null
      && !(Number.isFinite(linje.momssats) && linje.momssats >= 0 && linje.momssats <= 100)) {
    fejl.push("Momssatsen skal være mellem 0 og 100.");
  }
  return fejl;
}

export const linjerUdenMoms = (grundlag) =>
  (grundlag?.linjer || []).filter((l) => !Number.isFinite(l.momssats));

/* ---- Opbygning -------------------------------------------------------- */

/**
 * byggGrundlag({ bookingId, kundeId, division, linjer, udarbejdetAf }, nu)
 *
 * Bygger posten. SKRIVER IKKE — nummeret kommer fra en transaction i en Cloud
 * Function, og to disponenter kan ramme samme sekund.
 *
 * ⚠ FELTNAVNENE ER DANSKE: udarbejdetAf og godkendtAf. De hedder ikke
 * preparedBy/approvedBy. Domænelogikken er dansk hele vejen, og et enkelt
 * engelsk felt midt i en dansk post er den slags der breder sig.
 *
 * udarbejdetAf og godkendtAf er UID — det er hvem der GJORDE noget, ikke hvem
 * det handler om. Se noten i personale.js. Chaufføren på etapen står på
 * etapen som personId og har måske intet login.
 */
/**
 * ⚠ ET GRUNDLAG HØRER TIL ET FORLØB — ELLER TIL EN PERIODE. Aldrig ingen af
 * delene, og aldrig begge.
 *
 * Den oprindelige regel var kun forløbet: et grundlag var en TUR der skulle
 * faktureres. Så kom lagerafregningen, og den hører ikke til en tur — den
 * gør en PERIODE op for én kunde (PRISER.md etape 6). Uden den anden
 * mulighed kunne et lager slet ikke faktureres.
 *
 * ⚠ MEN "INGEN AF DELENE" ER STADIG FORBUDT. Et grundlag uden ophav kan ikke
 * efterprøves: ingen kan se hvad det dækker, når kunden ringer. Og BEGGE er
 * også forbudt — så ville det være tilfældigt hvilket ophav der forklarede
 * linjerne. Samme form som kundeprisen: enten en egen pris eller en rabat.
 *
 * ⚠ OG DET ER IKKE KOSMETIK FOR kanGodkende(). Etapetjekket giver kun mening
 * for et forløb; et periodegrundlag har ingen etaper at vente på. Uden
 * skellet ville filteret `e.bookingId === grundlag.bookingId` matche etaper
 * UDEN bookingId — og et lagergrundlag ville kunne blive spærret af en etape
 * det intet har med at gøre.
 */
export function byggGrundlag({ bookingId, periode, kundeId, division = "faelles", linjer = [], udarbejdetAf }, nu = Date.now()) {
  const harForloeb = Boolean(bookingId);
  const harPeriode = Boolean(periode?.fra && periode?.til);
  if (harForloeb && harPeriode) {
    throw new Error("byggGrundlag: et grundlag hører til ENTEN et forløb eller en periode — ikke begge.");
  }
  if (!harForloeb && !harPeriode) {
    throw new Error("byggGrundlag: et grundlag hører til et forløb eller en periode.");
  }
  if (harPeriode && periode.fra >= periode.til) {
    throw new Error("byggGrundlag: periodens slut skal ligge efter dens start.");
  }
  if (!udarbejdetAf) throw new Error("byggGrundlag: udarbejdetAf mangler.");
  return {
    bookingId: bookingId ?? null,
    periode: harPeriode ? { fra: periode.fra, til: periode.til } : null,
    kundeId: kundeId ?? null,
    division,
    tilstand: "kladde",
    linjer,
    udarbejdetAf,
    udarbejdetMs: nu,
    godkendtAf: null,
    godkendtMs: null,
    laastMs: null,
    /* To-vejs, se erstat(). Begge er null på et nyt grundlag. */
    erstatterId: null,
    erstattetAfId: null,
    /* Append-only. Begrundelser hører HER, ikke i auditposten — samme regel
       som byggOverride() i personale.js. */
    historik: [{ hvad: "oprettet", af: udarbejdetAf, ms: nu }],
  };
}

/* ---- Godkendelse ------------------------------------------------------ */

/**
 * kanGodkende(grundlag, { etaper, bruger }) → { ok, aarsager }
 *
 * ⚠ ET FORLØB MED ÅBNE ETAPER KAN IKKE FAKTURERES.
 *
 * Det er den vigtigste regel i filen. En åben etape betyder at turen ikke er
 * disponeret færdig — der mangler en bil eller en chauffør på et ben af den.
 * Godkender man grundlaget alligevel, fakturerer man en tur der ikke er kørt
 * helt, og den regning kommer retur. Værre: den kommer retur EFTER at
 * grundlaget er låst, og så skal den korrigeres med et nyt grundlag frem for
 * rettes.
 *
 * `aarsager` er en liste, ikke en enkelt streng. Der kan være flere grunde på
 * én gang, og en skærm der kun viser den første, sender disponenten frem og
 * tilbage — han retter én ting, klikker igen, og får den næste at vide.
 *
 * IKKE håndhævet her: at godkenderen skal være en anden end den der udarbejdede
 * grundlaget. Fire-øjne-princippet er rigtigt i en stor virksomhed og forkert
 * hos en vognmand med to på kontoret, hvor det ville betyde at grundlag aldrig
 * blev godkendt. Det hører som en indstilling pr. tenant — ÅBENT SPØRGSMÅL til
 * første kunde, ikke en regel vi vælger for dem.
 */
export function kanGodkende(grundlag, { etaper = [], bruger } = {}) {
  const aarsager = [];
  if (!grundlag) return { ok: false, aarsager: ["Grundlaget findes ikke."] };

  if (grundlag.tilstand !== "kladde") {
    aarsager.push(`Grundlaget er ${GRUNDLAG_TILSTAND[grundlag.tilstand]?.label?.toLowerCase() || grundlag.tilstand} og kan ikke godkendes igen.`);
  }
  if (!grundlag.linjer?.length) {
    aarsager.push("Grundlaget har ingen linjer.");
  }
  if (!erGaeldende(grundlag)) {
    aarsager.push("Grundlaget er erstattet af et nyere.");
  }

  /* ⚠ SPØRGSMÅLET STILLES TIL forloebstilstand(), IKKE TIL ET FILTER HER.
     "Hvad er en åben etape" er allerede besvaret ét sted, og et andet svar her
     ville drive fra det — nøjagtig som Bookingopsætnings egen kopi af
     divisionsfilteret gjorde, hvor fejlen var usynlig indtil grundlaget under
     den ændrede sig. Det er også mere end et filter kunne klare: annullerede
     etaper tæller ikke med, og det ved forloebstilstand(). */
  /* ⚠ KUN ET FORLØBSGRUNDLAG HAR ETAPER AT VENTE PÅ. Et periodegrundlag —
     en lagerafregning — har ingen, og uden det her led ville filteret matche
     etaper UDEN bookingId og spærre det på noget det intet har med at gøre. */
  const mine = grundlag.bookingId
    ? etaper.filter((e) => e?.bookingId === grundlag.bookingId)
    : [];
  const forloeb = forloebstilstand(mine);
  if (forloeb.harAabneEtaper) {
    aarsager.push(
      forloeb.antal.aabne === 1
        ? "Forløbet har en åben etape — turen er ikke disponeret færdig."
        : `Forløbet har ${forloeb.antal.aabne} åbne etaper — turen er ikke disponeret færdig.`
    );
  }

  for (const l of grundlag.linjer || []) {
    const fejl = validerLinje(l);
    if (fejl.length) aarsager.push(`${l.tekst || l.id || "En linje"}: ${fejl[0]}`);
  }

  return { ok: !aarsager.length, aarsager, godkender: bruger ?? null };
}

/** Posten der skal skrives ved godkendelse. Skriver ikke selv. */
export function godkend(grundlag, { bruger, etaper = [] }, nu = Date.now()) {
  const tjek = kanGodkende(grundlag, { etaper, bruger });
  if (!tjek.ok) throw new Error(`godkend: ${tjek.aarsager[0]}`);
  return {
    tilstand: "godkendt",
    godkendtAf: bruger,
    godkendtMs: nu,
    historik: [...(grundlag.historik || []), { hvad: "godkendt", af: bruger, ms: nu }],
  };
}

/* ---- Eksport og låsning ----------------------------------------------- */

/**
 * Formatversionen står I FILEN, ikke kun i vores hoved.
 *
 * Et eksporteret grundlag ligger hos en bogholder eller i et regnskabssystem
 * længe efter at vi har ændret formatet. Uden et versionsnummer i selve filen
 * kan modtageren ikke se hvilke regler den blev skrevet efter — og vi kan ikke
 * skrive en importrutine der håndterer begge dele. Nummeret koster ingenting
 * nu og er umuligt at tilføje bagudvirkende.
 */
export const EKSPORT_FORMAT_VERSION = 1;

/**
 * kanEksportere(grundlag) → { ok, aarsager }
 *
 * Her er momssatsen ufravigelig. Se noten i validerLinje().
 */
export function kanEksportere(grundlag) {
  const aarsager = [];
  if (!grundlag) return { ok: false, aarsager: ["Grundlaget findes ikke."] };
  if (!GRUNDLAG_TILSTAND[grundlag.tilstand]?.eksporterbar) {
    aarsager.push("Kun et godkendt grundlag kan eksporteres.");
  }
  if (!erGaeldende(grundlag)) {
    aarsager.push("Grundlaget er erstattet af et nyere og må ikke eksporteres.");
  }
  const uden = linjerUdenMoms(grundlag);
  if (uden.length) {
    aarsager.push(
      `${uden.length} ${uden.length === 1 ? "linje mangler" : "linjer mangler"} momssats. ` +
      `Satsen gættes ikke — den skal sættes pr. linje.`
    );
  }
  return { ok: !aarsager.length, aarsager };
}

/**
 * eksporter(grundlag, { nummer }) → objektet der skrives som JSON.
 *
 * KASTER hvis momsen mangler. Det er med vilje at det er en exception frem for
 * et felt der er null: en eksport er en kanal UD af systemet, og en fil med et
 * hul i kan ikke kaldes tilbage fra bogholderens indbakke.
 */
export function eksporter(grundlag, { nummer } = {}) {
  const tjek = kanEksportere(grundlag);
  if (!tjek.ok) throw new Error(`eksporter: ${tjek.aarsager[0]}`);
  const t = totaler(grundlag);
  return {
    formatVersion: EKSPORT_FORMAT_VERSION,
    nummer: nummer ?? grundlag.nummer ?? null,
    bookingId: grundlag.bookingId,
    kundeId: grundlag.kundeId,
    /* Beløb i ØRE, ekskl. moms, som overalt. Modtageren skal ikke gætte på
       enheden — feltnavnet bærer den. */
    beloebOere: t.beloebOere,
    momsOere: t.momsOere,
    ialtOere: t.ialtOere,
    linjer: (grundlag.linjer || []).map((l) => ({
      art: l.art,
      tekst: l.tekst,
      antal: l.antal,
      enhed: l.enhed || LINJE_ART[l.art]?.enhed || "stk",
      satsOere: l.satsOere,
      beloebOere: linjeBeloebOere(l),
      momssats: l.momssats,
      momsOere: linjeMomsOere(l),
      kilde: l.kilde || null,
    })),
    /* Sporet tilbage. Erstatter dette grundlag et tidligere, skal modtageren
       kunne se hvilket — ellers ser korrektionen ud som en ny regning. */
    erstatterId: grundlag.erstatterId || null,
    udarbejdetAf: grundlag.udarbejdetAf,
    godkendtAf: grundlag.godkendtAf,
  };
}

/**
 * kanLaase(grundlag) → { ok, aarsager }
 *
 * ⚠ AT KUNNE EKSPORTERES OG AT KUNNE LÅSES ER TO SPØRGSMÅL. Et LÅST grundlag
 * må gerne eksporteres igen — filen kan være gået tabt i den anden ende — men
 * det må ikke låses igen: så ville `eksportReference` og `laastMs` blive
 * overskrevet, og den første eksport ville forsvinde uden spor.
 *
 * De to var det samme spørgsmål indtil et klik på et låst grundlag fandt
 * forskellen: skærmen tilbød at låse det igen, og `laas()` kastede en rå
 * Error, som kom ud af funktionen som "INTERNAL". En forudsætning der kun
 * håndhæves af en exception, er ikke et svar man kan vise nogen.
 */
export function kanLaase(grundlag) {
  const tjek = kanEksportere(grundlag);
  const aarsager = [...tjek.aarsager];
  if (grundlag?.tilstand === "laast") {
    aarsager.unshift("Grundlaget er allerede låst — en rettelse er et nyt grundlag.");
  }
  return { ok: !aarsager.length, aarsager };
}

/** Låsningen sker EFTER en gennemført eksport, ikke før. Fejler eksporten
 *  halvvejs, skal grundlaget stadig kunne eksporteres igen. */
export function laas(grundlag, { bruger, reference }, nu = Date.now()) {
  if (grundlag?.tilstand !== "godkendt") {
    throw new Error("laas: kun et godkendt grundlag kan låses.");
  }
  return {
    tilstand: "laast",
    laastMs: nu,
    /* Hvor det havnede — bilagsnummer i regnskabet, filnavn, hvad der nu
       gælder. Uden den kan grundlaget ikke findes igen i den anden ende. */
    eksportReference: reference ?? null,
    historik: [...(grundlag.historik || []), { hvad: "laast", af: bruger, ms: nu, reference: reference ?? null }],
  };
}

/* ---- Erstatning ------------------------------------------------------- */

/**
 * erstat(gammelt, { linjer, bruger, begrundelse }) → { nyt, opdateringTilGammelt }
 *
 * ⚠ REFERENCEN GÅR BEGGE VEJE, OG KUN ET GRUNDLAG UDEN erstattetAfId TÆLLER.
 *
 * Et låst grundlag rettes ikke — det erstattes af et nyt. Men så findes der to
 * poster for det samme arbejde, og hvis begge tæller med, har vi faktureret
 * dobbelt. EN RETTELSE MÅ IKKE VÆRE EN FORDOBLING.
 *
 * Derfor to felter, ikke ét:
 *
 *   nyt.erstatterId    → peger BAGUD. Svarer på "hvad rettede denne?"
 *   gammelt.erstattetAfId → peger FREM. Svarer på "gælder denne stadig?"
 *
 * Med kun den bagudrettede reference kan man ikke se på et gammelt grundlag om
 * det stadig gælder — man skal søge hele mængden igennem efter noget der peger
 * på det. Det ville virke i en test med tre poster og fejle stille i
 * produktion, hvor optællingen ikke går den vej. Summen over en periode SKAL
 * kunne filtreres med erGaeldende() alene.
 *
 * Begge skrivninger hører i SAMME atomiske opdatering. Sker kun den ene, står
 * mængden tilbage med enten to gældende grundlag eller ingen.
 */
export function erstat(gammelt, { nytId, linjer, bruger, begrundelse }, nu = Date.now()) {
  if (!gammelt?.id) throw new Error("erstat: det gamle grundlag mangler et id.");
  if (gammelt.erstattetAfId) {
    throw new Error("erstat: grundlaget er allerede erstattet. Erstat det nyeste i kæden.");
  }
  /* ⚠ nytId KRÆVES HER, frem for at kalderen sætter erstattetAfId bagefter.
     RTDB's push() udleverer nøglen FØR skrivningen, så id'et kan haves på
     forhånd — og så kan begge sider af referencen bygges her og skrives i én
     atomisk update(). Overlod vi den ene halvdel til kalderen, ville en
     glemt linje efterlade to gældende grundlag for samme arbejde, og det er
     netop fordoblingen. En regel der kun holder hvis kalderen husker en
     kommentar, er ikke en regel. */
  if (!nytId) {
    throw new Error("erstat: nytId mangler. Allokér nøglen med push() før skrivningen, så begge referencer kan sættes atomisk.");
  }
  if (!begrundelse?.trim()) {
    /* Uden begrundelse er en korrektion ikke til at skelne fra en fejl. Den
       står i historikken — ikke i auditposten, som er en allowliste. */
    throw new Error("erstat: en erstatning kræver en begrundelse.");
  }

  const nyt = {
    id: nytId,
    ...byggGrundlag({
      bookingId: gammelt.bookingId,
      kundeId: gammelt.kundeId,
      division: gammelt.division,
      linjer: linjer ?? gammelt.linjer ?? [],
      udarbejdetAf: bruger,
    }, nu),
    erstatterId: gammelt.id,
    historik: [{ hvad: "erstatter", af: bruger, ms: nu, erstatterId: gammelt.id, begrundelse: begrundelse.trim() }],
  };

  const opdateringTilGammelt = {
    /* TILSTANDEN ÆNDRES IKKE. Et låst grundlag forbliver låst — det ER blevet
       eksporteret, og det kan ikke gøres usket. `erstattetAfId` er svaret på
       om det tæller med, og det er et andet spørgsmål end hvilken tilstand det
       står i. Blandede vi de to, ville "erstattet" blive en tilstand, og så
       ville vi tabe at det også var låst. */
    erstattetAfId: nytId,
    historik: [...(gammelt.historik || []), { hvad: "erstattet", af: bruger, ms: nu, begrundelse: begrundelse.trim() }],
  };

  return { nyt, opdateringTilGammelt };
}

/**
 * Summen over en mængde grundlag.
 *
 * ⚠ FILTRERER PÅ erGaeldende(). Det er hele pointen med to-vejs-referencen, og
 * det er den eneste rigtige måde at lægge grundlag sammen på. Enhver ny
 * optælling skal gå gennem denne funktion frem for at reduce'e selv — en kopi
 * uden filteret er en dobbeltfakturering der ser ud som en sum.
 */
export function summer(grundlag = []) {
  const gaeldende = grundlag.filter(erGaeldende);
  return gaeldende.reduce(
    (acc, g) => {
      const t = totaler(g);
      return {
        beloebOere: acc.beloebOere + t.beloebOere,
        /* Mangler bare ét grundlag sin moms, er summen af moms ukendt. */
        momsOere: acc.momsOere === null || t.momsOere === null ? null : acc.momsOere + t.momsOere,
        antal: acc.antal + 1,
      };
    },
    { beloebOere: 0, momsOere: 0, antal: 0 }
  );
}

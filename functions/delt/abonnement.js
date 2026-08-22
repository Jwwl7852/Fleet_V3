/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/abonnement.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/* src/fleet/abonnement.js
 * Kundens abonnementstilstand — som ét katalog, ét sted.
 *
 * INGEN IMPORTS, som permissions.js, moduler.js og steder.js. Den skal kunne
 * læses af den Cloud Function der sætter statussen, og en delt fil med
 * imports kan ikke kopieres ind i functions/.
 *
 * ---------------------------------------------------------------------------
 * ⚠ SPÆRRINGEN LIGGER IKKE HER. Den ligger i `firebase.rules.json`, hvor hver
 * eneste regel under tenanten kræver at statussen er `aktiv`. Filen her siger
 * hvad tilstandene HEDDER og hvad de betyder for et menneske — den afgør
 * ingenting.
 *
 * Det er hele forskellen på en kontrol og en pæn knap: fjernede man
 * `erAktiv()` fra App.jsx, ville en lukket kunde se shellen — og hver eneste
 * læsning ville stadig blive afvist af serveren.
 *
 * ---------------------------------------------------------------------------
 * ⚠ HVORFOR PAUSE IKKE ER EN LOGINSPÆRRING PÅ KONTOEN.
 *
 * Den nærliggende måde er at sætte `disabled` på hver af kundens konti. Den
 * er en fælde: ved genåbning skal de konti der var spærret INDIVIDUELT blive
 * ved med at være det, og den tilstand findes ikke noget sted efter man har
 * overskrevet den. Man ville genåbne folk der var fyret.
 *
 * Spærringen ligger derfor på TENANTEN og rører ingen konto. Brugeren kan
 * stadig autentificere sig — men han kommer ikke ind, fordi der ikke er
 * noget at komme ind til: reglerne afviser hver læsning, og appen viser
 * låseskærmen. Genåbning er ét felt.
 *
 * Skal en konkret bruger ud, findes knappen i Opsætning → Brugere & roller.
 * Den er pr. bruger, den husker sin tilstand, og den kan rulles tilbage.
 */

export const ABONNEMENT = {
  aktiv: {
    label: "Aktiv",
    pill: "ok",
    hvad: "Kunden kan bruge det han har købt.",
  },
  paused: {
    label: "På pause",
    pill: "warn",
    hvad: "Ingen adgang til data. Intet er slettet, og genåbning er ét klik.",
    /* Det brugeren får at vide. Ikke "der er en fejl" — der er ingen fejl. */
    besked: "Adgangen til systemet er midlertidigt lukket.",
    naeste: "Kontakt FleetControl for at få den åbnet igen. Ingen data er slettet.",
  },
  opsagt: {
    label: "Opsagt",
    pill: "bad",
    hvad: "Abonnementet er ophørt. Data opbevares, men er ikke tilgængelige.",
    besked: "Abonnementet er opsagt.",
    naeste: "Kontakt FleetControl om udlevering eller genåbning.",
  },
};

/**
 * Hvor længe data opbevares efter en opsigelse. 90 dage.
 *
 * ⚠ DER SLETTES INTET AUTOMATISK, og teksten lover heller ikke at der gør.
 * Der står "slettes tidligst" — ikke "slettes den". Egentlig sletning er en
 * manuel proces med en kontrakt bag (beslutning 32), og en skærm der lovede
 * en automatisk sletning der ikke findes, ville være samme slags løgn som at
 * kalde en afvist læsning for en netværksfejl: den ser rigtig ud og er
 * forkert.
 *
 * Skal fristen håndhæves, er det en opgave for sig — og den hører sammen med
 * at auditopbevaringen heller ikke er afgjort. Se BESLUTNINGER.md.
 */
export const OPBEVARING_DAGE = 90;

const DAG_MS = 24 * 60 * 60 * 1000;

/**
 * Datoen data tidligst kan slettes.
 *
 * ⚠ AFLEDT, IKKE GEMT. Den regnes af `aendretMs` hver gang. Et gemt
 * `sletTidligstMs` ville drive fra sit grundlag i det sekund nogen genåbnede
 * og opsagde igen — præcis fejlen i `bemanding.ledig`.
 */
export function opbevaresTil(abonnement) {
  const ms = abonnement?.aendretMs;
  if (abonnement?.status !== "opsagt" || !Number.isFinite(ms)) return null;
  return ms + OPBEVARING_DAGE * DAG_MS;
}

export const ALLE_ABONNEMENTSTATUS = Object.keys(ABONNEMENT);

/**
 * ⚠ FEJLER ÅBENT, og det er den samme retning som `harModul()`.
 *
 * En manglende node betyder "vi har ikke skrevet den endnu", ikke "kunden er
 * lukket". Fejlede den lukket, ville hver kunde der blev oprettet før feltet
 * fandtes stå med et system der afviser alt — og han har betalt.
 *
 * Reglerne fejler åbent på nøjagtig samme måde, og de to SKAL være enige:
 * er klienten strengere end serveren, viser vi en låseskærm oven på en
 * database der svarer fint, og ingen kan forklare hvorfor.
 *
 * Noden er `.write: false`, så ingen kan fjerne den for at slippe udenom.
 */
export function erAktiv(abonnement) {
  const status = abonnement?.status;
  if (!status) return true;
  return status === "aktiv";
}

/** Teksten til låseskærmen. Ukendt status låser — men siger det pænt. */
export function laasetekst(abonnement) {
  const status = abonnement?.status;
  const a = ABONNEMENT[status];
  return {
    label: a?.label || status || "Lukket",
    besked: a?.besked || "Adgangen til systemet er lukket.",
    naeste: a?.naeste || "Kontakt FleetControl.",
  };
}

/**
 * ⚠ ALLOWLISTE, IKKE FRITEKST. Årsagen ender i auditloggen, og fritekst dér
 * er præcis det `audit-regler.js` findes for at holde ude. Den vises ikke for
 * kunden — hvorfor han er lukket, hører i en samtale, ikke i en skærm.
 */
export const AARSAG = {
  betaling: "Manglende betaling",
  kundeoensket: "Kunden har bedt om det",
  proeveperiodeUdloebet: "Prøveperioden er udløbet",
  fejloprettet: "Fejloprettet",
};

export const ALLE_AARSAGER = Object.keys(AARSAG);

/* ══════════════════════════════════════════════════════════════════════════
   HISTORIKKEN — hvem, hvornår og hvorfor
   ══════════════════════════════════════════════════════════════════════════

   `tenants/<id>/abonnementHistorik/<pushId>` er ÉN log over hvad der blev
   ændret i kundens abonnement. ABONNEMENT.md beskrev den som én log frem for
   to — en `modulHistorik` ved siden af en statuslog ville være to svar på
   samme spørgsmål — og det holder.

   ⚠ MEN DEN ER IKKE FAKTURERINGSGRUNDLAGET, OG DET VAR DEN MENT SOM.

   ABONNEMENT.md skrev historikken FØR den daglige måling fandtes. Argumentet
   dér var: en kunde der sættes på pause den 8. og genåbnes den 21., skal
   faktureres for to stykker af måneden, og `abonnement.status` kender kun
   nuet.

   Det spørgsmål er besvaret et andet sted i mellemtiden. `maaldagligt`
   skriver `udbyder/maalinger/<kunde>/<dato>` med både `status` og `moduler`,
   og `sammenfatMaalinger()` regner `moduldage` og `dageFaktureres` af dem.
   Regningen ER en optælling af dage, og den optælling findes.

   Byggede vi historikken som en ANDEN kilde til det samme tal, ville de to
   drive fra hinanden — og så skulle nogen afgøre hvilken der havde ret om en
   faktura der allerede var sendt. Det er `bemanding.ledig` (beslutning 71) og
   Bil 104 med to nummerplader, med penge på.

   ⚠ HISTORIKKEN SVARER PÅ DET MÅLINGEN IKKE KAN: hvem gjorde det, og hvorfor.
   En måling er et fotografi taget kl. 03:10 — den har ingen aktør og ingen
   årsag. Loggen har begge.

   ⚠ OG DEN ER IKKE BARE ÉN AUDITPOST MERE. Auditloggens `note` er afkortet
   til 120 tegn, `LOGBARE_FELTER` filtrerer værdier væk, og retention er 24
   måneder mens bogføringspligten peger mod fem år. **En log man skal kunne
   forklare en faktura med, må ikke kunne afkortes.** De to skrives i samme
   kald og svarer på hver sit.

   ⚠ OG DEN KAN IKKE LAVES BAGUD. Første post er den dag mekanismen kom.
   Skærmen skal sige det frem for at tegne en tom liste, der ligner "der er
   aldrig sket noget".

   Se beslutning 89. */

/**
 * De tre slags hændelse.
 *
 * ⚠ RABAT ER MED, OG ABONNEMENT.md NÆVNTE DEN IKKE. Den hører her af en grund
 * de to andre ikke har: `linjerForPeriode()` får ÉN `rabatBps` for hele
 * perioden — den der står på abonnementet når grundlaget genereres. En rabat
 * sat den 20. prissætter altså også de nitten dage der allerede er gået, og
 * det sker i tavshed. Dagene kan tælles i målingerne; rabatskiftet kan kun
 * ses her.
 */
export const HISTORIK_ART = {
  modul: { label: "Modul", felter: ["modul", "til"] },
  status: { label: "Status", felter: ["status"] },
  rabat: { label: "Rabat", felter: ["rabatBps", "foerBps"] },
};

export const ALLE_HISTORIK_ARTER = Object.keys(HISTORIK_ART);

/** Alle felter en post må bære. `$andet: false` i reglen siger det samme. */
export const HISTORIK_FELTER = [
  "ms", "afUid", "art", "modul", "til", "status", "aarsag", "rabatBps", "foerBps",
];

const erBps = (n) => Number.isInteger(n) && n >= 0 && n <= 10000;

/**
 * Er posten gyldig? Liste af fejl — tom betyder ja.
 *
 * ⚠ DEN HÅNDHÆVES I FUNKTIONEN, IKKE AF REGLEN. Noden er `.write: false`, så
 * en klient kan slet ikke nå `.validate` — og Admin SDK går uden om den. Det
 * er samme greb som `valideOpgaveplan()` på `opgaver` (beslutning 45): reglen
 * beskriver formen, funktionen håndhæver den.
 */
export function valideHistorikpost(post, { kendteModuler = null } = {}) {
  const fejl = [];
  const p = post || {};

  if (!Number.isFinite(p.ms)) fejl.push("ms mangler.");
  if (typeof p.afUid !== "string" || !p.afUid) fejl.push("afUid mangler.");
  if (!ALLE_HISTORIK_ARTER.includes(p.art)) {
    fejl.push(`Ukendt art: ${p.art}`);
    return fejl;
  }

  for (const felt of Object.keys(p)) {
    if (!HISTORIK_FELTER.includes(felt)) fejl.push(`Ukendt felt: ${felt}`);
  }

  if (p.art === "modul") {
    if (typeof p.modul !== "string" || !p.modul) fejl.push("modul mangler.");
    else if (kendteModuler && !kendteModuler.includes(p.modul)) {
      fejl.push(`Ukendt modul: ${p.modul}`);
    }
    if (typeof p.til !== "boolean") fejl.push("til skal være true eller false.");
  }

  if (p.art === "status") {
    if (!ALLE_ABONNEMENTSTATUS.includes(p.status)) {
      fejl.push(`Ukendt status: ${p.status}`);
    }
    /* ⚠ Årsagen er den SAMME allowliste som auditposten bruger. To lister
       ville betyde at en årsag kunne stå i den ene log og ikke i den anden. */
    if (p.aarsag !== undefined && p.aarsag !== null
        && !ALLE_AARSAGER.includes(p.aarsag)) {
      fejl.push(`Ukendt årsag: ${p.aarsag}`);
    }
  }

  if (p.art === "rabat") {
    if (!erBps(p.rabatBps)) fejl.push("rabatBps skal være 0-10000.");
    if (!erBps(p.foerBps)) fejl.push("foerBps skal være 0-10000.");
    if (p.modul !== undefined && kendteModuler && !kendteModuler.includes(p.modul)) {
      fejl.push(`Ukendt modul: ${p.modul}`);
    }
  }

  return fejl;
}

const tal = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);

/**
 * Posterne for ÉN ændring — udledt af FORSKELLEN, ikke af kaldet.
 *
 * ⚠ ET KALD ER IKKE EN HÆNDELSE. Ejerkonsollen sender hele modulsættet hver
 * gang der trykkes Gem, også når intet er ændret. Loggede vi kaldet, ville
 * der stå en post hver gang nogen kiggede og gemte igen — og en log fuld af
 * hændelser der ikke skete, kan ikke bruges til at forklare en faktura.
 *
 * En diff kan ikke lyve om det: ændrede intet sig, er listen tom, og så
 * skrives der ingenting.
 *
 * ⚠ ET FRAVALG OG ET TILVALG ER TO POSTER. Et kald der slår Warehouse til og
 * Facility fra, er to ting der skete — ikke én "ændring af moduler". De
 * skrives i samme atomiske opdatering, så de ikke kan lande halvt.
 */
export function historikposter({ foer = {}, efter = {}, afUid, ms } = {}) {
  const poster = [];
  const grund = { ms, afUid };

  const modulerFoer = foer.moduler || {};
  const modulerEfter = efter.moduler || {};
  if (efter.moduler !== undefined) {
    for (const modul of Object.keys({ ...modulerFoer, ...modulerEfter }).sort()) {
      const f = modulerFoer[modul] === true;
      const e = modulerEfter[modul] === true;
      if (f !== e) poster.push({ ...grund, art: "modul", modul, til: e });
    }
  }

  /* ⚠ EN RETTET ÅRSAG ER OGSÅ EN HÆNDELSE. Sættes en kunde på pause med
     `betaling` og rettes årsagen bagefter til `kundeoensket`, ville en log
     der kun så på statussen stå med den forkerte grund for altid — og det er
     netop det spørgsmål loggen findes for at besvare. */
  const aarsagFoer = foer.aarsag || null;
  const aarsagEfter = efter.aarsag || null;
  if (efter.status !== undefined
      && (efter.status !== foer.status || aarsagEfter !== aarsagFoer)) {
    const p = { ...grund, art: "status", status: efter.status };
    if (aarsagEfter) p.aarsag = aarsagEfter;
    poster.push(p);
  }

  if (efter.rabatBps !== undefined && tal(efter.rabatBps) !== tal(foer.rabatBps)) {
    poster.push({
      ...grund, art: "rabat",
      rabatBps: tal(efter.rabatBps), foerBps: tal(foer.rabatBps),
    });
  }

  /* ⚠ RABAT PR. MODUL ER OGSÅ EN RABATÆNDRING. Den bærer sit modul, og den
     generelle gør ikke — det er den eneste forskel på de to poster. En
     nulstilling er en ændring TIL nul, ikke en post der udebliver. */
  if (efter.rabatModulBps !== undefined) {
    const rFoer = foer.rabatModulBps || {};
    const rEfter = efter.rabatModulBps || {};
    for (const modul of Object.keys({ ...rFoer, ...rEfter }).sort()) {
      const f = tal(rFoer[modul]);
      const e = tal(rEfter[modul]);
      if (f !== e) {
        poster.push({ ...grund, art: "rabat", modul, rabatBps: e, foerBps: f });
      }
    }
  }

  return poster;
}

/**
 * Én linje til skærmen. Teksten, ikke tallet.
 *
 * ⚠ EN POST UDEN ÅRSAG SKAL LIGNE DET. Årsagen er valgfri på en statuspost —
 * en genåbning har sjældent en — og en tom parentes ville se ud som et felt
 * der manglede.
 */
export function historiktekst(post) {
  const p = post || {};
  if (p.art === "modul") {
    return `${p.modul} blev ${p.til ? "tilvalgt" : "fravalgt"}`;
  }
  if (p.art === "status") {
    const label = ABONNEMENT[p.status]?.label || p.status;
    return p.aarsag ? `${label} — ${AARSAG[p.aarsag] || p.aarsag}` : String(label);
  }
  if (p.art === "rabat") {
    const hvad = p.modul ? `Rabat på ${p.modul}` : "Rabat";
    return `${hvad}: ${tal(p.foerBps) / 100} % → ${tal(p.rabatBps) / 100} %`;
  }
  return "Ukendt hændelse";
}

/** Nyeste først. */
export function historikListe(node) {
  return Object.entries(node || {})
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (b.ms || 0) - (a.ms || 0));
}

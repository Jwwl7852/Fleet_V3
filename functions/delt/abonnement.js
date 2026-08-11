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

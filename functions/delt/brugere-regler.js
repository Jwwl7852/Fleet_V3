/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/brugere-regler.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/* src/fleet/brugere-regler.js
 * Reglerne for en ny bruger — uden transport.
 *
 * ⚠ TREDJE GANG SAMME OPDELING: audit.js/audit-regler.js,
 * skriv.js/skriv-regler.js, og nu den her. Grunden er den samme hver gang:
 * transportfilen importerer firebase.js, som laeser import.meta.env og derfor
 * kun kan indlaeses af Vite. Logik der ligger dér, kan ikke proeves i Node —
 * og proevesuiten koerer i Node.
 *
 * Det er ikke et moenster jeg fandt paa: det er permissions.js og
 * personale.js' importfrihed anvendt paa noget der HAR brug for en import.
 */
import { ROLLE_PERMS } from "./permissions.js";

/**
 * ⚠ MINDST 12 TEGN — samme krav som funktionen håndhæver. Står de to tal
 * forskellige steder, afviser serveren en adgangskode formularen godtog.
 */
export const MINDSTE_KODE = 12;

/**
 * Et stærkt startløsen.
 *
 * ⚠ DET VISES ÉN GANG OG KAN IKKE HENTES FREM IGEN. Firebase gemmer kun et
 * hash, og der er ingen mailafsendelse endnu — så administratoren skal give
 * det videre selv. Det er den ærlige mellemtilstand: en "send invitation"-knap
 * der ikke sendte noget, ville være værre.
 *
 * Hvordan en bruger SKAL inviteres, står stadig åbent i
 * FleetControl-spoergsmaal.md.
 */
export function nytLoesen() {
  /* Ingen l, I, 1, O, 0 — de forveksles når nogen læser koden op i telefonen. */
  const tegn = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const ud = new Uint32Array(16);
  crypto.getRandomValues(ud);
  return [...ud].map((n) => tegn[n % tegn.length]).join("");
}

/**
 * ⚠ ÉN DEFINITION, OG DEN LIGGER HER FORDI DEN SKAL MED I `functions/delt/`.
 *
 * Der var TRE kopier af mønsteret: her, i functions/index.js og inline i
 * ejerkonsollens førsteadmin-formular. De var drevet fra hinanden — serveren
 * stod med {2} i stedet for {2,}, altså et topdomæne på NØJAGTIG to tegn.
 *
 * Følgen: jorn@vognmand.dk kunne oprettes, jorn@vognmand.com kunne ikke.
 * Formularen sagde ja, serveren svarede "Ugyldig mailadresse", og der stod
 * ingen steder hvad der var galt med adressen. Det ramte BÅDE kundens egen
 * brugeroprettelse og ejerkonsollens førsteadmin — de deler opretKonto().
 *
 * Prøven i skrivning.test.mjs så det ikke: den prøvede "lars-at-vognmand",
 * en adresse uden krøllet a. Et mailmønster fejler ikke på det grove; det
 * fejler på det almindelige.
 */
const MAIL_MOENSTER = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Sandt for en adresse begge sider godtager. Serveren kalder den samme. */
export const erGyldigMail = (m) => MAIL_MOENSTER.test(String(m || "").trim());

/**
 * ⚠ SPEJLER FUNKTIONEN. Den validerer igen, og er de to uenige, er
 * funktionen rigtig. Formålet er at svare hurtigt frem for at sende et kald
 * afsted der bliver afvist.
 *
 * ⚠ MEN DE TO REGLER DER KAN AFVISE PÅ EN ADRESSE ELLER ET LØSEN — mønsteret
 * og MINDSTE_KODE — er ikke længere spejlet, men DELT: filen står i
 * DELTE_FILER og serveren importerer nøjagtig de samme to. En afskrift af
 * netop dem var det der drev, og et spejl kan ikke opdage sin egen drift.
 */
export function valideNyBruger(post = {}) {
  const f = {};
  if (!post.email?.trim()) f.email = "E-mail skal udfyldes.";
  else if (!erGyldigMail(post.email)) f.email = "Det er ikke en gyldig mailadresse.";
  else if (post.email.length > 120) f.email = "E-mail må højst være 120 tegn.";

  if (!ROLLE_PERMS[post.rolle]) f.rolle = "Vælg en rolle.";
  if (!post.navn?.trim()) f.navn = "Navn skal udfyldes.";
  else if (post.navn.length > 80) f.navn = "Navn må højst være 80 tegn.";

  if (!post.kode || post.kode.length < MINDSTE_KODE) {
    f.kode = `Adgangskoden skal være mindst ${MINDSTE_KODE} tegn.`;
  }
  for (const k of Object.keys(f)) if (!f[k]) delete f[k];
  return f;
}

/* ---- Svar ------------------------------------------------------------- */

export const BRUGERSVAR = {
  ok: "ok",
  /* Kontrollen i funktionen afviste. Systemet virker; du må ikke det her. */
  naegtet: "naegtet",
  /* Formen var forkert — ukendt rolle, for kort løsen, ugyldig mail. */
  ugyldig: "ugyldig",
  /* Adressen er i brug. Ikke en fejl hos os, og ikke noget der bliver bedre
     af at prøve igen. */
  optaget: "optaget",
  /* Kontoen findes ikke længere — slettet uden om systemet, altså i
     Firebase-konsollen. Indekset stod tilbage og pegede på ingenting.
     ⚠ IKKE "forbindelse". Serveren svarede, og svaret var klart; funktionen
     har fjernet rækken. "Prøv igen" ville sende brugeren efter en konto der
     aldrig kommer tilbage. */
  forsvundet: "forsvundet",
  /* Funktionen kunne ikke nås. "Prøv igen" giver mening. */
  forbindelse: "forbindelse",
  /* Ingen Firebase-app. Demo-mode. */
  demo: "demo",
};

/**
 * Oversætter en callable-fejl til en tilstand.
 *
 * ⚠ BESKEDEN FRA FUNKTIONEN BRUGES DIREKTE når den findes. Den er skrevet af
 * os, på dansk, og siger præcis hvad der var galt — "Brugeren hører ikke til
 * din virksomhed" er mere brugbart end en generisk afvisningstekst. Den er
 * ikke fritekst fra en fremmed.
 */
export function tolkBrugerfejl(fejl) {
  const kode = String(fejl?.code || "").replace(/^functions\//, "");
  const besked = fejl?.message || null;
  if (kode === "permission-denied" || kode === "unauthenticated") {
    return { art: BRUGERSVAR.naegtet, besked: besked || "Din rolle må ikke det her." };
  }
  if (kode === "already-exists") {
    return { art: BRUGERSVAR.optaget, besked: besked || "Adressen er allerede i brug." };
  }
  if (kode === "not-found") {
    return {
      art: BRUGERSVAR.forsvundet,
      besked: besked || "Kontoen findes ikke længere. Rækken er fjernet fra listen.",
    };
  }
  if (kode === "invalid-argument" || kode === "failed-precondition") {
    return { art: BRUGERSVAR.ugyldig, besked: besked || "Oplysningerne kunne ikke bruges." };
  }
  return {
    art: BRUGERSVAR.forbindelse,
    besked: "Kunne ikke nå serveren. Ændringen er ikke gennemført. Prøv igen.",
  };
}


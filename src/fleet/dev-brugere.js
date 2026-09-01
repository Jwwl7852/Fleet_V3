/* src/fleet/dev-brugere.js
 * De seedede DEV-brugere — ÉN liste, delt af provisioneringsscriptet og
 * brugervælgeren i shellen.
 *
 * ⚠ HVORFOR LISTEN LIGGER HER OG IKKE I SCRIPTET: fordi to lister driver.
 * Scriptet opretter kontiene, og vælgeren logger ind på dem. Stod de hvert
 * sit sted, ville en tilføjet rolle virke i den ene og mangle i den anden —
 * og fejlen ville se ud som en login-fejl. Det er demo-kilder-mønstret igen;
 * se test/demo-kilder.test.mjs for hvor mange gange det er sket.
 *
 * Listen UDLEDES af ROLLE_PERMS. Den er derfor ikke bare synkron med
 * presetsene — den kan ikke være andet. Samme greb som DEMO_ROLLER i
 * FleetContext.
 *
 * ⚠ INGEN ADGANGSKODE HER. Kontiene deler én kode, som står i
 * VITE_DEV_BRUGER_KODE i .env.local (gitignored) og sættes af scriptet.
 * E-mailadresser er ikke hemmeligheder; en adgangskode er.
 *
 * ⚠ KUN DEV. Kontiene findes udelukkende i fleetcontrol-dev-1ac1c, og
 * scriptet nægter at pege andre steder hen. Vælgeren tegnes kun når
 * miljoe === "dev".
 */
import { permStrengFraRolle, ROLLE_PERMS } from "./permissions.js";
import { erGyldigMail } from "./brugere-regler.js";

/** Tenanten de seedede brugere hører til. Samme id som TENANTS i App.jsx. */
export const DEV_TENANT = "demo";

/** Ikke et rigtigt domæne. Kontiene skal ikke kunne modtage post. */
export const DEV_DOMAENE = "dev.fleetcontrol.invalid";

/** V1-testselskabets tenant-id og de seks rollekontis domæne — se
 *  scripts/provisioner-v1-test-brugere.mjs, som opretter kontiene med
 *  PRÆCIS de her to konstanter, og Brugervaelger.jsx, som bruger dem til
 *  den hostede DEV-brugerskifter (devBrugerSkift). ⚠ functions/index.js kan
 *  IKKE importere herfra — Firebase deployer kun sin egen mappe — og bærer
 *  derfor sin egen kopi af de to strenge, med en note om at de skal følges ad. */
export const V1T_TENANT = "v1-test";
export const V1T_DOMAENE = "v1-test.dev.fleetcontrol.invalid";

/* Kun til visning i sidebaren. Mangler en rolle et navn her, bruges rollen
   selv — listen må ikke kunne blokere for en ny rolle i presettet. */
const NAVN = {
  chauffoer: "Dev Chauffør",
  disponent: "Dev Disponent",
  koordinator: "Dev Koordinator",
  revisor: "Dev Revisor",
  admin: "Dev Administrator",
};

/**
 * ⚠ HVILKEN MEDARBEJDER ER DEV-KONTOEN? Beslutning 103.
 *
 * `brugere/<uid>` bar `email`, `navn` og `rolle`, og INTET der sagde hvilken
 * medarbejder kontoen tilhører. En chauffør kunne logge ind, og systemet kunne
 * ikke svare på hvilke ture der var hans: etapen bærer et `personId`, tokenet
 * et `uid`, og de to mødtes ingen steder.
 *
 * Koblingen skrives i brugerposten, som er `.write: false` — i produktion af
 * `opretbruger`, her af provisioneren. Uden den kunne chaufførappen ikke
 * bygges: der var ikke noget at spørge om.
 *
 * ⚠ KUN DE ROLLER DER ER EN MEDARBEJDER. En admin på kontoret er ikke
 * nødvendigvis en post i `personale`, og feltet er valgfrit netop derfor.
 * `larsAage` er valgt fordi han er chauffør PÅ ETAPER i demo-sættet — et
 * medarbejderkort uden ture ville give en tom app og ligne en fejl.
 */
export const PERSON_FOR_ROLLE = {
  chauffoer: "larsAage",
};

export const DEV_BRUGERE = Object.keys(ROLLE_PERMS).map((rolle) => ({
  rolle,
  email: `${rolle}@${DEV_DOMAENE}`,
  navn: NAVN[rolle] || `Dev ${rolle}`,
  personId: PERSON_FOR_ROLLE[rolle] || null,
}));

/**
 * Din egen konto i DEV, hvis du vil logge ind som dig selv frem for som
 * `admin@dev.fleetcontrol.invalid`.
 *
 * ⚠ ADRESSEN STÅR IKKE I REPOET. Den kommer fra VITE_DEV_EJER_MAIL i
 * .env.local, fordi en navngiven persons mailadresse ikke er en del af
 * produktet. Den næste der kloner, skal ikke arve din.
 *
 * ⚠ AT EJE PRODUKTET ER IKKE ET CLAIM. Kontoen får `admin` i DEV-tenanten,
 * fordi scriptet giver den det — ikke fordi adressen er speciel. Præcis samme
 * vej som de seks andre, og præcis samme vej som en rigtig kunde skal have
 * sin. Der er ingen bagdør, og der skal ikke laves en: en adgang der
 * kommer et andet sted fra end alle andres, er den der bliver glemt, når
 * rettighederne skal gennemgås.
 *
 * @returns {{email, rolle, navn}|null}
 */
export function ejerkonto(mail) {
  const m = (mail || "").trim();
  if (!m) return null;
  /* Tavs frasortering ville betyde at man leder efter en konto der aldrig
     blev forsøgt oprettet. Hellere fejle på en tastefejl. */
  /* ⚠ SAMME MØNSTER SOM ALLE ANDRE STEDER. Her stod en fjerde afskrift, og
     den var LØSERE end de andre: den godtog et topdomæne på ét tegn. Fire
     kopier af det samme spørgsmål gav fire svar. Se brugere-regler.js. */
  if (!erGyldigMail(m)) {
    throw new Error(`VITE_DEV_EJER_MAIL ("${m}") ser ikke ud som en e-mailadresse.`);
  }
  return { email: m, rolle: "admin", navn: m.split("@")[0] };
}

/**
 * Claims for en seedet DEV-bruger.
 *
 * `perms` udledes ALTID af presettet — den skrives ikke i hånden. Ellers
 * kunne en seedet disponent have anden adgang end en rigtig disponent, og så
 * tester man noget andet end det man leverer. Det er beslutning 5's fejl,
 * flyttet ned i provisioneringen.
 *
 * `rolle` er kun til visning. Reglerne læser udelukkende `perms` — se
 * ARKITEKTUR.
 */
export function claimsFor(rolle, tenant = DEV_TENANT) {
  if (!ROLLE_PERMS[rolle]) {
    throw new Error(`claimsFor: ukendt rolle "${rolle}". Se ROLLE_PERMS i permissions.js.`);
  }
  return { tenant, rolle, perms: permStrengFraRolle(rolle) };
}

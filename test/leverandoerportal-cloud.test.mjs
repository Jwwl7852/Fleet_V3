/* test/leverandoerportal-cloud.test.mjs
 * Håndhævelsen i functions/index.js — samme disciplin som
 * opgavestatus.test.mjs's egen "HÅNDHÆVELSEN"-sektion: der er ingen
 * functions-emulator i denne suite (kun database+storage, se firebase.json),
 * så Cloud Functions' RUNTIME-adfærd bevises ikke ved at kalde dem, men ved
 * at læse deres kildetekst som streng og bevise at de kalder den rigtige,
 * i forvejen rene/testede logik — samme greb som "MASKINEN LIGGER IKKE I
 * FUNKTIONEN" for opgavestatus.
 *
 * Selve regelmaskinen (hvem må skifte hvad, hvad portalen viser) er
 * PRØVET FOR SIG i leverandoerportal-regler.test.mjs — denne fil beviser
 * kun at Cloud Function'en rent faktisk KALDER den, og ikke opfinder sin
 * egen afskrift eller springer et lag over.
 *
 * DEV-verifikation af selve runtime-adfærden (kryds-tenant, en anden
 * leverandørs opgave, deaktiveret grant, o.l.) ligger i
 * scripts/_dev-verificer-leverandoerportal.mjs, kørt mod den udrullede
 * DEV-funktion med en syntetisk leverandør — se commit-teksten.
 *
 * Kør: npm test
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const KILDE = readFileSync("functions/index.js", "utf8");

/** Teksten for én navngiven funktion/const, fra dens egen linje til den
 *  næste af de kendte grænsemarkører — samme greb som opgavestatus.test.mjs's
 *  egen `blok`-udtræk, generaliseret til flere startformer. */
function funktionstekst(startMarkoer) {
  const start = KILDE.indexOf(startMarkoer);
  assert.ok(start >= 0, `functions/index.js har ikke "${startMarkoer}"`);
  const graenser = ["\nexport const ", "\nfunction ", "\nasync function "];
  let naeste = -1;
  for (const g of graenser) {
    const i = KILDE.indexOf(g, start + startMarkoer.length);
    if (i >= 0 && (naeste < 0 || i < naeste)) naeste = i;
  }
  return naeste < 0 ? KILDE.slice(start) : KILDE.slice(start, naeste);
}

const kraevGrant = funktionstekst("async function kraevLeverandoerGrant(req)");
const kraevAdmin = funktionstekst("function kraevLeverandoererAdmin(req)");
const opgaver = funktionstekst("export const leverandoerPortalOpgaver");
const tilbud = funktionstekst("export const leverandoerTilbudIndsend");
const status = funktionstekst("export const leverandoerStatusOpdater");
const inviter = funktionstekst("export const leverandoerPortalInviter");
const deaktiver = funktionstekst("export const leverandoerPortalAdgangDeaktiver");

describe("kraevLeverandoerGrant — den fælles indgang", () => {
  test("⚠ AFVISER UDEN ET AKTIVT GRANT", () => {
    assert.match(kraevGrant, /grant\.aktiv !== true/);
  });

  test("⚠ SLÅR OP PÅ DET VERIFICEREDE auth\\.uid, IKKE PÅ NOGET KLIENTEN SENDER", () => {
    assert.match(kraevGrant, /leverandoerPortalAdgang\/\$\{auth\.uid\}/);
  });

  test("tenantId er en vælger fra klienten, leverandoerId kommer KUN fra grantet", () => {
    /* Funktionen læser tenantId af req.data — det er meningen, den er en
       vælger. Men leverandoerId returneres fra `grant.leverandoerId`, ikke
       fra req.data et eneste sted i denne funktion. */
    assert.match(kraevGrant, /kortStreng\(req\.data\?\.tenantId/);
    assert.doesNotMatch(kraevGrant, /req\.data\?\.leverandoerId/,
      "leverandoerId læses af klientens nyttelast i stedet for af grantet");
    assert.match(kraevGrant, /leverandoerId: grant\.leverandoerId/);
  });

  test("tenant og abonnement prøves, som i enhver anden funktion", () => {
    assert.match(kraevGrant, /_findes/);
    assert.match(kraevGrant, /abonnement\/status/);
  });
});

describe("leverandoerPortalOpgaver", () => {
  test("kalder den fælles grant-kontrol, ikke en afskrift", () => {
    assert.match(opgaver, /await kraevLeverandoerGrant\(req\)/);
  });

  test("⚠ FILTRERINGEN LIGGER I DEN RENE FUNKTION, IKKE HER", () => {
    /* Samme disciplin som opgavestatus/statusOpdatering: skrives filtreret-
       på-leverandoerId-logikken om igen inline her, kan den drive fra den
       udgave portal-UI'et (senere) og prøverne begge bruger. */
    assert.match(opgaver, /fordelPortalOpgaver\(/);
    assert.doesNotMatch(opgaver, /\.filter\(/,
      "funktionen filtrerer selv i stedet for at bruge fordelPortalOpgaver()");
  });
});

describe("leverandoerTilbudIndsend", () => {
  test("kalder den fælles grant-kontrol", () => {
    assert.match(tilbud, /await kraevLeverandoerGrant\(req\)/);
  });

  test("⚠ DEN AFGØRENDE KONTROL: opgavens EGEN leverandoerId, ikke klientens", () => {
    assert.match(tilbud, /opgave\.leverandoerId !== leverandoerId/);
  });

  test("⚠ ALTID push() — ALDRIG SAT PÅ EN FAST STI DER KUNNE OVERSKRIVE ET GAMMELT TILBUD", () => {
    assert.match(tilbud, /leverandoertilbud`\)\.push\(\)/);
    assert.doesNotMatch(tilbud, /leverandoertilbud\/\$\{/,
      "et fast tilbudId ville kunne overskrive et tidligere tilbud");
  });

  test("beløbet prøves for at være et helt, ikke-negativt tal", () => {
    assert.match(tilbud, /% 1 !== 0/);
    assert.match(tilbud, /beloebOere < 0/);
  });

  test("mutationen auditlogges", () => {
    assert.match(tilbud, /logOpgave\(/);
    assert.match(tilbud, /AUDIT\.opret/);
  });
});

describe("leverandoerStatusOpdater", () => {
  test("kalder den fælles grant-kontrol", () => {
    assert.match(status, /await kraevLeverandoerGrant\(req\)/);
  });

  test("⚠ DEN AFGØRENDE KONTROL: opgavens EGEN leverandoerId, ikke klientens", () => {
    assert.match(status, /foer\.leverandoerId !== leverandoerId/);
  });

  test("⚠ TO LAG, IKKE ÉT — den snævre portal-liste OG den fulde interne maskine", () => {
    /* kanLeverandoerSkifte() er portalens egen, snævrere liste (prøvet i
       leverandoerportal-regler.test.mjs); kanSkifteOpgave() er den SAMME
       fulde maskine skærmen og opgavestatus selv bruger. Springes det ene
       lag over, er det enten en leverandør der kan mere end tilladt, eller
       en dobbelt, driftende afskrift af den interne maskine. */
    assert.match(status, /kanLeverandoerSkifte\(/);
    assert.match(status, /kanSkifteOpgave\(/);
    assert.doesNotMatch(status, /OPGAVE_OVERGANGE/,
      "funktionen har sin egen kopi af den interne tilstandsmaskine");
  });

  test("⚠ SAMME OPDATERINGSVEJ SOM DEN INTERNE opgavestatus — statusOpdatering(), ét rod.update()", () => {
    assert.match(status, /statusOpdatering\(/);
    assert.equal((status.match(/await rod\.update\(/g) || []).length, 1,
      "der skrives i mere end ét kald");
  });

  test("mutationen auditlogges som et tilstandsskift", () => {
    assert.match(status, /logOpgave\(/);
    assert.match(status, /AUDIT\.tilstandsskift/);
  });
});

describe("leverandoerPortalInviter / -Deaktiver — leverandoerer.skriv, ikke brugere.skriv", () => {
  test("⚠ ADMIN-KONTROLLEN ER leverandoerer.skriv, IKKE brugere.skriv", () => {
    /* "Spørg hvad handlingen kræver, ikke hvem brugeren er" (CLAUDE.md) —
       at invitere en portalbruger er en handling PÅ leverandørkortet. */
    assert.match(kraevAdmin, /\|leverandoerer\.skriv\|/);
    assert.doesNotMatch(kraevAdmin, /brugereSkriv|brugere\.skriv/);
  });

  test("begge kalder den fælles admin-kontrol", () => {
    assert.match(inviter, /kraevLeverandoererAdmin\(req\)/);
    assert.match(deaktiver, /kraevLeverandoererAdmin\(req\)/);
  });

  test("⚠ INGEN LØSEN SÆTTES — modsat opretKonto()'s interne konti", () => {
    /* opretKonto() (interne brugere) tager imod et kodeord fra klienten;
       en ekstern leverandørkonto må ALDRIG få et af os valgt eller sendt i
       en mail. */
    assert.doesNotMatch(inviter, /password:/,
      "funktionen sætter et kodeord direkte i stedet for at bruge et nulstillingslink");
    assert.match(inviter, /generatePasswordResetLink\(/);
  });

  test("⚠ INGEN CUSTOM CLAIMS SÆTTES PÅ DEN EKSTERNE KONTO", () => {
    /* En ekstern bruger bærer intet {tenant, rolle, perms} — formen passer
       ikke på en ekstern part, og hver portalfunktion slår i stedet et
       grant op. setCustomUserClaims må derfor aldrig optræde her. */
    assert.doesNotMatch(inviter, /setCustomUserClaims/);
  });

  test("⚠ PORTALEN SKAL VÆRE SLÅET TIL PÅ LEVERANDØREN FØRST", () => {
    assert.match(inviter, /portalAdgang\?\.enabled/);
  });

  test("invitationen ryddes ikke bort ved en genaktivering — oprettetMs/oprettetAf bevares", () => {
    assert.match(inviter, /grantFoer\?\.oprettetMs/);
    assert.match(inviter, /grantFoer\?\.oprettetAf/);
  });

  test("begge muterende handlinger auditlogges", () => {
    assert.match(inviter, /logLeverandoerPortal\(/);
    assert.match(deaktiver, /logLeverandoerPortal\(/);
  });

  test("deaktivering sætter aktiv:false, den sletter ikke grantet", () => {
    assert.match(deaktiver, /aktiv: false/);
    assert.doesNotMatch(deaktiver, /\.remove\(\)|set\(null\)/,
      "grantet slettes i stedet for at blive deaktiveret — historikken går tabt");
  });
});

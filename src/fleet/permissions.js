/* src/fleet/permissions.js
 * Adgang afgøres af PERMISSIONS, ikke af rollen.
 *
 * Spørg hvad handlingen kræver, ikke hvem brugeren er. En rolle er et navn
 * på en samling permissions — ikke et niveau man er over eller under.
 *
 * KATALOGET ER UDLEDT, IKKE OPFUNDET. De 18 herunder svarer én til én til de
 * tjek der faktisk håndhæves i dag: ni rolletjek i firebase.rules.json og to
 * overgangstabeller i booking-state.js. Tilføj ikke en permission uden at der
 * er et sted der spørger efter den — et katalog på hundrede navne er
 * ubrugeligt for den der skal sætte en rolle sammen.
 *
 * INGEN IMPORTS. Filen skal kunne læses af den Cloud Function der udsteder
 * custom claims, så rollernes indhold defineres ÉT sted. To definitioner af
 * hvem der må godkende en booking er præcis den fejl beslutning 5 handler om.
 *
 * Claim-formatet er en rør-afgrænset streng:
 *
 *   auth.token.perms = "|kunder.skriv|opgaver.skriv|booking.godkend|"
 *
 * fordi RTDB-regler kan .contains() på strenge, men ikke slå op i arrays.
 * Rørene i begge ender er ikke pynt: uden dem ville contains('|booking.afvis')
 * også matche '|booking.afvisAlle|'. Og en tastefejl i en Cloud Function —
 * "kunder.skrivx" eller en streng helt uden rør — giver ingen adgang til
 * noget. Fejler lukket, ikke åbent.
 */

export const PERM = {
  /* --- Dataskrivning. Svarer til .write-reglerne. --- */
  kunderSkriv: "kunder.skriv",
  opgaverSkriv: "opgaver.skriv",
  koeretoejerSkriv: "koeretoejer.skriv",
  fravaerSkriv: "fravaer.skriv",
  facilitySkriv: "facility.skriv",
  indkoebSkriv: "indkoeb.skriv",
  idebankSkriv: "idebank.skriv",
  satserSkriv: "satser.skriv",
  lagreSkriv: "lagre.skriv",
  /* Egne indberetninger. Ejerskabet tjekkes i reglerne på oprettetAf — det
     er ikke en rolle og hører derfor ikke i en permission. */
  indberetningerSkriv: "indberetninger.skriv",
  /* Andres indberetninger. Den eneste grund til at det er to permissions og
     ikke én: en chauffør skal kunne rette sin egen tankning uden at kunne
     rette kollegaens. */
  indberetningerSkrivAlle: "indberetninger.skrivAlle",

  /* --- Bookingflow. Svarer til OVERGANGE i booking-state.js. --- */
  bookingOpret: "booking.opret",
  bookingForeslaa: "booking.foreslaa",
  /* Beslutning 5: disponenten må ikke godkende sit eget forslag. Det er nu
     et felt i en liste frem for en kommentar om hvem der IKKE står på en
     rolle-liste. Se DISPONENT nedenfor — den mangler denne. */
  bookingGodkend: "booking.godkend",
  /* Dækker både "returnér til disponent" og "tilbage på venteliste" fra
     afventerKoord. De deler permission, fordi de begge er samme handling:
     koordinatoren sender sagen tilbage uden at afvise den.
     Skal en koordinator senere kunne returnere MEN IKKE sætte på venteliste,
     er det en ny permission — ikke en omskrivning af denne. */
  bookingReturner: "booking.returner",
  bookingAfvis: "booking.afvis",
  bookingAnnuller: "booking.annuller",
  bookingUdfoer: "booking.udfoer",

  /* --- Audit --- */
  /* Læsning af auditloggen. Loggen er selv følsom: den afslører hvilke kunder
     der bliver kigget på, og af hvem. Derfor er den ikke synlig for enhver i
     tenanten, men kræver denne.

     ⚠ DER FINDES INGEN audit.skriv, OG DEN MÅ IKKE TILFØJES.
     Auditloggen er append-only: audit/ er .write: false for alle, også admin,
     og skrivning sker kun gennem en Cloud Function med Admin SDK. Tilføjer man
     en skrive-permission, kan en kompromitteret admin-konto redigere sit eget
     spor, og så er hele loggen værdiløs. Har du brug for at skrive, skal du
     kalde audit.log() — ikke give dig selv adgang. */
  auditLaes: "audit.laes",
};

export const ALLE_PERMS = Object.values(PERM);

/* Dataskrivning som enhver ikke-chauffør har i dag. Reglen hed
   `rolle !== 'chauffoer'`, og den dækkede netop disse. */
const BASIS_DATA = [
  PERM.kunderSkriv,
  PERM.opgaverSkriv,
  PERM.fravaerSkriv,
  PERM.facilitySkriv,
  PERM.indkoebSkriv,
  PERM.idebankSkriv,
  PERM.indberetningerSkriv,
];

/**
 * Rollerne som forudindstillede samlinger. Ingen skal konfigurere
 * permissions manuelt for at komme i gang.
 *
 * Samlingerne GENGIVER dagens adgang præcist. Punkt 3 skifter mekanismen,
 * ikke hvem der må hvad — strammer man samtidig, ved man ikke bagefter om et
 * problem kom fra det ene eller det andet. Stramninger er en egen opgave.
 */
export const ROLLE_PERMS = {
  chauffoer: [PERM.indberetningerSkriv, PERM.idebankSkriv],

  casehandler: [...BASIS_DATA, PERM.bookingOpret],

  disponent: [
    ...BASIS_DATA,
    PERM.koeretoejerSkriv,
    PERM.bookingForeslaa,
    PERM.bookingAfvis,
    PERM.bookingUdfoer,
    /* Ingen bookingGodkend. Det er beslutning 5. */
  ],

  koordinator: [
    ...BASIS_DATA,
    PERM.bookingGodkend,
    PERM.bookingReturner,
    PERM.bookingAfvis,
    PERM.bookingAnnuller,
    PERM.bookingUdfoer,
  ],

  /**
   * Revisor — og den rolle en RA-kundes security manager får, når de vil
   * verificere at loggen findes og virker.
   *
   * Læser auditloggen. Skriver INTET, nogen steder. Presettet indeholder
   * bevidst ikke én eneste .skriv.
   *
   * ⚠ Bemærk hvad der IKKE står her: læse-permissions til kunder, bookinger
   * og så videre. De findes ikke i kataloget, fordi de ikke håndhæves nogen
   * steder — læsning styres i dag alene af tenant-medlemskab, og
   * tenants/$tenantId/.read kaskaderer ned over alt. En revisor kan derfor
   * læse tenantens data uden at nogen har givet lov til det.
   *
   * Det er dagens model, ikke en beslutning truffet her, og at opfinde et
   * kunder.laes der ikke tjekkes nogen steder ville være værre end at lade
   * være: en permission der ikke håndhæves, antyder en beskyttelse der ikke
   * findes. At indsnævre læseadgang er punkt 6 i den låste rækkefølge.
   */
  revisor: [PERM.auditLaes],

  admin: [...ALLE_PERMS],
};

/** Permissions for en rolle. Ukendt rolle giver ingenting — ikke alt. */
export const permsFraRolle = (rolle) => ROLLE_PERMS[rolle] || [];

/**
 * Claim-strengen. Rør i begge ender og mellem hvert navn.
 * Det er denne der lægges i auth.token.perms.
 */
export const permStreng = (perms = []) => (perms.length ? `|${perms.join("|")}|` : "");

export const permStrengFraRolle = (rolle) => permStreng(permsFraRolle(rolle));

/**
 * harPerm(perms, perm) — tager både claim-strengen og et array, så kaldere
 * ikke skal huske hvilken form de har fat i.
 */
export function harPerm(perms, perm) {
  if (!perms || !perm) return false;
  if (Array.isArray(perms)) return perms.includes(perm);
  return perms.includes(`|${perm}|`);
}

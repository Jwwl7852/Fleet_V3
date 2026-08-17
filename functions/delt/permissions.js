/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/permissions.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
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
  /* ⚠ BRUGERADMINISTRATION KAN IKKE GØRES FRA KLIENTEN OVERHOVEDET.
     Firebase Auth har ingen createUser, updateUser eller setCustomUserClaims
     på klientsiden — det kræver Admin SDK, altså en Cloud Function.
     Permissionen er derfor ikke en .write-regel som de øvrige: den kontrolleres
     INDE I funktionen, som første ting den gør.

     Den ligger alligevel i det samme katalog, fordi den skal kunne ses i
     rollegennemgangen og fordi den hører til ét preset: kun admin. En rolle
     der kan oprette brugere, kan oprette en admin — og dermed give sig selv
     alt. Se ROLLE_PERMS. */
  brugereSkriv: "brugere.skriv",

  /* --- Dataskrivning. Svarer til .write-reglerne. --- */
  kunderSkriv: "kunder.skriv",
  opgaverSkriv: "opgaver.skriv",
  koeretoejerSkriv: "koeretoejer.skriv",
  fravaerSkriv: "fravaer.skriv",
  facilitySkriv: "facility.skriv",
  indkoebSkriv: "indkoeb.skriv",
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

  /* --- Læsning af klassificerede objekter (beslutning 17) ---
   *
   * HVORFOR HAR KUN FIRE OBJEKTER EN laes-PERMISSION?
   *
   * Fordi kun fire objekter har noget klassificeret at holde adskilt fra.
   * bookinger, kunder, koeretoejer og fravaer har hver en satellit under
   * sensitive/ — og booking desuden en under vaerdi/. laes-permissionen er
   * dét der giver mening at kontrastere den finere adgang MOD: "må se
   * bookingen, men ikke hvad godset er værd."
   *
   * De øvrige noder — opgaver, indkoeb, fakturaer, satser, lagre
   * og resten — styres fortsat af tenant-medlemskab alene, præcis som
   * i dag. Det ER asymmetrisk, og det er med vilje.
   *
   * ⚠ "RET" DET IKKE ved at tilføje tretten laes-permissions mere. De ville
   * ikke beskytte noget: uden en klassificeret satellit er der intet at
   * skelne imellem, og alle presets skulle alligevel have dem alle. Man ville
   * få et katalog der er dobbelt så stort og præcis lige så sikkert.
   *
   * Skal læseadgang generelt strammes — så en chauffør ikke kan læse hele
   * kundekartoteket — er det en selvstændig beslutning med sin egen
   * begrundelse, ikke en oprydning i navngivningen. */
  bookingLaes: "booking.laes",
  /* securityInformation, privatePickupAddress, sensitiveNotes.
     Disponenten SKAL have den: den der planlægger turen, skal vide at godset
     kræver følgebil, og kan ikke disponere en afhentning uden adressen.
     Sikkerhedsinformation der ikke når frem til planlæggeren, er en fælde
     frem for en beskyttelse. */
  bookingSensitiveLaes: "booking.sensitiveLaes",
  /* cargoValue og andre beløb på selve godset.
     ADSKILT fra sensitiveLaes med vilje: disponenten skal vide at godset
     kræver følgebil — ikke at det er 18 millioner værd. De to er
     SIDEORDNEDE, ikke trin på en stige. */
  bookingVaerdiLaes: "booking.vaerdiLaes",

  kunderLaes: "kunder.laes",
  kunderSensitiveLaes: "kunder.sensitiveLaes",

  koeretoejerLaes: "koeretoejer.laes",
  /* liveGPS. Disponenten har den — man kan ikke disponere uden at vide hvor
     bilerne er. */
  koeretoejerSensitiveLaes: "koeretoejer.sensitiveLaes",

  /* PERSONALE er platformens mest følsomme entitet, og den ligger i BASEN —
     enhver abonnementskombination har medarbejdere. Skrivning er derfor
     admin alene; en HR-rolle kan tilføjes i roller/ uden kode, hvis en kunde
     beder om det. */
  personaleLaes: "personale.laes",
  personaleSkriv: "personale.skriv",
  /* CPR, privatadresse, pårørende, baggrundskontrol. */
  personaleSensitiveLaes: "personale.sensitiveLaes",

  /* Kompetencer har ingen klassificeret satellit og får derfor ingen
     laes-permission — se noten ved bookingLaes. Kun skrivning styres. */
  kompetencerSkriv: "kompetencer.skriv",

  /* TURTLEBOOKING — udlejning af transportkasser.

     ⚠ TO PERMISSIONS, IKKE FIRE. Den ene dækker STAMDATA (kasser,
     kassetyper, reolpladser), den anden det OPERATIONELLE (book, klargør,
     udlever, retur). Det er de to slags handlinger der findes; en
     permission pr. node ville være fire navne der altid blev givet sammen.

     ⚠ INGEN laes-permission. Der er ingen klassificeret satellit at
     kontrastere mod, og så ville den ikke beskytte noget — se den lange
     note ved bookingLaes om hvorfor kun fire objekter har en. */
  kasserSkriv: "kasser.skriv",
  kasseudlaanSkriv: "kasseudlaan.skriv",

  /* ⚠ REOLPLADSEN FIK SIN EGEN, FORDI NODEN NU DELES AF TO MODULER.
     Den lå under `kasser.skriv`, og det holdt så længe Turtlebooking var den
     eneste der stod på hylderne. Warehouse står på de samme — og en
     WMS-medarbejder hos en kunde der IKKE har Turtlebooking, ville ellers
     ikke kunne oprette en hylde, fordi rettigheden hed noget om kasser.
     En node to moduler deler, kan ikke gates af det ene moduls rettighed. */
  reolpladserSkriv: "reolpladser.skriv",

  /* WAREHOUSE (WMS) — lagerhotel, 3PL.

     ⚠ TO PERMISSIONS, SAMME SNIT SOM TURTLEBOOKING: den ene dækker STAMDATA
     (varekartoteket), den anden det OPERATIONELLE (bevægelserne).

     ⚠ `bevaegelser.skriv` ER IKKE EN VEJ UDEN OM FUNKTIONEN. Noden er
     `.write: false`; permissionen er dét `bevaegelseskriv` prøver KALDEREN
     mod. Præcis som `kasseudlaan.skriv` blev det for Turtlebooking. */
  varerSkriv: "varer.skriv",
  bevaegelserSkriv: "bevaegelser.skriv",

  /* ⚠ CARRIEREN FÅR SIN EGEN — den kan ikke hedde `kasser.skriv`.
     En carrier og en transportkasse er fysisk den samme slags beholder, men
     de ligger i hver sin node og hører til hvert sit modul (WAREHOUSE.md
     punkt 6.2). En WMS-medarbejder hos en kunde uden Turtlebooking ville
     ellers ikke kunne oprette en beholder, fordi rettigheden hed noget om
     kasser — samme fælde som `reolpladser.skriv` lukkede. */
  carriersSkriv: "carriers.skriv",

  fravaerLaes: "fravaer.laes",
  /* art (sygdom vs. ferie) og dokumentation. Helbredsoplysning, altså særlig
     kategori efter GDPR art. 9. Disponeringen har kun brug for at vide at
     chaufføren er utilgængelig — ikke hvorfor. Derfor kun admin. */
  fravaerSensitiveLaes: "fravaer.sensitiveLaes",
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
  PERM.indberetningerSkriv,
  /* ⚠ TURTLEBOOKING-PERMISSIONERNE STÅR IKKE HER, og de stod her indtil
     spørgsmålet blev besvaret. Svaret var at LAGERMEDARBEJDEREN skal
     udlevere og modtage retur — og en dedikeret rolle er meningsløs, hvis
     alle andre roller har det samme i forvejen. Se `lagermedarbejder`. */
];

/* Læsning af de fire klassificerede objekters GENERAL-del. Alle presets har
   dem, fordi enhver i tenanten kunne læse alt før beslutning 17 — det er kun
   sensitive/ og vaerdi/ der strammes. */
const BASIS_LAES = [
  PERM.bookingLaes,
  PERM.kunderLaes,
  PERM.koeretoejerLaes,
  PERM.fravaerLaes,
  /* Bemanding og Disponering viser navne — enhver rolle skal kunne læse
     personalelisten. Det er sensitive/personale der er lukket. */
  PERM.personaleLaes,
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
  chauffoer: [...BASIS_LAES, PERM.indberetningerSkriv],

  casehandler: [...BASIS_LAES, ...BASIS_DATA, PERM.bookingOpret],

  disponent: [
    ...BASIS_LAES,
    ...BASIS_DATA,
    PERM.koeretoejerSkriv,
    PERM.bookingForeslaa,
    PERM.bookingAfvis,
    PERM.bookingUdfoer,
    /* Ingen bookingGodkend. Det er beslutning 5. */
    /* Skal kunne se følgebilskrav og afhentningsadresse — ellers planlægger
       de i blinde. Men IKKE bookingVaerdiLaes: vurderingen på godset er ikke
       nødvendig for at lægge en rute. */
    PERM.bookingSensitiveLaes,
    /* Kan ikke disponere uden at vide hvor bilerne er. */
    PERM.koeretoejerSensitiveLaes,
  ],

  koordinator: [
    ...BASIS_LAES,
    ...BASIS_DATA,
    PERM.bookingGodkend,
    PERM.bookingReturner,
    PERM.bookingAfvis,
    PERM.bookingAnnuller,
    PERM.bookingUdfoer,
    PERM.bookingSensitiveLaes,
    /* Den eneste driftsrolle der ser vurderingen. Den der godkender, skal
       kunne se hvad der står på spil. */
    PERM.bookingVaerdiLaes,
    PERM.koeretoejerSensitiveLaes,
    PERM.kunderSensitiveLaes,
    /* Ingen fravaerSensitiveLaes: disponeringen har brug for at vide at
       medarbejderen er utilgængelig, ikke hvorfor.
       Ingen personaleSensitiveLaes: CPR og baggrundskontrol er ikke
       driftsdata. */
  ],

  /**
   * Revisor — og den rolle en RA-kundes security manager får, når de vil
   * verificere at loggen findes og virker.
   *
   * Læser auditloggen og de fire objekters general-del. Skriver INTET, nogen
   * steder. Presettet indeholder bevidst ikke én eneste .skriv.
   *
   * ⚠ Bemærk hvad der IKKE står her: hverken sensitiveLaes eller vaerdiLaes.
   * En revisor skal kunne verificere AT loggen findes og hvad den registrerer
   * — ikke læse indholdet af det den registrerer at andre har set. Ellers
   * bliver "må læse loggen" til "må læse alt følsomt", og så er revisorrollen
   * den bredeste adgang i systemet i stedet for den smalleste.
   *
   * De øvrige tretten noder kan revisor stadig læse via tenant-medlemskab,
   * som alle andre. Se noten ved bookingLaes om hvorfor kun fire objekter har
   * en laes-permission.
   */
  /**
   * Lagermedarbejder — den der pakker, klargør, udleverer og modtager retur.
   *
   * ⚠ ROLLEN ER NY, OG DEN KOM AF ET SPØRGSMÅL DER BLEV STILLET FØRST.
   * Turtlebooking-prototypen havde sin egen rolle "Chauffør = udlevering/retur".
   * At hænge det på VORES chauffør ville have været forkert: en chauffør
   * kører, og han skriver indberetninger. Den der står med kassen i hånden
   * på lageret, er en anden person med et andet arbejde.
   *
   * ⚠ EN NY ROLLE ER EN ÆNDRING I KODEN, ikke et klik. Beslutning 31: en
   * vognmand tildeler blandt faste presets og ændrer ikke hvad de
   * indeholder. Skal en rolle betyde noget andet, rettes den her — og så
   * skal claims fornys, for et preset er hvad man får VED UDSTEDELSE.
   *
   * Den er SMAL med vilje: den kan alt med kasser og udlån, den kan se
   * hvem folk er, og den kan skrive sine egne indberetninger. Den kan ikke
   * oprette en booking, røre en kunde eller se en pris.
   */
  lagermedarbejder: [
    ...BASIS_LAES,
    PERM.kasserSkriv,
    PERM.kasseudlaanSkriv,
    /* ⚠ SAMME MAND, TO MODULER — IKKE EN OTTENDE ROLLE. Han står på lageret;
       om hylden bærer en transportkasse eller kundens paller, er ikke to job.
       Beslutning 31: rollerne er faste, og en ny rolle skal svare til et nyt
       ARBEJDE, ikke til et nyt modul. */
    PERM.reolpladserSkriv,
    PERM.varerSkriv,
    PERM.bevaegelserSkriv,
    /* Beholderen er hans arbejde på samme måde som hylden og varen: han
       scanner den ind og sætter den på plads. */
    PERM.carriersSkriv,
    /* Han melder også en beskadiget kasse — det er en indberetning. */
    PERM.indberetningerSkriv,
  ],

  revisor: [...BASIS_LAES, PERM.auditLaes],

  admin: [...ALLE_PERMS],
};

/**
 * ⚠ EN NY PERMISSION I ET PRESET RAMMER IKKE EKSISTERENDE BRUGERE.
 *
 * Presettet er hvad en bruger får VED UDSTEDELSE. Claim'et i tokenet er hvad
 * hun FAKTISK har, og de to er ikke det samme: tilføjer man en permission her,
 * står den i koden med det samme og i ingen brugeres token.
 *
 * Det blev fundet med brugere.skriv. Permissionen var tilføjet, admin havde
 * den i presettet, prøverne var grønne — og den udrullede funktion svarede
 * stadig "Kræver brugere.skriv" til en rigtig administrator, fordi hans konto
 * var oprettet dagen før.
 *
 * Efter en ændring her skal claims fornys: `npm run provisioner:dev` for
 * DEV-brugerne, `kunde:opret --genskriv` for en kundes admin, og i produktion
 * en funktion der kalder setCustomUserClaims + revokeRefreshTokens. Uden det
 * sidste virker det gamle token indtil det udløber af sig selv.
 */

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

/* ---- Rollekataloget som noget man kan VISE ----------------------------- */

/**
 * Label og formål pr. rolle. Ligger HER ved siden af ROLLE_PERMS, ikke i den
 * skærm der først fik brug for det — samme begrundelse som FUNKTION_IKON i
 * personale.js og ART_IKON i flaade.js.
 *
 * `hvorfor` er den ENE sætning der forklarer hvorfor rollen ikke har mere end
 * den har. Uden den ser en manglende permission ud som en forglemmelse, og så
 * bliver den "rettet".
 */
export const ROLLE_LABEL = {
  chauffoer: {
    label: "Chauffør",
    hvad: "Kører, indberetter og ser sine egne opgaver.",
    hvorfor: "Skriver kun indberetninger. Intet klassificeret — hverken godsets " +
             "værdi, privatadresser eller kollegers fraværsårsag.",
  },
  casehandler: {
    label: "Sagsbehandler",
    hvad: "Opretter bookinger og holder styr på kundedialogen.",
    hvorfor: "Kan oprette, men ikke foreslå eller godkende. En booking skal " +
             "gennem disponering, før den bliver til en tur.",
  },
  disponent: {
    label: "Disponent",
    hvad: "Planlægger ture, tildeler biler og folk.",
    hvorfor: "Har IKKE booking.godkend. Beslutning 5: den der foreslår, " +
             "godkender ikke sit eget forslag. Ser hvor bilerne er — man kan " +
             "ikke disponere i blinde — men ikke hvad godset er værd.",
  },
  koordinator: {
    label: "Koordinator",
    hvad: "Godkender, returnerer og lukker bookinger.",
    hvorfor: "Den eneste driftsrolle der ser godsets vurdering: den der " +
             "godkender, skal kunne se hvad der står på spil. Ser IKKE " +
             "fraværsårsager — disponeringen har brug for at vide at nogen er " +
             "utilgængelig, ikke hvorfor.",
  },
  lagermedarbejder: {
    label: "Lagermedarbejder",
    hvad: "Pakker, klargør, udleverer og modtager retur på lageret.",
    hvorfor: "Den eneste rolle ud over admin der må røre udlån. En chauffør " +
             "kører; den der står med kassen i hånden, er en anden person. " +
             "Kan ikke oprette en booking, røre en kunde eller se en pris.",
  },
  revisor: {
    label: "Revisor",
    hvad: "Læser alt driftsdata og auditloggen.",
    hvorfor: "Kan intet skrive. En revisor der kan rette i det han reviderer, " +
             "reviderer ikke.",
  },
  admin: {
    label: "Administrator",
    hvad: "Alt.",
    hvorfor: "Har hver eneste permission. Derfor er det den rolle der skal " +
             "gives færrest af.",
  },
};

export const ALLE_ROLLER = Object.keys(ROLLE_PERMS);

/** Har rollen denne permission? Ukendt rolle giver false, ikke true. */
export const rolleHarPerm = (rolle, perm) => permsFraRolle(rolle).includes(perm);

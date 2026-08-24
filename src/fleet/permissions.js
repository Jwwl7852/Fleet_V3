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
  /* ⚠ OG EN AT LÆSE MED — beslutning 104. Den dækker HELE Procure: `indkoeb`,
     `fakturaer`, `leverandoerer`, `indkoebsbehov`, `indkoebsordrer`,
     `forbrugsvarer`, `forbrugsvarebevaegelser` og `godkendelsesregler`. Det
     er hvad vi BETALER, og hvilke vilkår vi har hos hvem — og en chauffør
     kunne læse det hele.
     ⚠ Bemærk at `leverandoerer` læses af ELLEVE skærme, også uden for Procure
     (Disponering, Værkstedskalender, Arbejdskøen). Derfor har alle roller
     undtagen chaufføren den. */
  indkoebLaes: "indkoeb.laes",
  satserSkriv: "satser.skriv",
  /* ⚠ OG EN AT LÆSE MED — beslutning 104. Kun admin må ÆNDRE en pris, og
     enhver i huset kunne LÆSE den: hvad vi tager for en tur, og hvad den
     koster os. `omkostninger` følger med, af samme grund som de to deler
     skrive-permission (se noten lige nedenfor).
     ⚠ Lagermedarbejderen HAR den, og det blev målt frem for antaget:
     Warehouses Afregning og Volumen læser `satser/standard` for at prissætte
     håndtering. Uden den ville to skærme stå med en afvist læsning. */
  satserLaes: "satser.laes",
  /* ⚠ OMKOSTNINGSSATSER DELER PERMISSION MED PRISERNE, og det er en
     beslutning frem for en genvej: det er den samme person — vognmanden — der
     sætter begge, og en permission mere ville skulle gives til nøjagtig de
     samme. Noderne er delt fordi TALLENE ikke må blandes (beslutning 11), ikke
     fordi adgangen skulle deles. */
  lagreSkriv: "lagre.skriv",
  /* Egne indberetninger. Ejerskabet tjekkes i reglerne på oprettetAf — det
     er ikke en rolle og hører derfor ikke i en permission. */
  indberetningerSkriv: "indberetninger.skriv",
  /* Andres indberetninger. Den eneste grund til at det er to permissions og
     ikke én: en chauffør skal kunne rette sin egen tankning uden at kunne
     rette kollegaens. */
  indberetningerSkrivAlle: "indberetninger.skrivAlle",

  /* ⚠ DEN HER HAR VAERET PLANLAGT, IKKE GLEMT. indberetninger.js har
     baaret den som PERM_SENSITIVE_LAES_PLANLAGT med en note om at den
     tilfoejes "i SAMME ombaering som reglerne og deres tests — ikke foer".
     Noden `sensitive/indberetninger` findes nu, og det er den ombaering.

     Den daekker de tre felter i SENSITIVE_FELTER: skadebeskrivelsen,
     modparten og underskriften. Det er bevismaterialet i en skadesag —
     ikke driftsdata. En disponent skal vide AT bilen er paa vaerksted, ikke
     hvad modparten hedder. */
  indberetningerSensitiveLaes: "indberetninger.sensitiveLaes",

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

  /* --- Fakturagrundlaget (beslutning 25) ---
   *
   * ⚠ TO PERMISSIONS, FORDI DET ER TO HANDLINGER. At UDARBEJDE et grundlag er
   * kontorarbejde: samle linjerne og få tallene til at passe. At GODKENDE det
   * er at sige god for at fakturaen kan sendes — og at LÅSE det er at sige at
   * den ER sendt. Den der gør det første, skal ikke nødvendigvis kunne gøre
   * det andet.
   *
   * Det er samme snit som beslutning 5 på bookingen: disponenten foreslår,
   * koordinatoren godkender. Her er det ikke et forbud mod at godkende sit
   * eget — det er et åbent spørgsmål (fire-øjne, se README) — men snittet
   * findes, så svaret kan sættes i en rolle frem for i kode.
   *
   * ⚠ INGEN AF DEM ÅBNER NODEN. `grundlag` er .write: false for alle;
   * permissionerne er dét den Cloud Function prøver kalderen mod. Præcis som
   * bevaegelser.skriv og kasseudlaan.skriv. */
  /* ⚠ OG EN AT LÆSE MED — beslutning 104. Grundlaget er hvad HVER ENKELT
     kunde bliver faktureret, linje for linje. Det er den smalleste af de tre:
     hverken chaufføren, disponenten eller lagermedarbejderen har den. En
     disponent skal kunne planlægge en tur uden at kunne se hvad kunden
     betalte for den forrige. */
  grundlagLaes: "grundlag.laes",
  grundlagSkriv: "grundlag.skriv",
  grundlagGodkend: "grundlag.godkend",

  /* --- Procures godkendelse (beslutning 82) ---
   *
   * ⚠ DEN HER HAR VÆRET PLANLAGT, IKKE GLEMT. `leverandoerer.js` bar den som
   * `PERM_GODKEND_MIDLERTIDIG = "indkoeb.skriv"` med noten om at den skal
   * skilles ud "når reglerne åbnes". Ordrernes godkendelse er nu åbnet —
   * `ordrestatus` — og det er den ombæring.
   *
   * AT GODKENDE ET INDKØB ER EN ANDEN HANDLING END AT BESTILLE DET. Den der
   * bestiller varen, og den der siger god for regningen, er i en virksomhed
   * med adskilte funktioner BEVIDST to personer. Deler de én permission, kan
   * den samme medarbejder bestille hos sin svoger og godkende sit eget køb —
   * og hele beløbsgrænsen på planche 2 er så en pæn knap.
   *
   * Samme argument som beslutning 5: disponenten foreslår, koordinatoren
   * godkender. Ikke fordi disponenten er mindre betroet, men fordi to sæt
   * øjne fanger det ét sæt ikke gør.
   *
   * ⚠ OG DEN DÆKKER OGSÅ FAKTURAEN. Det er den samme handling — at sige god
   * for at der skal betales — og en `fakturaer.godkend` ved siden af ville
   * skulle gives til nøjagtig de samme. Noderne er delt fordi TINGENE er to;
   * adgangen er én. Samme snit som `lagre.skriv` og `satser.skriv`. */
  indkoebGodkend: "indkoeb.godkend",

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
   * begrundelse, ikke en oprydning i navngivningen.
   *
   * ══════════════════════════════════════════════════════════════════════
   * ⚠ DEN BESLUTNING ER NU TRUFFET — MEN KUN FOR TRE DOMÆNER (nr. 104).
   * ══════════════════════════════════════════════════════════════════════
   *
   * Advarslen ovenfor står ved magt, og den er grunden til at der KOMMER
   * TRE og ikke femten. Målt i regelfilen: **39 af 51 læsbare noder kræver
   * ingen permission overhovedet**, og **femten domæner har en `.skriv` og
   * ingen `.laes`** — systemet kræver altså en tilladelse for at ÆNDRE en
   * pris og ingen for at LÆSE den.
   *
   * De tre nedenfor er dem hvor svaret på *"hvem må se det her"* er et
   * ANDET end *"hvem arbejder her"*:
   *
   *   satser.laes    hvad vi tager for en tur, og hvad den koster os
   *   grundlag.laes  hvad hver enkelt kunde bliver faktureret
   *   indkoeb.laes   hvad vi betaler vores leverandører
   *
   * ⚠ OG PRØVEN ER FORDELINGEN, IKKE ANTALLET. Advarslen ovenfor siger at
   * tretten nye permissions ikke ville beskytte noget, fordi *"alle presets
   * skulle alligevel have dem alle"* — og det er det rigtige krav at stille.
   * De tre her består den: chaufføren får **ingen** af dem, disponenten to
   * af tre, lagermedarbejderen to af tre. En permission alle syv roller har,
   * er en linje i et katalog; det er `booking.laes` allerede.
   *
   * ⚠ DE ØVRIGE TOLV STÅR STADIG ÅBNE, og de står nu på en LISTE med en
   * grund — `test/laeseadgang.test.mjs`. Et hul man kan tælle, er et andet
   * hul end et ingen har set. Se beslutning 104. */
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

  /* UNITBOOKING — udlejning af transportkasser.

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
     Den lå under `kasser.skriv`, og det holdt så længe Unitbooking var den
     eneste der stod på hylderne. Warehouse står på de samme — og en
     WMS-medarbejder hos en kunde der IKKE har Unitbooking, ville ellers
     ikke kunne oprette en hylde, fordi rettigheden hed noget om kasser.
     En node to moduler deler, kan ikke gates af det ene moduls rettighed. */
  reolpladserSkriv: "reolpladser.skriv",

  /* WAREHOUSE (WMS) — lagerhotel, 3PL.

     ⚠ TO PERMISSIONS, SAMME SNIT SOM UNITBOOKING: den ene dækker STAMDATA
     (varekartoteket), den anden det OPERATIONELLE (bevægelserne).

     ⚠ `bevaegelser.skriv` ER IKKE EN VEJ UDEN OM FUNKTIONEN. Noden er
     `.write: false`; permissionen er dét `bevaegelseskriv` prøver KALDEREN
     mod. Præcis som `kasseudlaan.skriv` blev det for Unitbooking. */
  varerSkriv: "varer.skriv",
  bevaegelserSkriv: "bevaegelser.skriv",

  /* ⚠ CARRIEREN FÅR SIN EGEN — den kan ikke hedde `kasser.skriv`.
     En carrier og en transportkasse er fysisk den samme slags beholder, men
     de ligger i hver sin node og hører til hvert sit modul (WAREHOUSE.md
     punkt 6.2). En WMS-medarbejder hos en kunde uden Unitbooking ville
     ellers ikke kunne oprette en beholder, fordi rettigheden hed noget om
     kasser — samme fælde som `reolpladser.skriv` lukkede. */
  carriersSkriv: "carriers.skriv",

  fravaerLaes: "fravaer.laes",
  /* art (sygdom vs. ferie) og dokumentation. Helbredsoplysning, altså særlig
     kategori efter GDPR art. 9. Disponeringen har kun brug for at vide at
     chaufføren er utilgængelig — ikke hvorfor. Derfor kun admin. */
  fravaerSensitiveLaes: "fravaer.sensitiveLaes",

  /* --- Sager (beslutning 20/112) — femte objekt med en klassificeret
     satellit. `sag.laes` er general-delen (nummer, tilstand, parter);
     `sag.sensitiveLaes` er tråden selv, mailens brødtekst. Samme adskillelse
     som booking.laes mod booking.sensitiveLaes. */
  sagLaes: "sag.laes",
  sagSensitiveLaes: "sag.sensitiveLaes",
  /* At skrive på tråden kræver at kunne læse den — samme bundt som
     indberetninger.skriv + indberetninger.sensitiveLaes. */
  sagSkriv: "sag.skriv",
  /* At frigive en karantæne er at gøre en ubekræftet adresse kendt for
     DENNE sag alene — se frigivKarantaene() i sager.js. En vurdering, ikke
     en driftshandling; samme snit som booking.godkend (beslutning 5). */
  sagKarantaeneFrigiv: "sag.karantaeneFrigiv",
  /* At bekræfte et aftaleforslag er at skrive en reservation — samme
     handling som at godkende en booking eller et grundlag. */
  sagAftaleBekraeft: "sag.aftaleBekraeft",

  /* --- Retention (beslutning 115) — ikke-destruktiv grundmekanisme ---
     Kun legal hold rører databasen; selve sletningen/anonymiseringen
     findes ikke. Se retention-regler.js. */
  retentionLaes: "retention.laes",
  /* At sætte eller ophæve et legal hold er en juridisk/kommerciel
     afgørelse — samme klasse som bookingGodkend, ikke en driftshandling. */
  retentionSkriv: "retention.skriv",
};

export const ALLE_PERMS = Object.values(PERM);

/* Dataskrivning som enhver ikke-chauffør har i dag. Reglen hed
   `rolle !== 'chauffoer'`, og den dækkede netop disse. */
/**
 * De tre kommercielle laesninger — beslutning 104.
 *
 * ⚠ DE STAAR SAMLET, MEN GIVES IKKE SAMLET. Samlingen findes fordi de tre
 * hoerer til det samme spoergsmaal — hvad tjener og betaler virksomheden —
 * ikke fordi de foelges ad. Chauffoeren faar INGEN af dem; disponenten og
 * lagermedarbejderen faar to af tre. Var de altid tre, var de een.
 *
 * ⚠ OG DE ER IKKE EN STIGE. At maatte se en pris goer dig ikke naermere paa
 * at maatte se en faktura — det er to spoergsmaal, som sensitiveLaes og
 * vaerdiLaes er det (se noten ved bookingVaerdiLaes).
 */
const KOMMERCIEL_LAES = [PERM.satserLaes, PERM.grundlagLaes, PERM.indkoebLaes];

const BASIS_DATA = [
  PERM.kunderSkriv,
  PERM.opgaverSkriv,
  PERM.fravaerSkriv,
  PERM.facilitySkriv,
  PERM.indkoebSkriv,
  PERM.indberetningerSkriv,
  /* ⚠ UNITBOOKING-PERMISSIONERNE STÅR IKKE HER, og de stod her indtil
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

  /* ⚠ ALLE TRE. Han laver tilbuddet, udarbejder grundlaget og bestiller
     ind — de tre tal ER hans arbejde. */
  casehandler: [...BASIS_LAES, ...BASIS_DATA, ...KOMMERCIEL_LAES,
    PERM.bookingOpret,
    /* Udarbejder grundlaget — men godkender det ikke. */
    PERM.grundlagSkriv,
    /* Han er den der arbejder sagen: læser tråden og skriver på den. Ikke
       sagKarantaeneFrigiv eller sagAftaleBekraeft — de er en vurdering,
       ikke driften af sagen. Se koordinator. */
    PERM.sagLaes, PERM.sagSensitiveLaes, PERM.sagSkriv],

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
    /* ⚠ TO AF TRE — beslutning 104. Prisen skal han kende: et forslag
       baerer en pris, og satsopslaget sker mens han bygger det.
       Leverandoererne ogsaa: Disponering og Vaerkstedskalender slaar op i
       kartoteket.
       ⚠ MEN IKKE grundlagLaes. En disponent skal kunne planlaegge en tur
       uden at kunne se hvad kunden betalte for den forrige — det er samme
       snit som at han ser foelgebilskravet og ikke vurderingen. */
    PERM.satserLaes,
    PERM.indkoebLaes,
    /* Kan ikke disponere uden at vide hvor bilerne er. */
    PERM.koeretoejerSensitiveLaes,
    /* ⚠ KUN sagLaes. Samme snit som indberetningerSensitiveLaes: han skal
       vide AT bilen har en åben værkstedssag for at kunne planlægge —
       ikke læse korrespondancen med værkstedet. */
    PERM.sagLaes,
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
    /* ⚠ ALLE TRE. Han godkender baade grundlaget vi fakturerer paa og de
       indkoeb vi selv betaler — han kan ikke godkende et tal han ikke maa
       se. */
    ...KOMMERCIEL_LAES,
    PERM.koeretoejerSensitiveLaes,
    PERM.kunderSensitiveLaes,
    /* Samme snit som på bookingen: den der godkender turen, godkender også
       det grundlag den bliver faktureret på. */
    PERM.grundlagSkriv,
    PERM.grundlagGodkend,
    /* Samme snit igen: den der godkender grundlaget vi fakturerer PÅ,
       godkender også de indkøb vi selv betaler. */
    PERM.indkoebGodkend,
    /* Ingen fravaerSensitiveLaes: disponeringen har brug for at vide at
       medarbejderen er utilgængelig, ikke hvorfor.
       Ingen personaleSensitiveLaes: CPR og baggrundskontrol er ikke
       driftsdata. */

    /* ⚠ DEN ENESTE DRIFTSROLLE MED indberetningerSensitiveLaes.
       Samme snit som på bookingen: den der lukker sagen og håndterer
       fakturaen, skal kunne se hvad der står på spil — skadebeskrivelsen,
       modparten og underskriften ER bevismaterialet i en skadesag.

       Disponenten får den IKKE. Han skal vide AT bilen er på værksted for at
       kunne planlægge; hvad modparten hedder, ændrer ingen rute.
       Chaufføren får den heller ikke: han skriver sine EGNE indberetninger
       (ejerskabet tjekkes på `oprettetAf` i reglerne) og har intet ærinde i
       andres skadesager. */
    PERM.indberetningerSensitiveLaes,

    /* ⚠ ALLE FEM sag.*. Samme snit som på bookingen: den der godkender og
       lukker sagen, skal kunne se og skrive på tråden — og han er den der
       AFGØR om en ukendt afsender skal ind (karantaeneFrigiv) og om et
       aftaleforslag skal blive til en reservation (aftaleBekraeft). To
       vurderinger, ikke driftshandlinger — samme klasse som bookingGodkend,
       grundlagGodkend og indkoebGodkend, som han også har alle tre af. */
    PERM.sagLaes, PERM.sagSensitiveLaes, PERM.sagSkriv,
    PERM.sagKarantaeneFrigiv, PERM.sagAftaleBekraeft,
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
   * Unitbooking-prototypen havde sin egen rolle "Chauffør = udlevering/retur".
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
   * oprette en booking eller røre en kunde.
   *
   * ⚠ HER STOD "eller se en pris", OG DET VAR IKKE SANDT. Han kunne se hver
   * eneste —  havde ingen læse-permission — og hans EGNE skærme
   * kræver det: Warehouses Afregning prissætter håndtering. Sætningen var en
   * hensigt skrevet som en kendsgerning. Se beslutning 104.
   */
  lagermedarbejder: [
    ...BASIS_LAES,
    /* ⚠ TO AF TRE — beslutning 104, og det RETTER en påstand ovenfor: noten
       sagde at rollen ikke kan "se en pris". Det kunne den, som alle andre,
       og den SKAL kunne: Warehouses Afregning og Volumen slår op i
       `satser/standard` for at prissætte håndtering ind, opbevaring og ud.
       Leverandørkartoteket også — han modtager varer fra dem.
       Ikke `grundlagLaes`: han håndterer godset, ikke regningen. */
    PERM.satserLaes,
    PERM.indkoebLaes,
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

  /* ⚠ ALLE TRE, OG DET ER IKKE EN UDVIDELSE AF ROLLEN. Revisor kunne laese
     de tre noder i forvejen — gennem tenant-medlemskab, som alle andre.
     Uden dem her ville han MISTE adgang naar spaerringen kommer, og en
     revisor der ikke kan se fakturagrundlaget, kan ikke revidere.
     Presettet indeholder stadig ikke een eneste .skriv. */
  /* ⚠ sagLaes, IKKE sagSensitiveLaes. Samme snit som på de fire andre
     klassificerede objekter (se noten øverst i denne rolle): revisor skal
     kunne se AT en sag findes og dens tilstand, uden at kunne læse
     korrespondancens indhold. Uden den ville han miste den adgang
     tenant-medlemskab gav ham inden sag.laes fandtes. */
  /* ⚠ retentionLaes, IKKE retentionSkriv. Samme snit som auditLaes: revisor
     skal kunne se HVILKE legal holds der findes og hvorfor — ikke sætte
     eller ophæve dem. Presettet indeholder stadig ikke én eneste .skriv. */
  revisor: [...BASIS_LAES, ...KOMMERCIEL_LAES, PERM.auditLaes, PERM.sagLaes, PERM.retentionLaes],

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

/* ══════════════════════════════════════════════════════════════════════════
   BESLUTNING 31b — KUNDEN KAN REDIGERE SINE ROLLER

   ROLLE_PERMS ovenfor er ikke længere det endelige svar; den er STANDARDEN.
   En tenant kan have sine egne definitioner i `roller/<rolle>/perms`, og
   claims mintes af `rolleskriv` fra dem.

   ⚠ NODEN ER EN KILDE, ALDRIG ET HÅNDHÆVELSESPUNKT. firebase.rules.json
   læser aldrig `roller/`; adgang afgøres udelukkende af auth.token.perms.
   To håndhævelsespunkter ville være ét for mange — det var den stærkeste
   indvending mod at gøre rollerne redigerbare, og det her er svaret på den.
   En prøve fælder enhver regel der refererer noden.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * permsForTenant(rolle, roller) → listen der skal mintes.
 *
 * `roller` er tenantens node, eller null/undefined hvis den ikke findes.
 *
 * ⚠ EN TENANT UDEN NODEN OPFØRER SIG PRÆCIS SOM FØR. Det er dét der gør
 * ændringen sikker at udrulle: ingen eksisterende kunde skifter adgang af at
 * funktionen kommer. Falder noden væk, falder man tilbage på standarden —
 * ikke på ingenting, og ikke på alt.
 *
 * ⚠ OG DER FILTRERES MOD ALLE_PERMS. En ukendt streng i noden er en adgang
 * ingen regel kender — altså en adgang til ingenting, som SER UD som om den
 * gav noget. Den skal ikke ende i et token, hvor den ville stå og ligne en
 * rettighed nogen har fået.
 *
 * ⚠ REKKEFØLGEN ER KATALOGETS, IKKE NODENS. Claim-strengen er en tekst der
 * sammenlignes med contains(); to brugere med de samme permissions i
 * forskellig rækkefølge ville få to forskellige strenge, og en fejlsøgning
 * der holder to tokens op mod hinanden, ville se en forskel der ikke er der.
 */
export function permsForTenant(rolle, roller) {
  if (!ROLLE_PERMS[rolle]) return [];
  const egne = roller?.[rolle]?.perms;
  if (!Array.isArray(egne)) return permsFraRolle(rolle);
  const valgt = new Set(egne);
  return ALLE_PERMS.filter((p) => valgt.has(p));
}

/**
 * Er listen gyldig som en rolledefinition?
 *
 * ⚠ SAMME FUNKTION I SKÆRMEN OG PÅ SERVEREN. En klientvalidering der ikke
 * også står på serveren, er en pæn knap — og her ville den pæne knap kunne
 * skrive en permission ingen regel kender.
 */
export function valideRolleperms(perms) {
  if (!Array.isArray(perms)) return { ok: false, fejl: "Permissions skal være en liste." };
  const ukendte = perms.filter((p) => !ALLE_PERMS.includes(p));
  if (ukendte.length) {
    return { ok: false, fejl: `Ukendte permissions: ${ukendte.join(", ")}.` };
  }
  if (new Set(perms).size !== perms.length) {
    return { ok: false, fejl: "Den samme permission står to gange." };
  }
  return { ok: true, fejl: null };
}

/**
 * ⚠ DEN PERMISSION DER IKKE MÅ FORSVINDE.
 *
 * `brugere.skriv` er adgangen til at redigere roller. Fjernes den fra den
 * sidste rolle der har den, har kunden lukket sig ude af sit eget system, og
 * der er ingen vej tilbage fra klienten — adgangen til at rette det var selv
 * en permission. Det er nøjagtig den fare beslutning 31 blev truffet for, og
 * den er ikke forsvundet af at beslutningen blev omgjort.
 */
export const NOEGLEPERM = PERM.brugereSkriv;

/**
 * laaserUde(rolle, nyePerms, roller, { egenRolle }) → grund, eller null.
 *
 * Svarer HVORFOR det ikke kan lade sig gøre, ikke bare at det ikke kan.
 * Serveren afviser med den samme sætning skærmen viste.
 */
export function laaserUde(rolle, nyePerms = [], roller = {}, { egenRolle = null } = {}) {
  const beholder = nyePerms.includes(NOEGLEPERM);
  if (beholder) return null;

  /* ⚠ DIN EGEN ROLLE FØRST. Selv om en anden rolle har permissionen, er det
     her den mest almindelige måde at ødelægge en rolleadministration på: man
     strammer op på sin egen rolle og opdager det bagefter. */
  if (egenRolle && egenRolle === rolle) {
    return `Du kan ikke fjerne ${NOEGLEPERM} fra din egen rolle. ` +
      "En anden med adgang til brugere skal gøre det.";
  }

  /* Har nogen ANDEN rolle den stadig? Standarden tæller med: en rolle uden
     egen definition i noden bærer ROLLE_PERMS. */
  const andre = Object.keys(ROLLE_PERMS)
    .filter((r) => r !== rolle)
    .some((r) => permsForTenant(r, roller).includes(NOEGLEPERM));
  if (!andre) {
    return `${NOEGLEPERM} ville forsvinde fra den sidste rolle der har den. ` +
      "Så kan ingen redigere roller igen — heller ikke for at fortryde.";
  }
  return null;
}

/**
 * Claim-strengen. Rør i begge ender og mellem hvert navn.
 * Det er denne der lægges i auth.token.perms.
 */
export const permStreng = (perms = []) => (perms.length ? `|${perms.join("|")}|` : "");

export const permStrengFraRolle = (rolle) => permStreng(permsFraRolle(rolle));

/**
 * Claim-strengen tilbage til en liste. Tager også en liste, uændret.
 *
 * ⚠ DEN FANDTES IKKE, OG DET KOSTEDE TRE FORKERTE TAL PÅ SKÆRMEN.
 * `bruger.perms` er strengen `|a|b|c|` — ikke et array. `harPerm()` tåler
 * begge former, så adgangstjekkene var rigtige; men `perms.length` er
 * TEGNANTALLET, og Brugere & roller skrev "688 permissions i dit token" om en
 * administrator der har 41.
 *
 * Det er samme fejlklasse som `num(null)` der gav "0": et tal der er forkert
 * på en måde ingen kan se, fordi det ser ud som et tal. Og det overlevede,
 * fordi det ENESTE sted forskellen kunne ses, var en note under et nøgletal.
 *
 * ⚠ FILTRERET MOD ALLE_PERMS. En streng kan bære et navn kataloget ikke
 * kender — fra et gammelt token, mintet før en permission blev fjernet. Den
 * skal ikke tælles med som noget brugeren har.
 */
export function permsFraStreng(perms) {
  if (Array.isArray(perms)) return perms.filter((p) => ALLE_PERMS.includes(p));
  if (typeof perms !== "string" || !perms) return [];
  const valgt = new Set(perms.split("|").filter(Boolean));
  return ALLE_PERMS.filter((p) => valgt.has(p));
}

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

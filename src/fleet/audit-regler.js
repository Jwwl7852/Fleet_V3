/* src/fleet/audit-regler.js
 * Auditloggens POLITIK: vokabular, feltallowliste, før/efter og
 * retention-klasser.
 *
 * INGEN IMPORTS — samme grund som permissions.js. Den Cloud Function der
 * skriver loggen, skal filtrere før/efter mod NØJAGTIG samme allowliste som
 * klienten. Klientens filtrering er en bekvemmelighed; serverens er
 * kontrollen. To lister ville betyde, at det der slipper igennem den ene,
 * ender i loggen.
 *
 * Selve kaldet ligger i audit.js, som importerer firebase.
 */

/* Fast vokabular. Fritekst gør en log usøgbar, og så bliver den aldrig brugt
   til det den er lavet til. */
export const AUDIT = {
  opret: "opret",
  aendre: "aendre",
  slet: "slet",                 // altid soft delete på regnskabsdata
  laes: "laes",
  eksporter: "eksporter",
  tilstandsskift: "tilstandsskift",
  login: "login",
  adgangNaegtet: "adgangNaegtet",
};

/**
 * Felter hvis VÆRDI må stå i loggen.
 *
 * Alle ændrede felter navngives altid i `aendrede` — et feltnavn er ikke
 * følsomt. Kun felter herunder får deres før/efter-værdi med. Det er sådan
 * kravet om før/efter og kravet om ingen følsomme oplysninger kan opfyldes
 * samtidig.
 *
 * På listen: tal, tilstande, klassifikationer, tidspunkter og id'er — det man
 * skal kunne stille nogen til regnskab for.
 * Uden for listen: navne, adresser, noter, beskrivelser, begrundelser, al
 * fritekst. Begrundelser går ikke tabt: de står i objektets egen `historik`,
 * som også er append-only.
 *
 * Tilføjer du et felt her, gør du det læsbart for enhver med audit.laes.
 */
export const LOGBARE_FELTER = new Set([
  // beløb og mængder
  "beloebOere", "momsOere", "aftaltOere", "faktureretOere", "budgetOere",
  "omsaetningOere", "daekningsbidragOere", "kmPrisOere", "km", "antal",
  /* ⚠ rabatBps ER ET TAL, IKKE FRITEKST. Kundens afvigelse kan sætte prisen
     enten med sit eget beløb eller med en rabat, og `beloebOere` stod her i
     forvejen. Uden rabatBps ville loggen kunne fortælle AT rabatten blev
     ændret, men ikke fra 0 til 90 % — og det er præcis den ændring nogen
     ville lede efter. Allowlisten findes for at holde tastet tekst ude, ikke
     tal. */
  "rabatBps",
  /* ⚠ BELOEBSGRAENSEN FOR GODKENDELSE (beslutning 82). Et loft nogen kan
     haeve, skal kunne haeves EFTERPROEVELIGT — ellers er "hvem satte den til
     hundrede millioner" et spoergsmaal uden svar. Det er et tal, ikke
     fritekst, og det hoerer praecis paa listen af den grund. */
  "graenseOere",
  "kmEstimeret", "maengde", "doegnParkering",
  // tilstand og status
  "tilstand", "status", "aftalestatus", "aktiv", "annulleret", "slettet",
  "harAabneEtaper",
  /* ⚠ F.2 — synligForLeverandoer. Samme klasse som aktiv/annulleret
     ovenfor: en boolean der afgør om en EKSTERN part kan se noget, er
     præcis den slags skift en efterprøvning ville spørge om. */
  "synligForLeverandoer",
  /* ⚠ forloeb — SKIVE 3B. Indberetningens eget statsmaskineri (FORLOEB i
     indberetninger.js). Uden feltet kunne loggen fortælle AT en indberetning
     blev triageret, men ikke fra "ny" til "vurderet" — samme begrundelse som
     "status" og "tilstand" ovenfor. */
  "forloeb",
  /* ⚠ prioritet — TILFØJET 2026-09-05, samme figur som forloeb lige ovenfor.
     Et fast tal fra prioritet.js (lav|normal|hoej), ikke fritekst — uden
     feltet kunne loggen se AT en indberetning blev vurderet, men ikke om den
     blev sat til akut eller til "kan vente". */
  "prioritet",
  // klassifikation
  /* ⚠ "division" STOD HER og er fjernet i beslutning 79. Feltet findes ikke
     siden 70, og en allowliste der tillader noget der ikke kan skrives, er en
     linje den naeste bruger tid paa. Listen findes for at holde FRITEKST ude —
     ikke for at vaere fuldstaendig. */
  "art", "prisgruppe", "kategori", "type", "metode", "valuta",
  // tid
  "gyldigFra", "fra", "til", "senestMs", "aftaleUdloeberMs", "forfaldMs",
  "sidsteAktivitetMs", "friDage",
  /* ⚠ startMs OG estimeretMin ER PRÆCIS DET EN FLYTNING ÆNDRER — beslutning
     49. `opgaveflyt` rører de to felter og opgavens ressource, og intet
     andet. Stod de ikke her, kunne loggen fortælle AT opgaven blev flyttet,
     men ikke fra tirsdag til fredag — og det er dét spørgsmål nogen ville
     stille bagefter. Samme begrundelse som rabatBps: allowlisten findes for
     at holde TASTET TEKST ude, ikke tal. `fra` og `til` stod her i forvejen,
     og de er det samme vindue set fra reservationen. */
  "startMs", "estimeretMin",
  // referencer og numre
  "nummer", "bookingId", "etapeNr", "kundeId", "koeretoejId", "personId",
  "lagerId", "leverandoerId", "valgtForslagId", "ressourceType", "ressourceId",
  /* ⚠ kasseId ER MED, sagsnummer ER IKKE. Kassens id er en kontrolleret
     reference — reglerne kræver at den peger på en kasse der findes, præcis
     som koeretoejId. Sagsnummeret er 40 tegn en sagsbehandler har tastet, og
     allowlisten findes for at holde tastet tekst ude af loggen. Skal man
     finde udlånet, står objektId der. */
  "kasseId",
  /* ⚠ aktivId OG lokationId ER KONTROLLEREDE REFERENCER, som kasseId og
     koeretoejId: reglerne kræver at de peger på noget der findes. En
     facility-opgave kan flyttes fra ét anlæg til et andet — eller fra et
     anlæg til HELE lokationen, hvilket spærrer alle porte i hallen. Uden de
     to felter ville loggen ikke kunne sige hvad der blev spærret. */
  "aktivId", "lokationId",
  /* ⚠ sagId ER MED, sagsnummeret ER IKKE — samme skel som kasseId ovenfor.
     Id'et er en kontrolleret reference (`sager/` findes, beslutning 112);
     emnet og tråden er fritekst og hører ikke i loggen. */
  "sagId",
  /* ⚠ SKIVE 3D — mailStatus OG partId, EMNE/TEKST ER IKKE. mailStatus er
     lukket vokabular (anmodet|accepteret|fejlet), samme klasse som
     "tilstand"/"status" ovenfor. partId er en kontrolleret reference til
     DENNE sags egne parter — ikke en fri adresse, og ikke fritekst. */
  "mailStatus", "partId",
  /* ⚠ SKIVE 4C — fakturaId, valideretMime, stoerrelse. fakturaId er en
     kontrolleret reference (som kasseId/koeretoejId ovenfor) — reglen
     kræver at den peger på en faktura der findes. valideretMime er lukket
     vokabular (tre tilladte typer), samme klasse som "art"/"type"/
     "kategori". stoerrelse er et tal i bytes, samme klasse som "km"/
     "antal" — allowlisten findes for at holde TASTET TEKST ude, ikke tal.
     `originaltFilnavn` er DERIMOD fritekst fra en bruger og står bevidst
     IKKE her, samme skel som sagsnummer/beskrivelse andre steder. */
  "fakturaId", "valideretMime", "stoerrelse",
  /* ⚠ F.2 — opgaveId. Samme kontrollerede-reference-klasse som fakturaId
     ovenfor: opgaveDokument-posterne bærer den, og uden feltet her kunne
     loggen sige AT et dokument blev uploadet/delt, men ikke PÅ HVILKEN
     opgave. `originaltFilnavn` er stadig bevidst UDE, samme grund som på
     fakturabilagene. */
  "opgaveId",
  /* ⚠ G.2 — indkoebId, tankningId, automatisk. De to id'er er kontrollerede
     referencer (samme klasse som opgaveId/fakturaId ovenfor) — uden dem
     kunne loggen sige AT en fakturalinje blev matchet, men ikke HVILKEN
     tankning. `automatisk` er en boolean i samme klasse som
     synligForLeverandoer: et skift der afgør om en beslutning blev taget
     af et menneske eller af braendstofAutomatch, hører til de ting en
     efterprøvning ville spørge om. */
  "indkoebId", "tankningId", "automatisk",
]);

/* ---- Retention ------------------------------------------------------ */

/**
 * ⚠ 24 er FORELØBIGT og skal afgøres juridisk før første betalende kunde.
 * Bogføringsloven trækker mod 5 år for det der rører regnskabsdata; GDPR
 * trækker mod kortere for personoplysninger. Det ender sandsynligvis med
 * forskellige tal pr. klasse — mekanismen er klar til det, tallene er ikke
 * besluttet. Se BESLUTNINGER.md.
 *
 * Retention varierer pr. KLASSE og ikke pr. handling, fordi partitionerne er
 * månedlige: en partition indeholder alle handlinger. Skulle grænsen variere
 * pr. handlingstype, kunne man ikke slette en hel partition, og så skal hver
 * enkelt post scannes. Klassen ligger derfor i STIEN —
 * audit/<tenantId>/<klasse>/<år>/<måned>/ — så sletning bliver én operation.
 */
export const RETENTION_MAANEDER = {
  drift: 24,
  regnskab: 24,     // bogføringsloven peger mod 60. Ikke afgjort.
  sikkerhed: 24,    // login og afviste forsøg holdes typisk længere. Ikke afgjort.
};

export const KLASSER = Object.keys(RETENTION_MAANEDER);

/**
 * ⚠ ER TALLET AFGJORT? Det er et SELVSTÆNDIGT spørgsmål fra hvad tallet er.
 *
 * 24 står ovenfor som en foreløbig værdi. En oprydningsjob der slettede på
 * den, ville slette revisionsspor på et tal ingen jurist har sagt god for —
 * og et slettet auditspor kan ikke skaffes igen. Det er samme regel som den
 * manglende momssats: vi gætter ikke, vi nægter.
 *
 * Derfor to felter og ikke ét. `retentionFor()` svarer på HVOR LÆNGE;
 * `retentionErAfgjort()` svarer på OM VI TØR HANDLE PÅ DET. Stod der kun et
 * tal, ville den første der skrev en sletter, læse det som et svar.
 *
 * Når juristen har svaret: sæt tallet, sæt flaget, og skriv begrundelsen i
 * BESLUTNINGER.md — i den rækkefølge.
 */
export const RETENTION_AFGJORT = {
  drift: false,
  regnskab: false,
  sikkerhed: false,
};

export const retentionErAfgjort = (klasse) => RETENTION_AFGJORT[klasse] === true;

/**
 * Partitioner der er ældre end deres klasses retention.
 *
 * `partitioner` er [{ klasse, aar, maaned }] — nøjagtig den form stien har.
 * Ren funktion: den sletter ingenting og kender ingen database.
 *
 * ⚠ EN PARTITION ER FORFALDEN NÅR DEN ER HELT UDE AF VINDUET. Grænsen regnes
 * på partitionens SLUTNING (første dag i næste måned), ikke dens start —
 * ellers ville en post fra den 31. blive slettet en måned for tidligt.
 *
 * Svaret bærer `maaSlettes`, som er FALSK så længe klassens retention ikke er
 * afgjort. Kalderen skal kunne se forskel på "den er gammel nok" og "vi må
 * gøre noget ved den".
 */
export function forfaldnePartitioner(partitioner = [], nu = Date.now()) {
  return partitioner
    .filter((p) => KLASSER.includes(p.klasse))
    .map((p) => {
      const aar = Number(p.aar);
      const maaned = Number(p.maaned);
      if (!Number.isFinite(aar) || !Number.isFinite(maaned)) return null;
      /* Slutningen af partitionen: kl. 00 den 1. i næste måned, UTC. */
      const slutMs = Date.UTC(aar, maaned, 1);
      const graenseMs = nu - retentionFor(p.klasse) * 30.44 * 86400000;
      if (slutMs > graenseMs) return null;
      return {
        ...p,
        maaneder: retentionFor(p.klasse),
        maaSlettes: retentionErAfgjort(p.klasse),
      };
    })
    .filter(Boolean);
}

/* Objekter hvor en ændring rører regnskabsgrundlaget. */
const REGNSKABSOBJEKTER = new Set([
  "fakturaer", "indkoeb", "satser", "bookinger", "etaper", "countere",
  /* ⚠ FAKTURAGRUNDLAGET ER REGNSKAB, IKKE DRIFT. Klassen afgør retention, og
     et grundlag hører sammen med de fakturaer det bliver til — ikke med de
     bevægelser der udløste det. Lå sporet i drift-partitionen, ville
     halvdelen af en fakturas historik have en anden levetid end den anden. */
  "grundlag", "omkostninger",
  /* ⚠ SKIVE 4C — fakturaDokument HØRER SAMME STED SOM SIN FAKTURA. Et bilag
     er regnskabsbevis, ikke drift — samme begrundelse som grundlaget
     ovenfor, og samme retention-klasse som den faktura det er hæftet på. */
  "fakturaDokument",
  /* ⚠ G.2 — braendstofmatch HØRER SAMME STED SOM indkoeb. Matchet afgør
     hvilket køretøj en fakturalinje hører til — det er en afgørelse om
     REGNSKABSDATAEN (indkøbslinjen), ikke en driftshændelse i sig selv. */
  "braendstofmatch",
]);

const SIKKERHEDSHANDLINGER = new Set([
  AUDIT.login, AUDIT.adgangNaegtet, AUDIT.eksporter,
]);

/** Hvilken retention-klasse — og dermed hvilken partition — en post hører i. */
export function klasseFor(handling, objekt) {
  if (SIKKERHEDSHANDLINGER.has(handling)) return "sikkerhed";
  if (REGNSKABSOBJEKTER.has(objekt)) return "regnskab";
  return "drift";
}

export const retentionFor = (klasse) =>
  RETENTION_MAANEDER[klasse] ?? RETENTION_MAANEDER.drift;

/* ---- Før/efter ------------------------------------------------------ */

const ens = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * diff(foer, efter) → { aendrede, foer, efter }
 *
 * aendrede: ALLE felter der har ændret sig, ved navn.
 * foer/efter: kun de af dem der står på LOGBARE_FELTER.
 *
 * Man kan altid se HVAD der blev rørt, og for det der betyder noget også
 * hvad det blev ændret fra og til.
 */
export function diff(foer, efter) {
  const a = foer || {};
  const b = efter || {};
  const noegler = new Set([...Object.keys(a), ...Object.keys(b)]);
  const aendrede = [];
  const foerUd = {};
  const efterUd = {};

  for (const n of noegler) {
    if (ens(a[n], b[n])) continue;
    aendrede.push(n);
    if (LOGBARE_FELTER.has(n)) {
      foerUd[n] = a[n] ?? null;
      efterUd[n] = b[n] ?? null;
    }
  }
  aendrede.sort();
  return { aendrede, foer: foerUd, efter: efterUd };
}

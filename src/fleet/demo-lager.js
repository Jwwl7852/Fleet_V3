/* src/fleet/demo-lager.js
 * Demo-data til den DELTE reolstruktur — og til Warehouse.
 *
 * ⚠ HVORFOR REOLPLADSERNE FLYTTEDE HERTIL.
 * `reolpladser` hørte til Unitbooking og lå derfor i `demo-unitbooking.js`.
 * Noden deles nu med Warehouse, og et demo-datasæt hører ét sted — ellers
 * laver den anden skærm sin egen kopi, og så er det Bil 104 med to
 * nummerplader igen. Filen hedder `demo-lager` og ikke `demo-warehouse`,
 * fordi pladserne ikke tilhører Warehouse alene.
 *
 * ⚠ DE FIRE WMS-FELTER STÅR KUN PÅ NOGLE AF PLADSERNE, og det er med vilje:
 * de er valgfrie, og en plads uden dem skal opføre sig præcis som før. Sættet
 * viser begge tilfælde, så en skærm der ikke tåler en plads uden zone,
 * fejler i demo frem for hos kunden.
 *
 * ⚠ DET ER IKKE HIZKIAS ELLER NOGEN ANDENS DATA. Opdigtet med vilje —
 * opdigtede tal findes kun hvor der ikke er en database at spørge.
 */
import { DEMO_KUNDER } from "./demo-kunder.js";
import { selvkontrol } from "./selvkontrol.js";

export const DEMO_REOLPLADSER = [
  /* Unitbookings oprindelige — uden WMS-felter. De SKAL blive stående
     sådan; det er dem der beviser at felterne er valgfrie. */
  { id: "p-h1-r1-f1-h6-1", hal: "Hal 1", reol: "1", fag: "1", hylde: "6", plads: "1" },
  { id: "p-h1-r1-f1-h7-3", hal: "Hal 1", reol: "1", fag: "1", hylde: "7", plads: "3" },
  { id: "p-h1-r2-f1-h9-2", hal: "Hal 1", reol: "2", fag: "1", hylde: "9", plads: "2" },
  { id: "p-h1-r2-f1-h9-3", hal: "Hal 1", reol: "2", fag: "1", hylde: "9", plads: "3" },
  { id: "p-h1-r2-f1-h10-1", hal: "Hal 1", reol: "2", fag: "1", hylde: "10", plads: "1" },
  { id: "p-h2-r1-f2-h3-1", hal: "Hal 2", reol: "1", fag: "2", hylde: "3", plads: "1" },
  { id: "p-h2-r1-f2-h3-2", hal: "Hal 2", reol: "1", fag: "2", hylde: "3", plads: "2" },

  /* Warehouses — med zone, type, status og temperatur. */
  {
    id: "p-a-01-02", hal: "Hovedlager", reol: "A01", fag: "02", hylde: "1", plads: "1",
    zone: "Modtagelse", type: "hylde", status: "aktiv", temperatur: 18.5,
  },
  {
    id: "p-a-01-03", hal: "Hovedlager", reol: "A01", fag: "03", hylde: "1", plads: "1",
    zone: "Modtagelse", type: "gulvplads", status: "aktiv", temperatur: 18.3,
  },
  {
    /* ⚠ KARANTÆNE. Der SKAL være en i sættet — det er den eneste måde at se
       om en skærm blokerer en pluk frem for at advare om den. */
    id: "p-b-02-01", hal: "Hovedlager", reol: "B02", fag: "01", hylde: "1", plads: "1",
    zone: "Karantæne", type: "hylde", status: "karantaene", temperatur: 4.2,
  },
  {
    id: "p-c-01-01", hal: "Hovedlager", reol: "C01", fag: "01", hylde: "1", plads: "1",
    zone: "Bulk", type: "bulk", status: "aktiv", temperatur: 18.6,
  },
  {
    id: "p-d-05-12", hal: "Hovedlager", reol: "D05", fag: "12", hylde: "2", plads: "1",
    zone: "Pluk", type: "hylde", status: "aktiv", temperatur: 18.9,
  },
  {
    id: "p-d-05-13", hal: "Hovedlager", reol: "D05", fag: "13", hylde: "2", plads: "1",
    zone: "Pluk", type: "hylde", status: "aktiv", temperatur: 18.8,
  },
  {
    /* En lukket plads: hylden findes, men der må ikke stå noget på den. */
    id: "p-e-03-04", hal: "Hovedlager", reol: "E03", fag: "04", hylde: "1", plads: "1",
    zone: "Pak", type: "hylde", status: "lukket", temperatur: 18.7,
  },
];

/**
 * ⚠ KUNDE-IDERNE SKAL FINDES I demo-kunder.js. De var opdigtede (k1, k2, k3)
 * i første udkast, og reglerne afviste hver eneste vare — men KUN fra en
 * klient. Provisioneringen kører på admin-SDK og skrev dem alligevel, så
 * skærmen viste varer der ikke kunne oprettes. Selvkontrollen nedenfor
 * tjekker det nu.
 *
 * ⚠ HVER VARE HAR EN KUNDE. Det er 3PL: godset er ikke vores, og en vare uden
 * en modpart kan ikke afregnes. Kunde-id'erne peger på demo-kunderne.
 */
export const DEMO_VARER = [
  {
    id: "v-tool-1256", kundeId: "nordiskFragt", varenummer: "TOOL-1256",
    navn: "Slagnøgle 1/2\" 18V", enhed: "stk", sporing: "serie",
    varegruppe: "Værktøj",
    laengdeMm: 320, breddeMm: 120, hoejdeMm: 250, vaegtG: 2400, minimum: 5,
    aktiv: true,
  },
  {
    id: "v-st-1002", kundeId: "nordiskFragt", varenummer: "ST-1002",
    navn: "Leje 6205 2RS", enhed: "stk", sporing: "batch",
    varegruppe: "Reservedele",
    laengdeMm: 52, breddeMm: 52, hoejdeMm: 15, vaegtG: 130, minimum: 100,
    aktiv: true,
  },
  {
    id: "v-pal-1200", kundeId: "skagenSeafood", varenummer: "PAL-1200",
    navn: "Europalle 1200×800", enhed: "palle", sporing: "ingen",
    varegruppe: "Emballage",
    laengdeMm: 1200, breddeMm: 800, hoejdeMm: 144, vaegtG: 25000,
    aktiv: true,
  },
  {
    /* ⚠ EN VARE I KILO. Den findes i sættet for at vise at maengden KAN være
       en brøkdel — 12,5 kg er gyldigt, 12,5 paller er ikke. */
    id: "v-gran-50", kundeId: "skagenSeafood", varenummer: "GRAN-50",
    navn: "Granulat, sæk 25 kg", enhed: "kg", sporing: "batch",
    varegruppe: "Råvarer", minimum: 500, aktiv: true,
  },
  {
    id: "v-kart-a4", kundeId: "jyskByggecenter", varenummer: "KART-A4",
    navn: "Papkasse A4, brun", enhed: "kolli", sporing: "ingen",
    varegruppe: "Emballage",
    laengdeMm: 310, breddeMm: 220, hoejdeMm: 200, vaegtG: 180, minimum: 200,
    aktiv: true,
  },
  {
    /* Uden mål: volumenkalkulatoren skal kunne sige "ved det ikke" frem for
       at regne på nul. */
    id: "v-div-001", kundeId: "jyskByggecenter", varenummer: "DIV-001",
    navn: "Diverse projektvarer", enhed: "kolli", sporing: "ingen",
    aktiv: true,
  },
];

/* Mængder er skaleret med MAENGDE_SKALA (1000), som alt andet i huset. */
const M = (n) => Math.round(n * 1000);

/**
 * ⚠ NØGLEN ER <plads>__<vare>__<batch>, som beholdningsNoegle() bygger den.
 * Skrives den anderledes her, viser demo noget der ikke kan opstå i drift.
 */
/**
 * ⚠ NØGLEN BÆRER CARRIEREN, IKKE PLADSEN (etape 12). Godset ligger i en
 * beholder, og beholderen står på hylden — `<carrierId>__<vareId>__<batch>`.
 * Hylden står ALDRIG på beholdningsposten: to steder til samme kendsgerning
 * driver fra hinanden første gang nogen flytter beholderen.
 */
export const DEMO_BEHOLDNING = [
  { id: "CRR-100246__v-st-1002__LOT-240515", carrierId: "CRR-100246", vareId: "v-st-1002", batch: "LOT-240515", antal: M(420) },
  { id: "CRR-100246__v-st-1002__LOT-240602", carrierId: "CRR-100246", vareId: "v-st-1002", batch: "LOT-240602", antal: M(180) },
  { id: "CRR-100246__v-tool-1256___", carrierId: "CRR-100246", vareId: "v-tool-1256", batch: "_", antal: M(3) },
  { id: "CRR-100245__v-pal-1200___", carrierId: "CRR-100245", vareId: "v-pal-1200", batch: "_", antal: M(128) },
  /* ⚠ I EN BEHOLDER UDEN LOKATION. Godset findes, hylden gør ikke — det er
     den scannede, endnu ikke placerede beholder. Den SKAL være i sættet:
     ellers opdages det ikke, hvis en skærm lægger sådan en post på en
     tilfældig hylde frem for at lade den stå uden. */
  { id: "CRR-1X8910__v-kart-a4___", carrierId: "CRR-1X8910", vareId: "v-kart-a4", batch: "_", antal: M(64) },
  /* ⚠ I EN BEHOLDER PÅ EN KARANTÆNEPLADS. Der SKAL ligge noget dér — ellers
     kan man ikke se at beholdningen tælles med, men ikke må plukkes. Efter
     etape 12 arves spærringen fra hylden gennem beholderen. */
  { id: "CRR-100249__v-gran-50__LOT-240401", carrierId: "CRR-100249", vareId: "v-gran-50", batch: "LOT-240401", antal: M(250.5) },
];

/**
 * Enhederne — ét stykke gods pr. række, med sit serienummer som id.
 *
 * ⚠ SÆTTET SKAL STEMME MED BEHOLDNINGEN, og det er hele pointen med at have
 * det. `CRR-100246__v-tool-1256___` står på 3 stk., og derfor ligger der
 * præcis tre enheder på lager i den beholder. Gjorde de ikke det, ville
 * `enhedsafvigelse()` melde uenighed i demo — og så ville en rigtig uenighed
 * hos en kunde se ud som normaltilstanden. Selvkontrollen nedenfor tjekker det.
 *
 * ⚠ OG ÉN ER AFSENDT. Den skal med: en afsendt enhed har INGEN carrierId,
 * tæller derfor ikke med i nogen beholdning — og den bliver stående. Sletter
 * man den, forsvinder sporet, og et tilbagekald kan ikke svare på hvor den
 * blev af. `afsendt` er ikke en slutning i verden, kun i vores hus.
 */
export const DEMO_ENHEDER = [
  { id: "SN-4711", vareId: "v-tool-1256", kundeId: "nordiskFragt", carrierId: "CRR-100246", tilstand: "paaLager" },
  { id: "SN-4712", vareId: "v-tool-1256", kundeId: "nordiskFragt", carrierId: "CRR-100246", tilstand: "paaLager" },
  { id: "SN-4713", vareId: "v-tool-1256", kundeId: "nordiskFragt", carrierId: "CRR-100246", tilstand: "paaLager" },
  /* Kørt ud til kunden. Ingen beholder — og posten bliver stående. */
  { id: "SN-4699", vareId: "v-tool-1256", kundeId: "nordiskFragt", tilstand: "afsendt" },
];

/**
 * Carriers — beholderne kundens gods står i.
 *
 * ⚠ SÆTTET SKAL BÆRE DE FIRE TILFÆLDE DER ELLERS FØRST SES HOS KUNDEN:
 *
 *  1. En carrier på en plads hvor der ALLEREDE står beholdning. Det er den
 *     eneste måde at se at belægningen tæller begge dele — og at hylden ikke
 *     ser fri ud, fordi den ene kilde blev spurgt og den anden ikke.
 *  2. En carrier på samme plads som en KASSE fra Unitbooking, af samme
 *     grund. Se `p-h1-r2-f1-h9-2` i demo-unitbooking.js.
 *  3. En UDEN plads: scannet ind, ikke placeret. Det er de elleve "uden
 *     lokation" på planchen, og tilstanden er rigtig — ikke en fejl.
 *  4. En i transit, som derfor IKKE må have en plads.
 */
export const DEMO_CARRIERS = [
  {
    id: "CRR-100245", type: "pallekasse", ejerforhold: "ejet", status: "paaLager",
    pladsId: "p-a-01-02", kundeId: "nordiskFragt",
    laengdeMm: 1200, breddeMm: 800, hoejdeMm: 950,
  },
  {
    /* (1) Står på en plads der i forvejen bærer beholdning. */
    id: "CRR-100246", type: "gitterbur", ejerforhold: "ejet", status: "paaLager",
    pladsId: "p-d-05-12", kundeId: "skagenSeafood",
    laengdeMm: 1200, breddeMm: 800, hoejdeMm: 950,
  },
  {
    /* (2) Deler hylde med en transportkasse fra det andet modul. */
    id: "CRR-100247", type: "plastkasse", ejerforhold: "ejet", status: "paaLager",
    pladsId: "p-h1-r2-f1-h9-2", kundeId: "koldingKommune",
    laengdeMm: 600, breddeMm: 400, hoejdeMm: 320,
  },
  {
    /* (3) Scannet ind, ikke placeret. */
    id: "CRR-1X8910", type: "kartonkasse", ejerforhold: "engang", status: "paaLager",
    kundeId: "jyskByggecenter",
  },
  {
    /* (4) I transit — og derfor uden plads. Reglerne afviser en plads her. */
    id: "CRR-100248", type: "pallekasse", ejerforhold: "ejet", status: "iTransit",
    kundeId: "fynKoel", etapeId: "et-007",
    laengdeMm: 1200, breddeMm: 800, hoejdeMm: 950,
    /* ⚠ MÆRKATETS FELTER (etape 16). Kolli er PAKKER, ikke varelinjer: tre
       kasser med kølegods kan sagtens være én varelinje i beholdningen. */
    kolli: 3, loesEnheder: 0, vaegtGram: 96000,
    godsbeskrivelse:
      "Kølegods i tre isolerede kasser.\n" +
      "Indhold: fisk og skaldyr, pakket i is.\n" +
      "Emballage: EPS-kasser med låg, spændt på pallen.\n" +
      "Særlige forhold: skal stå køligt og må ikke vendes.",
    haandtering: { fragile: true, denneSideOp: true, holdToer: true, temperatur: true },
  },
  {
    /* En engangs der er brugt op. En EJET kan ikke få den status. */
    id: "CRR-1X8911", type: "traekasse", ejerforhold: "engang", status: "opbrugt",
    kundeId: "hamburgHandel",
  },
  {
    /* ⚠ PÅ KARANTÆNEPLADSEN. Efter etape 12 arves spærringen fra hylden
       GENNEM beholderen, og uden en beholder dér kunne man ikke se om
       arven virker. */
    id: "CRR-100249", type: "gitterbur", ejerforhold: "ejet", status: "paaLager",
    pladsId: "p-b-02-01", kundeId: "skagenSeafood",
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   SELVKONTROL — kun i DEV.
   ⚠ TRE SÆT DER PEGER PÅ HINANDEN. En tastefejl i et id giver en tom celle,
   ikke en fejl. Mønstret er dukket op seks gange i dette repo.
   ══════════════════════════════════════════════════════════════════════════ */
selvkontrol("demo-lager", () => {
  const pladser = new Set(DEMO_REOLPLADSER.map((p) => p.id));
  const varer = new Map(DEMO_VARER.map((v) => [v.id, v]));
  const kunder = new Set(DEMO_KUNDER.map((k) => k.id));

  /* ⚠ DEN HER FANDTES IKKE I FØRSTE UDKAST, og derfor stod der seks varer i
     dev med opdigtede kunde-ider. Reglerne afviste dem fra en klient, men
     provisioneringen gik uden om reglerne og skrev dem alligevel — så
     skærmen viste varer der ikke kunne have været oprettet gennem den. */
  for (const v of DEMO_VARER) {
    if (!kunder.has(v.kundeId)) {
      console.warn(`demo-lager: ${v.varenummer} peger paa kunden "${v.kundeId}", som ikke findes.`);
    }
  }

  for (const p of DEMO_REOLPLADSER) {
    for (const felt of ["hal", "reol", "fag", "hylde", "plads"]) {
      if (!p[felt]) console.warn(`demo-lager: ${p.id} mangler ${felt} — reglerne afviser den.`);
    }
  }

  const carrierIder = new Set(DEMO_CARRIERS.map((c) => c.id));
  for (const b of DEMO_BEHOLDNING) {
    if (!carrierIder.has(b.carrierId)) {
      console.warn(`demo-lager: beholdning i "${b.carrierId}", som ikke findes.`);
    }
    /* ⚠ INGEN pladsId PÅ EN BEHOLDNINGSPOST. Hylden er beholderens adresse;
       to steder til samme kendsgerning driver fra hinanden. */
    if (b.pladsId) {
      console.warn(`demo-lager: ${b.id} har en pladsId — godset ligger i en beholder.`);
    }
    if (!varer.has(b.vareId)) {
      console.warn(`demo-lager: beholdning af "${b.vareId}", som ikke findes.`);
    }
    /* ⚠ NØGLEN SKAL SVARE TIL FELTERNE. Gør den ikke det, kan serveren skrive
       to poster for samme beholder og vare — og så er totalen forkert. */
    const forventet = `${b.carrierId}__${b.vareId}__${b.batch || "_"}`;
    if (b.id !== forventet) {
      console.warn(`demo-lager: nøglen ${b.id} burde være ${forventet}.`);
    }
    /* En vare der spores på batch, skal HAVE en. */
    const v = varer.get(b.vareId);
    if (v?.sporing === "batch" && (!b.batch || b.batch === "_")) {
      console.warn(`demo-lager: ${b.vareId} spores på batch, men ${b.id} har ingen.`);
    }
    if (v?.sporing === "ingen" && b.batch && b.batch !== "_") {
      console.warn(`demo-lager: ${b.vareId} spores ikke, men ${b.id} har en batch.`);
    }
    /* ⚠ EN HALV PALLE FINDES IKKE. */
    if (v && ["stk", "kolli", "palle", "kasse"].includes(v.enhed) && b.antal % 1000 !== 0) {
      console.warn(`demo-lager: ${b.id} er ${b.antal / 1000} ${v.enhed} — den enhed kan ikke deles.`);
    }
  }

  /* Carriers — samme tre fælder som varerne: en plads der ikke findes, en
     kunde der ikke findes, og den invariant reglerne håndhæver. */
  for (const c of DEMO_CARRIERS) {
    if (c.pladsId && !pladser.has(c.pladsId)) {
      console.warn(`demo-lager: carrier ${c.id} står på "${c.pladsId}", som ikke findes.`);
    }
    if (c.kundeId && !kunder.has(c.kundeId)) {
      console.warn(`demo-lager: carrier ${c.id} peger paa kunden "${c.kundeId}", som ikke findes.`);
    }
    /* ⚠ EN CARRIER DER IKKE STÅR PÅ LAGERET, OPTAGER INGEN HYLDE. Reglerne
       afviser den, og et demo-sæt der bryder invarianten, ville vise en
       skærm som ingen kunne have skrevet. */
    if (c.pladsId && !["paaLager", "udeAfDrift"].includes(c.status)) {
      console.warn(`demo-lager: carrier ${c.id} er ${c.status}, men har en plads.`);
    }
    if (c.status === "opbrugt" && c.ejerforhold !== "engang") {
      console.warn(`demo-lager: carrier ${c.id} er opbrugt, men ikke en engangs.`);
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     ⚠ ENHEDERNE SKAL STEMME MED BEHOLDNINGEN — og det er ikke pedanteri.

     `enheder/<serienr>` og `beholdning` bærer den SAMME kendsgerning, det ene
     som rækker og det andet som et tal. Det er prisen ved at have enheden som
     eget objekt (WAREHOUSE.md punkt 7), og den betales blandt andet ved at
     `enhedsafvigelse()` viser en uenighed på skærmen.

     Men er demo-sættet selv uenigt, står afvigelsespanelet rødt fra dag ét —
     og så lærer man at rødt er normaltilstanden. En rigtig uenighed hos en
     kunde ville forsvinde i støjen fra vores egen.
     ══════════════════════════════════════════════════════════════════════ */
  const paaLager = new Map();
  for (const e of DEMO_ENHEDER) {
    if (!varer.has(e.vareId)) {
      console.warn(`demo-lager: enheden ${e.id} peger paa varen "${e.vareId}", som ikke findes.`);
    } else if (varer.get(e.vareId).sporing !== "serie") {
      console.warn(`demo-lager: ${e.id} er en enhed af ${e.vareId}, som ikke spores paa serienummer.`);
    }
    if (!kunder.has(e.kundeId)) {
      console.warn(`demo-lager: enheden ${e.id} peger paa kunden "${e.kundeId}", som ikke findes.`);
    }
    /* Invarianten reglerne håndhæver: i huset kræver en beholder, ude af
       huset forbyder den. */
    if (e.tilstand === "paaLager" && !e.carrierId) {
      console.warn(`demo-lager: ${e.id} er paa lager uden en beholder — gods ingen kan finde.`);
    }
    if (e.tilstand === "afsendt" && e.carrierId) {
      console.warn(`demo-lager: ${e.id} er afsendt, men ligger stadig i ${e.carrierId}.`);
    }
    if (e.carrierId && !carrierIder.has(e.carrierId)) {
      console.warn(`demo-lager: enheden ${e.id} ligger i "${e.carrierId}", som ikke findes.`);
    }
    if (e.tilstand === "paaLager" && e.carrierId) {
      const n = `${e.carrierId}__${e.vareId}`;
      paaLager.set(n, (paaLager.get(n) || 0) + 1);
    }
  }
  for (const b of DEMO_BEHOLDNING) {
    if (varer.get(b.vareId)?.sporing !== "serie") continue;
    const n = `${b.carrierId}__${b.vareId}`;
    const stk = Math.round(b.antal / 1000);
    const raekker = paaLager.get(n) || 0;
    if (stk !== raekker) {
      console.warn(
        `demo-lager: ${b.id} staar paa ${stk} stk., men der er ${raekker} enheder. ` +
        "Saettet ville vise en afvigelse vi selv har lavet.");
    }
    paaLager.delete(n);
  }
  for (const [n, raekker] of paaLager) {
    console.warn(`demo-lager: ${raekker} enhed(er) i ${n} uden en beholdningspost.`);
  }
});

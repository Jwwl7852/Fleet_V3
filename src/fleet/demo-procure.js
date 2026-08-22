/* src/fleet/demo-procure.js
 * Indkøbsbehov — trin 1 i Procures proces (beslutning 78, etape 2).
 *
 * ⚠ SÆTTET BRUGES KUN NÅR DER INGEN DATABASE ER. `useListe(node, { demo })`
 * er den rigtige vej: er noden seedet, er det NODEN der vises. En seedet node
 * må aldrig vise noget andet end sig selv — se beslutning 56 og 64.
 */
import { selvkontrol } from "./selvkontrol.js";
import {
  valideBehov, valideOrdre, linjeListe, ALLE_BEHOVKILDER, BEHOVSTATUS,
} from "./procure.js";

const NU = Date.now();
const T = 3600000;

/**
 * ⚠ ALLE FIRE KILDER ER REPRÆSENTERET, og det er ikke pynt: indbakken
 * GRUPPERER på kilden, og en kilde uden poster tegner ingen overskrift. Var
 * `kontor` tom, kunne man ikke se at grupperingen virker — og en gruppe der
 * mangler, ligner en kilde der ikke findes.
 *
 * ⚠ OG BÅDE MED OG UDEN ANTAL. Antallet er valgfrit med vilje (se
 * `valideBehov()`): den der melder ind, ved hvad han mangler, ikke hvor meget
 * der er i en pakke. Sættet skal vise begge, ellers ser skærmen ud som om
 * feltet altid er udfyldt.
 */
export const DEMO_INDKOEBSBEHOV = [
  /* ---- Snedkeri ---------------------------------------------------- */
  { id: "beh-001", vare: "Træplader 22 mm", kilde: "snedkeri", status: "nyt",
    antal: 20, enhed: "stk", prioritet: "hoej",
    anmoderId: "andersNielsen", oprettetAf: "uid-anders", oprettetMs: NU - 2 * T,
    note: "Bruges til hyldekonstruktioner i værkstedet." },
  { id: "beh-002", vare: "Træskruer 5,0 × 90 mm", kilde: "snedkeri", status: "klarTilBestilling",
    antal: 4, enhed: "pk", prioritet: "mellem", varenummer: "TS-5090",
    anmoderId: "andersNielsen", oprettetAf: "uid-anders", oprettetMs: NU - 3 * T,
    note: "Til samling af plader." },
  /* ⚠ UDEN ANTAL — se noten ovenfor. */
  { id: "beh-003", vare: "Limtræ 45×195 mm", kilde: "snedkeri", status: "nyt",
    prioritet: "lav",
    anmoderId: "andersNielsen", oprettetAf: "uid-anders", oprettetMs: NU - 26 * T,
    note: "Til reol i teknikrum." },

  /* ---- Lager -------------------------------------------------------- */
  { id: "beh-004", vare: "Strækfilm 50 cm × 300 m", kilde: "lager", status: "klarTilBestilling",
    antal: 10, enhed: "ruller", prioritet: "hoej", varenummer: "SF500-300",
    anmoderId: "larsPetersen", oprettetAf: "uid-lars", oprettetMs: NU - 4 * T,
    note: "Er ved at løbe tør." },
  { id: "beh-005", vare: "Paller — Europalle 120×80", kilde: "lager", status: "iKladde",
    antal: 40, enhed: "stk", prioritet: "mellem",
    anmoderId: "larsPetersen", oprettetAf: "uid-lars", oprettetMs: NU - 30 * T,
    note: "Bruges til forsendelser." },
  { id: "beh-006", vare: "Emballagetape 50 mm", kilde: "lager", status: "nyt",
    antal: 24, enhed: "stk", prioritet: "lav",
    anmoderId: "larsPetersen", oprettetAf: "uid-lars", oprettetMs: NU - 28 * T },

  /* ⚠ TO BEHOV DER KAN MATCHES MOD INDKOEBSHISTORIKKEN, og de staar her
     fordi forslaget ellers ikke kan SES virke: uden dem gav hvert eneste
     aabne behov "Leverandoer mangler", og den halvdel af skaermen der slaar
     op i `indkoeb`, tegnede aldrig et forslag. Et demo-saet hvor en funktion
     kun kan ses fejle, er ikke et demo-saet.

     ⚠ DEN FOERSTE MATCHER PAA VARENUMMER, DEN ANDEN KUN PAA NAVN — og de to
     er ikke lige staerke. Et navnetraef kan vaere to forskellige varer med
     samme ord, og skaermen skriver derfor hvad den matchede paa. Uden begge
     kan den forskel ikke ses. */
  { id: "beh-014", vare: "Luftfilter", kilde: "lager", status: "klarTilBestilling",
    antal: 6, enhed: "stk", prioritet: "mellem", varenummer: "LUF-01",
    anmoderId: "larsPetersen", oprettetAf: "uid-lars", oprettetMs: NU - 6 * T,
    note: "Til servicerunden i næste uge." },
  /* ⚠ OG DEN HER ER UDEN ANTAL. Den har et forslag og kan alligevel ikke
     bestilles — det er tilstanden "Sæt et antal", og uden et eksempel ser
     skærmen ud som om et forslag altid er nok. */
  { id: "beh-015", vare: "Bremsevæske DOT 4", kilde: "lager", status: "nyt",
    enhed: "liter", prioritet: "lav",
    anmoderId: "larsPetersen", oprettetAf: "uid-lars", oprettetMs: NU - 31 * T,
    note: "Ved ikke hvor meget der skal til." },

  /* ---- Kontor ------------------------------------------------------- */
  { id: "beh-007", vare: "Papir A4, 80 g", kilde: "kontor", status: "nyt",
    antal: 10, enhed: "pk", prioritet: "mellem", varenummer: "PA4-80",
    anmoderId: "metteSoerensen", oprettetAf: "uid-mette", oprettetMs: NU - 5 * T,
    note: "Til printer og kopirum." },
  { id: "beh-008", vare: "Printerpatron HP 305, sort", kilde: "kontor", status: "nyt",
    antal: 2, enhed: "stk", prioritet: "lav",
    anmoderId: "metteSoerensen", oprettetAf: "uid-mette", oprettetMs: NU - 27 * T },

  /* ---- Kontant køb --------------------------------------------------
     ⚠ EN KILDE, IKKE EN TILSTAND. Et kontantkøb er et behov nogen har dækket
     selv. Lå det som en status, kunne et behov skifte til det undervejs —
     og så ville pengene være brugt to gange. Se `procure.js`. */
  { id: "beh-009", vare: "Kabelbinder 300 mm — sort", kilde: "kontantkoeb", status: "nyt",
    antal: 5, enhed: "pk", prioritet: "lav",
    anmoderId: "michaelHansen", oprettetAf: "uid-michael", oprettetMs: NU - 24 * T,
    note: "Køb lokalt — vi betaler." },

  /* ⚠ ET AFVIST BEHOV BLIVER STÅENDE, med sin grund. Ellers kan man ikke se
     at nogen HAR meldt ind, og den samme mangel bliver meldt ind igen. */
  { id: "beh-010", vare: "Ny kaffemaskine til værkstedet", kilde: "kontor", status: "afvist",
    antal: 1, enhed: "stk", prioritet: "lav",
    anmoderId: "metteSoerensen", oprettetAf: "uid-mette", oprettetMs: NU - 72 * T,
    afvistAf: "uid-jens", afvistMs: NU - 48 * T,
    begrundelse: "Den nuværende er tre år gammel — vi venter til budgettet for næste år." },

  /* ⚠ TRE BESTILTE BEHOV, og de står her fordi ORDRERNE nedenfor er bygget af
     dem. Et behov der ligger på en ordre, må ikke stå som `nyt` i indbakken:
     så kunne den samme vare bestilles igen, og `ordreskriv` ville afvise det
     med en sætning man ikke kan forstå ud fra skærmen. Sporet går begge veje —
     behovet bærer sit `ordreId`, linjen sit `behovId`. */
  { id: "beh-011", vare: "Hydraulikslange 3/8\"", kilde: "lager", status: "bestilt",
    antal: 12, enhed: "stk", prioritet: "hoej", varenummer: "HYD-38", ordreId: "ord-001",
    anmoderId: "michaelHansen", oprettetAf: "uid-michael", oprettetMs: NU - 96 * T },
  { id: "beh-012", vare: "Bremseklods, aksel 2", kilde: "lager", status: "bestilt",
    antal: 2, enhed: "sæt", prioritet: "hoej", varenummer: "BRK-A2", ordreId: "ord-001",
    anmoderId: "michaelHansen", oprettetAf: "uid-michael", oprettetMs: NU - 95 * T },
  { id: "beh-013", vare: "Dæk 315/70 R22.5", kilde: "lager", status: "bestilt",
    antal: 4, enhed: "stk", prioritet: "mellem", varenummer: "DAEK-31570", ordreId: "ord-002",
    anmoderId: "michaelHansen", oprettetAf: "uid-michael", oprettetMs: NU - 90 * T },
];

/**
 * Bestillinger — trin 2 (beslutning 81).
 *
 * ⚠ LINJERNE ER NØGLET, IKKE EN ARRAY. RTDB har ingen arrays, og et demo-sæt
 * der bar dem som en array, ville lade skærmen virke i demo og fejle mod
 * noden — præcis den forskel der gjorde tre etapeovergange ubrugelige i
 * produktion mens demo stod grønt (beslutning 76). `linjeListe()` tåler
 * begge; sættet her skal bære den form noden HAR.
 *
 * ⚠ OG DER ER INTET `sum`-FELT. Beløbet regnes af `ordreSumOere()` hos
 * forbrugeren. Et gemt totalbeløb driver fra sine linjer første gang nogen
 * retter et antal — og her er tallet penge.
 *
 * ⚠ TO ER KLADDER OG ÉN ER SENDT. Udkastpanelet viser kun kladder, så et sæt
 * hvor alle var kladder, kunne ikke vise at filteret virker; ét hvor alle var
 * sendt, ville vise et tomt panel der lignede en fejl.
 */
export const DEMO_INDKOEBSORDRER = [
  { id: "ord-001", nummer: "BST-2026-00041", leverandoerId: "lv-hydra", status: "kladde",
    oprettetAf: "uid-michael", oprettetMs: NU - 20 * T,
    linjer: {
      "l-1": { vare: "Hydraulikslange 3/8\"", varenummer: "HYD-38", antal: 12,
               enhed: "stk", prisPrEnhedOere: 1850, behovId: "beh-011" },
      "l-2": { vare: "Bremseklods, aksel 2", varenummer: "BRK-A2", antal: 2,
               enhed: "sæt", prisPrEnhedOere: 78500, behovId: "beh-012" },
    } },
  { id: "ord-002", nummer: "BST-2026-00042", leverandoerId: "lv-daekteam", status: "kladde",
    oprettetAf: "uid-michael", oprettetMs: NU - 18 * T,
    note: "Leveres til Kolding.",
    linjer: {
      "l-1": { vare: "Dæk 315/70 R22.5", varenummer: "DAEK-31570", antal: 4,
               enhed: "stk", prisPrEnhedOere: 398000, behovId: "beh-013" },
    } },
  /* ⚠ DEN SENDTE HAR INGEN behovId. Den blev lagt før behovstrinnet fandtes,
     og feltet er valgfrit netop derfor — et påhittet behov ville være en post
     der aldrig blev meldt ind. */
  { id: "ord-003", nummer: "BST-2026-00040", leverandoerId: "lv-mercedes", status: "sendt",
    oprettetAf: "uid-jens", oprettetMs: NU - 140 * T,
    linjer: {
      "l-1": { vare: "Motorolie 5W30", varenummer: "OLIE-5W30", antal: 60,
               enhed: "l", prisPrEnhedOere: 4600 },
    } },
];

/* ══════════════════════════════════════════════════════════════════════════
   Selvkontrol
   ══════════════════════════════════════════════════════════════════════════ */
selvkontrol("demo-procure", () => {
  /* ⚠ HVER POST SKAL KUNNE GEMMES. Sættet er det eneste sted formen kan
     brydes uden at nogen ser det: reglerne håndhæver den ikke — noden er
     `.write: false` — og `behovskriv` ser kun det den får ind. */
  for (const b of DEMO_INDKOEBSBEHOV) {
    const r = valideBehov(b);
    if (!r.ok) {
      console.warn(
        `demo-procure: ${b.id} kunne ikke gemmes som behov — `
        + Object.entries(r.fejl).map(([f, m]) => `${f}: ${m}`).join(", ")
      );
    }
  }

  /* ⚠ ALLE FIRE KILDER SKAL VÆRE DER. Indbakken grupperer på dem, og en tom
     gruppe tegner ingen overskrift — så kan man ikke se at den virker. */
  const brugte = new Set(DEMO_INDKOEBSBEHOV.map((b) => b.kilde));
  for (const k of ALLE_BEHOVKILDER) {
    if (!brugte.has(k)) {
      console.warn(`demo-procure: ingen behov fra "${k}" — den gruppe kan ikke ses virke.`);
    }
  }

  /* ⚠ OG MINDST ÉT UDEN ANTAL. Feltet er valgfrit med vilje; er alle udfyldt,
     ser skærmen ud som om det altid er det, og "sæt antal" bliver en knap
     ingen kan se hvornår skal bruges. */
  if (!DEMO_INDKOEBSBEHOV.some((b) => b.antal === undefined)) {
    console.warn(
      "demo-procure: hvert behov har et antal. Feltet er VALGFRIT — uden et "
      + "eksempel kan skærmen ikke vise hvordan et ubesvaret antal ser ud."
    );
  }

  /* Et afvist behov skal have sin grund — ellers er afvisningen en tavshed. */
  for (const b of DEMO_INDKOEBSBEHOV) {
    if (b.status === "afvist" && !b.begrundelse) {
      console.warn(`demo-procure: ${b.id} er afvist uden en begrundelse.`);
    }
    if (!BEHOVSTATUS[b.status]) {
      console.warn(`demo-procure: ${b.id} har ukendt status "${b.status}".`);
    }
  }

  /* ⚠ HVER ORDRE SKAL OGSÅ KUNNE GEMMES. Samme grund som behovene: noden er
     `.write: false`, så reglerne håndhæver ikke formen for det her sæt. */
  for (const o of DEMO_INDKOEBSORDRER) {
    const r = valideOrdre(o);
    if (!r.ok) {
      console.warn(
        `demo-procure: ${o.id} kunne ikke gemmes som ordre — `
        + Object.entries(r.fejl).map(([f, m]) => `${f}: ${m}`).join(", ")
      );
    }
  }

  /**
   * ⚠ SPORET SKAL GÅ BEGGE VEJE. Et behov der peger på en ordre der ikke
   * findes — eller en linje der peger på et behov som stadig står `nyt` — er
   * den samme kendsgerning skrevet to steder, uenigt. Det er `bemanding.ledig`
   * i ny forklædning, og her koster det en vare bestilt to gange.
   */
  const ordreIder = new Set(DEMO_INDKOEBSORDRER.map((o) => o.id));
  const behovKort = new Map(DEMO_INDKOEBSBEHOV.map((b) => [b.id, b]));

  for (const b of DEMO_INDKOEBSBEHOV) {
    if (b.status === "bestilt" && !ordreIder.has(b.ordreId)) {
      console.warn(`demo-procure: ${b.id} er bestilt på ordren "${b.ordreId}", som ikke findes.`);
    }
  }
  for (const o of DEMO_INDKOEBSORDRER) {
    for (const l of linjeListe(o)) {
      if (!l.behovId) continue;
      const b = behovKort.get(l.behovId);
      if (!b) {
        console.warn(`demo-procure: ${o.id}/${l.id} peger på behovet "${l.behovId}", som ikke findes.`);
      } else if (b.status !== "bestilt") {
        console.warn(
          `demo-procure: ${o.id}/${l.id} bestiller ${l.behovId}, men behovet står som `
          + `"${b.status}" — så kan den samme vare bestilles igen.`
        );
      } else if (b.ordreId !== o.id) {
        console.warn(`demo-procure: ${l.behovId} peger på ${b.ordreId}, men ligger på ${o.id}.`);
      }
    }
  }

  /* ⚠ MINDST ÉN KLADDE OG ÉN SENDT. Udkastpanelet viser kun kladder; uden
     begge kan man ikke se at filteret virker. */
  const tilstande = new Set(DEMO_INDKOEBSORDRER.map((o) => o.status));
  if (!tilstande.has("kladde") || !tilstande.has("sendt")) {
    console.warn(
      "demo-procure: ordrerne står alle i samme tilstand — så kan udkastpanelets "
      + "filter ikke ses virke."
    );
  }
});

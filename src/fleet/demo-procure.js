/* src/fleet/demo-procure.js
 * Indkøbsbehov — trin 1 i Procures proces (beslutning 78, etape 2).
 *
 * ⚠ SÆTTET BRUGES KUN NÅR DER INGEN DATABASE ER. `useListe(node, { demo })`
 * er den rigtige vej: er noden seedet, er det NODEN der vises. En seedet node
 * må aldrig vise noget andet end sig selv — se beslutning 56 og 64.
 */
import { selvkontrol } from "./selvkontrol.js";
import { valideBehov, ALLE_BEHOVKILDER, BEHOVSTATUS } from "./procure.js";

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
});

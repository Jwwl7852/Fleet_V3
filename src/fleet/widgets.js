/* src/fleet/widgets.js
 * Hvad man kan sætte på sit eget dashboard. INGEN REACT.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ EN WIDGET ER ET FELT I kpi/ MED EN PRÆSENTATION — INTET ANDET.
 *
 * Samme regel som modulkortene i dashboards.js, og af samme grund: Dashboardet
 * henter ingen moduldata. Skulle en widget regne sit eget tal, måtte skærmen
 * hente den nodes data ned for hver widget brugeren havde valgt — og en
 * forside med tolv widgets ville hente tolv noder.
 *
 * Derfor står feltstien på hver widget, og en prøve holder dem op mod
 * demo-kpi.js. Et felt der ikke findes, ville skrive INTET (—), og "—" er en
 * tilstand vi har MED VILJE ("ikke aggregeret endnu"). En tastefejl i en sti
 * ville altså se ud som et felt der venter på aggregeringen.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ LAYOUTET ER BRUGERENS EGEN PRÆFERENCE OM SIG SELV — til forskel fra
 * `dashboardvisning`, som er en ADMINISTRATORS beslutning om en ANDEN bruger.
 * Derfor skrives det af klienten (gennem skriv.js' ene vej ind) og ikke af en
 * Cloud Function, og reglen er `auth.uid === $uid`: man kan kun rette sit
 * eget. To slags indstillinger, to slags skrivere.
 */

import { SAMLET } from "./dashboards.js";

/**
 * Kataloget.
 *
 * `modul` er hvilket modul widgeten hører til — den bruges til at gruppere
 * dem i vælgeren, og til at skjule widgets for moduler kunden ikke har.
 *
 * ⚠ HVER `felt` SKAL FINDES I kpi/. Mockuppen viser også "CO2-udledning" og
 * "Køretøjer i drift"; de har ingen felter, og de står derfor IKKE her.
 * En widget der ikke kan vise et tal, er en widget der viser en streg — og
 * stregen betyder noget andet.
 */
export const WIDGETS = [
  /* Fleet */
  { key: "aabneOpgaver", label: "Åbne opgaver", modul: "flaade",
    felt: "opgaver.aabne", form: "antal", ikon: "dokument", tone: "ikon-5" },
  { key: "nyeIndberetninger", label: "Nye indberetninger", modul: "flaade",
    felt: "flaade.nyeIndberetninger", form: "antal", ikon: "dokument", tone: "ikon-1" },
  { key: "serviceForfalder", label: "Service forfalder (30 dage)", modul: "flaade",
    felt: "flaade.serviceInden30", form: "antal", ikon: "skruenoegle", tone: "ikon-3" },
  { key: "udeAfDrift", label: "Enheder ude af drift", modul: "flaade",
    felt: "flaade.udeAfDrift", form: "antal", ikon: "lastbil", tone: "ikon-2" },
  { key: "omkostningPrKm", label: "Omkostning pr. km", modul: "flaade",
    felt: "flaade.omkostningPrKmOere", form: "kr2", ikon: "seddel", tone: "ikon-6" },
  { key: "nedetid", label: "Nedetid", modul: "flaade",
    felt: "flaade.nedetidPct", form: "pct", ikon: "ur", tone: "ikon-3" },
  { key: "braendstof", label: "Brændstofudgift", modul: "flaade",
    felt: "flaade.braendstofOere", form: "kr", ikon: "seddel", tone: "ikon-4" },
  { key: "forsinkede", label: "Forsinkede opgaver", modul: "flaade",
    felt: "opgaver.forsinkede", form: "antal", ikon: "ur", tone: "ikon-1" },

  /* Facility */
  { key: "aabneFejl", label: "Fejl og mangler", modul: "facility",
    felt: "facility.aabneFejl", form: "antal", ikon: "advarsel", tone: "ikon-2" },
  { key: "klimaalarmer", label: "Klimaalarmer i dag", modul: "facility",
    felt: "facility.klimaalarmerIDag", form: "antal", ikon: "termometer", tone: "ikon-1" },
  { key: "servicepunkter", label: "Servicepunkter forfalder", modul: "facility",
    felt: "facility.servicepunkterForfalder", form: "antal", ikon: "skruenoegle", tone: "ikon-3" },
  { key: "aktiver", label: "Aktiver i drift", modul: "facility",
    felt: "facility.aktiver", form: "antal", ikon: "bygning", tone: "ikon-4" },

  /* Procure */
  { key: "fakturaerTilGodkendelse", label: "Fakturaer til godkendelse", modul: "indkoeb",
    felt: "indkoeb.fakturaerTilGodkendelse", form: "antal", ikon: "seddel", tone: "ikon-2" },
  { key: "aabneOrdrer", label: "Åbne ordrer", modul: "indkoeb",
    felt: "indkoeb.aabneOrdrer", form: "antal", ikon: "vogn", tone: "ikon-5" },
  { key: "maanedensForbrug", label: "Månedens forbrug", modul: "indkoeb",
    felt: "indkoeb.maanedensForbrugOere", form: "kr", ikon: "seddel", tone: "ikon-6" },
  { key: "leveranceTilTiden", label: "Leverance til tiden", modul: "indkoeb",
    felt: "indkoeb.leveranceTilTidenPct", form: "pct", ikon: "ur", tone: "ikon-3" },

  /* Workforce */
  { key: "underbemandede", label: "Underbemandede vagter", modul: "bemanding",
    felt: "bemanding.underbemandede", form: "antal", ikon: "personer", tone: "ikon-1" },
  /**
   * ⚠ NØGLEN ER UÆNDRET, OG DET ER HELE POINTEN.
   *
   * `bemanding.ledig` forlod `kpi/` (beslutning 71), men widgeten hedder
   * stadig `ledigKapacitet` — og det er DEN streng der står i brugernes gemte
   * forsider. Havde vi fjernet widgeten, ville `valideLayout()` afvise hvert
   * gemt layout der indeholdt den, med *"Ukendte widgets: ledigKapacitet"* —
   * første gang brugeren rørte sin forside, og for en ændring han ikke havde
   * bedt om.
   *
   * ⚠ EN MIGRERING VAR ALTSÅ IKKE PRISEN FOR AT FJERNE FELTET. Prisen var at
   * finde ud af at `felt` og `afledt` er to måder at nå det samme tal på —
   * og at kataloget i dashboards.js allerede kunne begge dele.
   */
  { key: "ledigKapacitet", label: "Ledig kapacitet", modul: "bemanding",
    afledt: "ledig", form: "antal", ikon: "personer", tone: "ikon-6" },
  { key: "kompetencerUdloeber", label: "Kompetencer udløber", modul: "bemanding",
    felt: "bemanding.kompetencerUdloeber", form: "antal", ikon: "maerkat", tone: "ikon-3" },

  /* Økonomi */
  { key: "driftsomkostninger", label: "Driftsomkostninger", modul: "oekonomi",
    felt: "oekonomi.driftsomkostningerOere", form: "kr", ikon: "seddel", tone: "ikon-4" },
  { key: "ikkeFaktureret", label: "Ikke-faktureret", modul: "oekonomi",
    felt: "oekonomi.ikkeFaktureretOere", form: "kr", ikon: "seddel", tone: "ikon-2" },
];

export const ALLE_WIDGETS = WIDGETS.map((w) => w.key);

export const widget = (key) => WIDGETS.find((w) => w.key === key) || null;

/**
 * De widgets en kunde overhovedet kan vælge imellem.
 *
 * ⚠ HER STOD ET SÆRTILFÆLDE FOR `oekonomi` — og det byggede på en påstand
 * der var forkert. Jeg skrev at Økonomi "ikke er et modul, men et KPI-domæne",
 * og lod derfor de to økonomiwidgets slippe uden om modultjekket. `oekonomi`
 * ER et modul i `moduler.js`, det er sælgeligt, og det er ikke `altid`.
 * Særtilfældet ville altså have tilbudt en kunde uden Økonomi to widgets med
 * driftsomkostninger og ikke-faktureret beløb — netop det tal han ikke har
 * købt adgang til at se en skærm for.
 *
 * Der er ingen undtagelse. Hver widget hører til ét modul, og `harModul()`
 * afgør resten — som den gør for sidebaren.
 */
export const tilgaengeligeWidgets = (harModulFn) =>
  WIDGETS.filter((w) => harModulFn(w.modul));

/**
 * standardlayout(dashboard, harModulFn) → widget-nøgler.
 *
 * ⚠ ET LAYOUT DER IKKE ER SAT, ER IKKE ET TOMT LAYOUT. En bruger der aldrig
 * har rørt skærmen, skal se noget fornuftigt — ikke en tom side med
 * "træk en widget hertil". Standarden er modulets egne widgets; på det samlede
 * dashboard er det de første fra hvert modul.
 */
export function standardlayout(dashboard, harModulFn = () => true) {
  const kan = tilgaengeligeWidgets(harModulFn);
  if (dashboard !== SAMLET) return kan.filter((w) => w.modul === dashboard).map((w) => w.key);

  /* Samlet: to fra hvert modul, så forsiden dækker bredt uden at blive lang.
     Rækkefølgen er katalogets — den er valgt, og en sortering på noget andet
     ville flytte sig af sig selv. */
  const pr = new Map();
  const ud = [];
  for (const w of kan) {
    const n = pr.get(w.modul) || 0;
    if (n >= 2) continue;
    pr.set(w.modul, n + 1);
    ud.push(w.key);
  }
  return ud;
}

/**
 * valideLayout(layout) → { ok, fejl }
 *
 * ⚠ SAMME FUNKTION I SKÆRMEN OG I REGLERNE. Reglerne kan ikke slå op i et
 * katalog, så de prøver formen (en liste af korte strenge); den her prøver
 * NAVNENE. En ukendt nøgle ville være en widget der ikke findes — og skærmen
 * ville springe den over i tavshed, så layoutet blev kortere end det brugeren
 * gemte, uden at nogen kunne se hvorfor.
 */
export function valideLayout(layout) {
  if (!Array.isArray(layout)) return { ok: false, fejl: "Layoutet skal være en liste." };
  const ukendte = layout.filter((k) => !ALLE_WIDGETS.includes(k));
  if (ukendte.length) return { ok: false, fejl: `Ukendte widgets: ${ukendte.join(", ")}.` };
  if (new Set(layout).size !== layout.length) {
    return { ok: false, fejl: "Den samme widget står to gange." };
  }
  return { ok: true, fejl: null };
}

/**
 * ⚠ DER ER INTET LOFT PÅ ANTALLET — OG DET LOFT DER STOD HER, VAR EN
 * SMAGSDOM FORKLÆDT SOM EN REGEL.
 *
 * `MAKS_WIDGETS = 12` blev begrundet med at "tyve widgets på én forside ikke
 * er et overblik". Det er sandt om de fleste forsider og forkert om nogens:
 * argumentet er en anbefaling, ikke en kendsgerning om systemet, og det stod
 * håndhævet i BÅDE `valideLayout()` og i `firebase.rules.json`, hvor pladserne
 * var talt til elleve.
 *
 * Layoutet er brugerens egen præference om sig selv. Det er hans skærm, og en
 * grænse han ikke kan hæve, er en beslutning vi har taget på hans vegne uden
 * at kunne begrunde den med andet end smag.
 *
 * ⚠ DER ER STADIG EN ØVRE GRÆNSE — den er bare ikke et TAL vi fandt på.
 * `valideLayout()` afviser ukendte nøgler og dubletter, så et layout kan
 * aldrig blive længere end kataloget. Loftet er antallet af widgets der
 * findes, og det står ét sted: `WIDGETS`.
 *
 * ⚠ OG DET ER IKKE EN ADGANGSÆNDRING. Hvad en bruger må SE, afgøres af hans
 * rolle og af kundens moduler — ikke af hvor mange kort der er plads til.
 * Se noten i dashboardvisning.js om hvorfor en visning ikke er en adgang.
 */
export const ANTAL_WIDGETS = WIDGETS.length;

/**
 * layoutFor(gemt, dashboard, harModulFn) → widget-nøgler der kan tegnes.
 *
 * ⚠ FILTRERET MOD DET KUNDEN HAR. Et gemt layout kan bære en widget fra et
 * modul der siden er fravalgt — og den ville ellers stå og vise et tal fra et
 * modul kunden ikke har købt.
 *
 * ⚠ OG MOD KATALOGET. En widget vi har fjernet, skal ikke efterlade et hul;
 * den springes over. Det er derfor valideLayout() findes: den fanger det ved
 * SKRIVNINGEN, hvor man kan sige det til nogen.
 */
export function layoutFor(gemt, dashboard, harModulFn = () => true) {
  const kan = new Set(tilgaengeligeWidgets(harModulFn).map((w) => w.key));
  if (!Array.isArray(gemt)) return standardlayout(dashboard, harModulFn);
  const rene = gemt.filter((k) => kan.has(k));
  /* ⚠ ET TOMT GEMT LAYOUT ER ET VALG. Brugeren har fjernet alt, og så skal
     han ikke få standarden tilbage ved næste besøg — det ville se ud som om
     gemmeknappen ikke virkede. Kun et layout der ALDRIG er gemt, får
     standarden; det er forskellen på null og []. */
  return rene;
}

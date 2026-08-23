/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/format.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/* src/fleet/format.js
 * Én kilde til formatering og fortegn i hele platformen.
 *
 * Beløb ligger i databasen som hele ØRE (integer).
 * Afvigelser gemmes ALTID som (faktisk − budget) — aldrig som "besparelse"
 * i det ene modul og "overskridelse" i det andet. Farven bestemmes af
 * betterWhen, ikke af fortegnet. Det er derfor det samme −18.400 kr kan
 * være rødt i Kunder & Priser (mistet omsætning) og grønt i Økonomi
 * (under budget) uden at logikken modsiger sig selv.
 */

const nf = (d = 0) =>
  new Intl.NumberFormat("da-DK", { minimumFractionDigits: d, maximumFractionDigits: d });

export const kr = (oere, dec = 0) => nf(dec).format((oere || 0) / 100) + " kr.";

/**
 * oereFraKroner("8.420,50") → 842050
 *
 * Den anden vej end kr(). Et inputfelt viser kroner; basen gemmer ØRE som
 * integer (beslutning 2), og omregningen skal ske ét sted.
 *
 * Math.round er ikke en detalje: 84,20 * 100 giver 8419.999999999999 i
 * flydende komma. Uden afrunding ville beløbet blive gemt som 8419 øre, og
 * en faktura ville mangle en øre — som først opdages i en afstemning, hvor
 * ingen kan forklare den.
 *
 * Dansk notation: komma som decimaltegn, punktum og mellemrum som
 * tusindtalsseparator. → null hvis feltet ikke er et tal.
 */
export function oereFraKroner(tekst) {
  if (tekst == null || tekst === "") return null;
  const rent = String(tekst).replace(/[\s.]/g, "").replace(",", ".");
  const n = Number(rent);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ ET TAL DER IKKE ER BEREGNET, ER IKKE NUL.
 *
 * `num(null)` gav "0" indtil KPI-aggregeringen skulle skrives. Så længe
 * `kpi/` blev seedet fra demo-sættet, havde hvert felt en værdi, og forskellen
 * kunne ikke ses. Den dag et aggregeringsjob skriver `null` for et felt hvis
 * KILDE ikke findes — `indkoeb` er ikke i basen endnu — ville skærmen skrive
 * "0 åbne ordrer". Det er ikke en tom liste; det er et ubesvaret spørgsmål,
 * og de to må ikke se ens ud.
 *
 * Det er den samme regel som momssatsen der mangler, som en sats uden pris,
 * og som `beregnNoegletal()` der returnerer null under MINDSTE_GRUNDLAG: vi
 * gætter ikke, og vi skriver ikke et nul der ligner et regnestykke der er
 * gået op.
 *
 * `INTET` er tegnet formatterne bruger. Der står ~96 hårdkodede "—" i
 * skærmene endnu, og de er IKKE forkerte — de er det samme tegn. Det farlige
 * ville være en anden markør: en skærm der skrev "n/a", "-" eller "·" for det
 * samme, ville ikke kunne søges frem, og den næste ville tro der var forskel.
 * `test/format.test.mjs` fejler på det.
 *
 * ⚠ NUL ER STADIG NUL. `num(0)` er "0" — en tom liste er et svar.
 * ══════════════════════════════════════════════════════════════════════════
 */
export const INTET = "—";

const talEllerIntet = (n, formater) =>
  (n == null || Number.isNaN(n) ? INTET : formater(n));

export const num = (n, dec = 0) => talEllerIntet(n, (x) => nf(dec).format(x));
export const pct = (p, dec = 0) => talEllerIntet(p, (x) => nf(dec).format(x) + " %");
export const km = (n) => talEllerIntet(n, (x) => nf(0).format(x) + " km");

/**
 * Et antal der måske ikke er hele antallet.
 *
 * ⚠ EN SUM AF EN AFKORTET LISTE ER IKKE EN TOTAL — beslutning 6 med et andet
 * ansigt. `useListe(node, { graense: 1000 })` henter de sidste tusinde rækker
 * og svarer `afkortet` når loftet blev ramt; tælles de op og sættes i et
 * nøgletalskort, står der en **påstand om virksomheden** der er regnet af et
 * udsnit.
 *
 * Målt: **13 nøgletalskort** gjorde netop det — "Varer i alt", "Udlån i alt",
 * "Kasser i alt". Værst stod der `note="hele historikken"` under et tal talt
 * op af en liste med loft på 1000.
 *
 * ⚠ "MINDST" ER ET SVAR, ET TAL ER ET LØFTE. En nedre grænse er en
 * kendsgerning: vi HAR set så mange. En total vi ikke kan stå inde for, er
 * ikke en tilnærmelse — den er forkert på en måde ingen kan se.
 *
 * Skjul den ikke bag en streg: at listen er afkortet, er en oplysning om
 * VORES hentning, ikke om kundens data. Se beslutning 96.
 */
export const mindst = (n, afkortet) =>
  (afkortet ? `mindst ${num(n)}` : num(n));

/** Millimeter → meter til VISNING. Længder gemmes som integer i millimeter —
 *  se samletLaengdeMm() i flaade.js. Vis meter, gem millimeter; en float ved
 *  en færgetakstgrænse er en fejl der venter. */
export const meter = (mm, dec = 2) => nf(dec).format((mm || 0) / 1000) + " m";

export const dato = (ms) =>
  new Date(ms).toLocaleDateString("da-DK", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Dato + klokkeslæt i én streng. Bruges hvor tidspunktet på minuttet betyder
 *  noget — en mail i en sagstråd, en aftale med et værksted. */
export const datoTid = (ms) => `${dato(ms)} kl. ${klokke(ms)}`;

/* ---- <input type="date"> ↔ millisekunder -------------------------------
 *
 * ⚠ KLOKKEN 12, IKKE MIDNAT. `new Date("2026-08-10")` er midnat UTC, og i
 * dansk sommertid er det den 10. kl. 02 — men trækkes der en time et sted i
 * kæden, bliver det den 9. En reservation der rykker sig en dag, opdages
 * ikke ved at kigge på den. Middag har en halv dags luft til hver side.
 *
 * ⚠ OG DERFOR STÅR DE HER. De var skrevet af i personale.js og i Indkøb, og
 * en tredje kopi var på vej ind med Unitbooking. Samme regel to steder, hvor
 * den ene driver, er den fejl dette repo bliver ved med at betale for.
 */
export const iDagIso = () => new Date().toISOString().slice(0, 10);

export function isoTilMs(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

export const msTilIso = (ms) =>
  Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : iDagIso();

/** Filstørrelse. Hører her og ikke i et modul, af samme grund som alt andet
 *  i filen: ellers bliver det 180 kB ét sted og 0,18 MB et andet. */
export const filstoerrelse = (bytes) => {
  const b = bytes || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${nf(0).format(b / 1024)} kB`;
  return `${nf(1).format(b / (1024 * 1024))} MB`;
};
export const klokke = (ms) =>
  new Date(ms).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
export const ugedag = (ms) =>
  new Date(ms).toLocaleDateString("da-DK", { weekday: "short", day: "2-digit", month: "2-digit" });

/** ISO-8601 ugenummer — bruges af Bemanding og Disponering, som ellers
 *  regner uger forskelligt. */
export function ugenr(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - jan1) / 86400000 + 1) / 7);
}

/**
 * deviation(v, { betterWhen, unit, dec })
 *   v          faktisk − budget (øre, procentpoint eller stk)
 *   betterWhen "lower" (omkostninger, nedetid) | "higher" (omsætning, dækningsgrad)
 *   unit       "kr" | "pct" | "num"
 * → { text, tone, good }  tone: "good" | "bad" | "neutral"
 */
export function deviation(v, { betterWhen = "lower", unit = "num", dec } = {}) {
  /* ⚠ EN AFVIGELSE DER IKKE ER REGNET, ER IKKE "UÆNDRET".
     Her stod `const value = v || 0`, og null blev derfor til "0,0 %" med
     neutral tone — altså en PÅSTAND om at intet havde flyttet sig. Det er
     samme fejl som num() havde, og den er værre her: et nøgletal der mangler,
     skriver INTET og indrømmer det, mens en afvigelse på nul lyder som en
     måling af stabilitet.

     Den blev synlig da kpi/ holdt op med at være seedet: Dashboardet skrev
     "0,0 % vs. budget" under en driftsomkostning der aldrig var regnet, og
     "↘ −0,6 %-point" under en nedetid der var tom — det sidste fordi tallet
     oven i købet var hardkodet i skærmen.

     ⚠ NUL ER STADIG NUL. `deviation(0)` er "0,0 %" og betyder uændret; det
     er kun det UBESVAREDE der nu skiller sig ud. Se num() ovenfor og
     test/format.test.mjs. */
  if (v == null || Number.isNaN(v)) {
    return { text: INTET, pil: "", tone: "neutral", good: false };
  }
  const value = v;
  const good = betterWhen === "lower" ? value < 0 : value > 0;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const abs = Math.abs(value);
  const text =
    sign + (unit === "kr" ? kr(abs, dec ?? 0) : unit === "pct" ? pct(abs, dec ?? 1) : num(abs, dec ?? 0));
  /* ⚠ PILEN FØLGER RETNINGEN, FARVEN FØLGER OM DET ER GODT.
     De to er ikke det samme, og det er hele pointen med betterWhen: en
     stigning i omkostninger peger OP og er rød; et fald i nedetid peger NED
     og er grønt. Slog vi dem sammen, ville pilen sige det samme som farven
     og dermed ingenting. Den står uden for `text`, så tabeller og
     minilinjer kan bruge tallet uden pilen. */
  const pil = value > 0 ? "↗" : value < 0 ? "↘" : "";
  return { text, pil, tone: value === 0 ? "neutral" : good ? "good" : "bad", good };
}

/** Afvigelse i procent af budget. Beregnes — skrives aldrig ind i basen. */
/**
 * Afvigelsen i procent mellem et faktisk tal og et budget — eller `null`.
 *
 * ⚠ HER STOD `!budget ? 0`. Mangler budgettet, er afvigelsen ikke NUL — den
 * er ukendt, og 0 betyder "præcis på budget". Dashboardet skrev
 * "0,0 % vs. budget" under en driftsomkostning der aldrig var regnet, mod et
 * budget der heller ikke fandtes. To ubesvarede tal blev til én rosende dom.
 *
 * ⚠ OG DET ER SAMME MØNSTER TRE STEDER: regnestykker på null giver STILLE et
 * tal. `100 - null` er 100, `null / 100` er 0, og `!budget ? 0` er 0. Hver
 * gang ser resultatet ud som en måling. Se noten ved deviation().
 */
export const deviationPct = (faktisk, budget) => {
  if (!Number.isFinite(faktisk) || !Number.isFinite(budget) || budget === 0) return null;
  return ((faktisk - budget) / budget) * 100;
};

/** Grader af alvor. Samme tre trin i alle moduler. */
export const ALVOR = { hoej: "Høj", mellem: "Mellem", lav: "Lav" };
export const alvorTone = (n) => (n === "hoej" ? "bad" : n === "mellem" ? "warn" : "ok");

/** Dage til en dato, med samme tærskler som Flåde og Facility bruger til
 *  servicevarsling: overskredet / ≤14 dage / ≤30 dage / ok. */
export function serviceTone(forfaldMs, nu = Date.now()) {
  const dage = Math.floor((forfaldMs - nu) / 86400000);
  if (dage < 0) return { dage, tone: "bad", tekst: "Overskredet" };
  if (dage <= 14) return { dage, tone: "bad", tekst: `Om ${dage} dage` };
  if (dage <= 30) return { dage, tone: "warn", tekst: `Om ${dage} dage` };
  return { dage, tone: "ok", tekst: `Om ${dage} dage` };
}

/**
 * Øre → den tekst der står i et beløbsFELT. Uden tusindtalsseparator: et
 * inputfelt skal kunne redigeres, ikke læses som en rapport. Modstykket til
 * oereFraKroner() ovenfor — kr() er til visning, den her er til redigering.
 */
export const kronerFraOere = (oere) =>
  !Number.isFinite(oere) ? "" : (oere / 100).toFixed(2).replace(".", ",");

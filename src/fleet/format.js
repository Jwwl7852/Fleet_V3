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
export const num = (n, dec = 0) => nf(dec).format(n || 0);
export const pct = (p, dec = 0) => nf(dec).format(p || 0) + " %";
export const km = (n) => nf(0).format(n || 0) + " km";

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
 * en tredje kopi var på vej ind med Turtlebooking. Samme regel to steder, hvor
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
  const value = v || 0;
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
export const deviationPct = (faktisk, budget) =>
  !budget ? 0 : ((faktisk - budget) / budget) * 100;

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

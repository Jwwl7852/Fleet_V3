/* src/fleet/rutestatus.js
 * Rute & status. BESLUTNING 22 — INGEN GPS.
 *
 * INGEN IMPORTS.
 *
 * ⚠ SKÆRMEN HED "LIVE-KORT", OG DET NAVN LOVEDE NOGET VI IKKE HAR.
 *
 * Der er ingen sporing: ingen GPS-boks, ingen chaufførapp, ingen position.
 * Et kort med prikker der bevæger sig, ville kræve en datakilde der ikke
 * findes — og et kort UDEN prikker er et kort der ser i stykker ud.
 *
 * Rute & status viser i stedet det vi faktisk ved:
 *
 *   den planlagte rute        fra etapen
 *   afsluttede stop           fra chaufførens statushændelser
 *   næste stop                udledt
 *   forventede tidspunkter    fra etapens etaMs og planen
 *
 * GPS bliver en DATAKILDE SENERE, ikke et fundament. Bygger man skærmen
 * omkring positioner, kan den ikke vise noget før sporingen findes — og
 * kommer sporingen aldrig, står man med en tom skærm man ikke kan sælge.
 * Bygger man den omkring planen og chaufførens meldinger, virker den i dag,
 * og en position bliver en ekstra kolonne.
 *
 * ⚠ EN STATUSHÆNDELSE ER NOGET ET MENNESKE HAR MELDT. Den er ikke en måling,
 * og den kan være forkert eller mangle. Skærmen skal derfor kunne vise "vi har
 * ikke hørt noget siden kl. 11.40" — ikke gætte en position ud af en plan.
 */

/** Hvad chaufføren melder. Fast vokabular: fritekst gør en tidslinje
 *  usøgbar, og så bliver den aldrig brugt til det den er lavet til. */
export const HAENDELSE = {
  afgang:          { label: "Afgang",              stop: true,  pill: "info" },
  ankomstLaesning: { label: "Ankommet, læsser",    stop: true,  pill: "warn" },
  afgangLaesning:  { label: "Læsset, kører",       stop: true,  pill: "info" },
  graense:         { label: "Grænse passeret",     stop: false, pill: "info" },
  pause:           { label: "Pause",               stop: false, pill: "warn" },
  ankomstLosning:  { label: "Ankommet, losser",    stop: true,  pill: "warn" },
  afsluttet:       { label: "Aflæsset, afsluttet", stop: true,  pill: "ok"   },
  forsinkelse:     { label: "Melder forsinkelse",  stop: false, pill: "bad"  },
};

export const ALLE_HAENDELSER = Object.keys(HAENDELSE);

/** Hændelser der afslutter etapen. */
const AFSLUTTER = new Set(["afsluttet"]);

/**
 * Den planlagte rute som en liste af stop. Udledt af etapen — den gemmes ikke
 * som sin egen node, for så ville den kunne drive fra fraSted og tilSted.
 */
export function planlagteStop(etape) {
  if (!etape) return [];
  const ud = [{ id: "start", sted: etape.fraSted, rolle: "afhentning", planlagtMs: etape.fra }];
  for (const g of etape.graenseovergange || []) {
    ud.push({ id: `graense-${g}`, sted: g, rolle: "graense", planlagtMs: null });
  }
  ud.push({ id: "slut", sted: etape.tilSted, rolle: "levering", planlagtMs: etape.etaMs ?? etape.til });
  return ud;
}

/**
 * seneste(haendelser) → den nyeste melding, eller null.
 *
 * Rækkefølgen afgøres af `ms` og ikke af listens orden: meldinger kan komme
 * ind i en anden rækkefølge end de skete, hvis chaufføren har været uden
 * dækning.
 */
export const seneste = (haendelser = []) =>
  [...haendelser].filter((h) => Number.isFinite(h?.ms)).sort((a, b) => b.ms - a.ms)[0] || null;

/** Er etapen meldt afsluttet? Udledt af meldingerne, ikke af et gemt flag. */
export const erAfsluttet = (haendelser = []) =>
  haendelser.some((h) => AFSLUTTER.has(h.type));

/**
 * naesteStop(etape, haendelser) → { stop, index } | null
 *
 * Det første planlagte stop der endnu ikke er meldt passeret. Er alt meldt,
 * er der intet næste — og det er ikke det samme som at etapen er afsluttet.
 */
export function naesteStop(etape, haendelser = []) {
  const stop = planlagteStop(etape);
  const naaede = new Set(haendelser.filter((h) => h.stopId).map((h) => h.stopId));
  const index = stop.findIndex((s) => !naaede.has(s.id));
  if (index < 0) return null;
  return { stop: stop[index], index };
}

/**
 * afvigelseFraPlan(etape, haendelser, nu) → minutter, positivt = forsinket
 *
 * BEREGNET af den seneste melding mod planen — aldrig gemt. Et lagret
 * forsinkelsestal ville drive i det sekund planen flyttes.
 *
 * Returnerer null når vi ikke kan vide det. At vise "0 min." fordi der ikke er
 * nogen melding, er at påstå at turen er i tide.
 */
export function afvigelseFraPlan(etape, haendelser = [], nu = Date.now()) {
  const sidst = seneste(haendelser);
  if (!sidst || !etape) return null;

  const meldt = haendelser.find((h) => h.type === "forsinkelse" && Number.isFinite(h.forsinketMin));
  if (meldt) return meldt.forsinketMin;

  /* Er etapen afsluttet, måler vi mod den faktiske afslutning. */
  const slut = haendelser.find((h) => h.type === "afsluttet");
  const planlagtSlut = etape.etaMs ?? etape.til;
  if (slut && Number.isFinite(planlagtSlut)) {
    return Math.round((slut.ms - planlagtSlut) / 60000);
  }
  return null;
}

/**
 * Hvor længe siden vi hørte fra chaufføren. Det er den ærlige erstatning for
 * en position: vi ved ikke hvor bilen er, men vi ved hvornår vi sidst hørte
 * noget.
 */
export function stilhedMin(haendelser = [], nu = Date.now()) {
  const sidst = seneste(haendelser);
  return sidst ? Math.round((nu - sidst.ms) / 60000) : null;
}

/** Tre trin, som serviceTone. Over fire timers stilhed på en igangværende tur
 *  er noget nogen skal reagere på. */
export function stilhedTone(minutter) {
  if (minutter == null) return { tone: "bad", tekst: "Ingen meldinger" };
  if (minutter > 240) return { tone: "bad", tekst: `${Math.round(minutter / 60)} t siden` };
  if (minutter > 90) return { tone: "warn", tekst: `${minutter} min. siden` };
  return { tone: "ok", tekst: `${minutter} min. siden` };
}

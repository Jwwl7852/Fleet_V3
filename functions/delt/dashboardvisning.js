/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/dashboardvisning.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/* src/fleet/dashboardvisning.js
 * Hvilke dashboards en bruger får VIST. INGEN REACT.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ DET ER EN VISNING, IKKE EN ADGANG — OG NAVNET SIGER DET.
 *
 * Mockuppen kalder skærmen "Dashboardadgange" og sætter en krone ved "ekstra
 * adgang". Det ville være et løfte platformen ikke kan holde:
 *
 *   To brugere i samme firma ser NØJAGTIG det samme. Indstillingen her
 *   skjuler et dashboard for den ene; den spærrer ingenting for ham.
 *
 * Det er nøjagtig samme skel som modullisten i moduler.js:
 *
 *   "MENUEN SKJULER ET MODUL KUNDEN IKKE HAR KØBT — men det er en KOMMERCIEL
 *    kontrol, ikke en sikkerhedskontrol."
 *
 * Kaldte vi det en adgang, ville nogen før eller siden slå Økonomi fra for en
 * chauffør og TRO at tallene var utilgængelige for ham. Det er den værste
 * slags kontrol: den ser ud som om den virker.
 *
 * ⚠ HER STOD AT `kpi/` VAR LÆSBAR FOR ENHVER, UDEN PERMISSION OG UDEN
 * MODULKLAUSUL. Halvdelen af det er ikke sandt længere.
 *
 * Beslutning 44 delte `kpi/` op pr. domæne, og hvert domæne bærer nu sit
 * MODULS klausul: en kunde uden Warehouse kan ikke længere læse
 * `tenants/<id>/kpi/<division>/current/warehouse`. Det var netop den
 * opdeling den her note bad om.
 *
 * ⚠ OG SIDEN ER DER OGSÅ KOMMET EN PERMISSION — men den ændrer det ikke.
 *
 * `kpi/<division>/current/kunder` kræver `kunder.laes`, fordi et domæne arver
 * sin kildes læse-permission: et nøgletal er ikke mildere end sit grundlag.
 * Det er stadig ikke det samme som en adgang HER, og forskellen er værd at
 * holde fast i:
 *
 *   Permissionen siger hvad ROLLEN må. Indstillingen her siger hvad ÉN
 *   BRUGER får VIST. To brugere med samme rolle ser nøjagtig det samme,
 *   uanset afkrydsningen.
 *
 * Dertil har alle syv roller hver eneste læse-permission — kun `audit.laes`
 * skiller nogen ud — så en chauffør i et firma der HAR Økonomi, kan stadig
 * læse `kpi/<division>/current/oekonomi` direkte.
 *
 * Derfor er det stadig en VISNING, og navnet holder.
 *
 * ⚠ DET DER VILLE LAVE DET OM, er hvis en REGEL slog op i indstillingen. Så
 * ville "skjul" være blevet til "spær", og navnet ville være en løgn den
 * anden vej. Prøven i `test/dashboardvisning.test.mjs` vogter netop dét —
 * ikke længere blot om der findes en permission et sted i klausulen, hvilket
 * viste sig at være det forkerte spørgsmål.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { SAMLET, DASHBOARDS } from "./dashboards.js";

/**
 * ⚠ STANDARDEN ER "ALT DET KUNDEN HAR KØBT" — ikke ingenting.
 *
 * En bruger uden en indstilling ser præcis det samme som før: modullisten
 * afgør det. Det er dét der gør ændringen sikker at udrulle — ingen
 * eksisterende bruger mister en visning af at funktionen kommer. Samme
 * fremgangsmåde som `roller/`, hvor en tenant uden noden opfører sig som før.
 *
 * ⚠ OG "INGEN INDSTILLING" ER IKKE DET SAMME SOM "ALT SLÅET FRA". En tom
 * indstilling er et valg administratoren har truffet; en manglende er et valg
 * han ikke har truffet. Blandes de to, ville en administrator der slog alt fra
 * for en bruger, se det samme som hvis han aldrig havde rørt skærmen.
 */
export function synligeDashboards(indstilling, harModulFn) {
  const kanKoebes = DASHBOARDS.filter((d) => d.altid || harModulFn(d.key));
  if (!indstilling || typeof indstilling !== "object") return kanKoebes;

  return kanKoebes.filter((d) => {
    const valgt = indstilling[d.key];
    /* Et felt der ikke er sat, følger standarden: vist. Kun et eksplicit
       `false` skjuler. Ellers ville et nyt modul være usynligt for hver
       bruger der havde en indstilling fra før modulet fandtes. */
    return valgt !== false;
  });
}

/**
 * ⚠ SAMLET KAN GIVES SELV UDEN MODULERNE — og det er hele pointen med den.
 *
 * En bogholder skal kunne se det samlede overblik uden at have Fleet,
 * Warehouse og Facility hver for sig. Mockuppens krone sidder netop dér.
 *
 * Men det er stadig en VISNING: tallene i `kpi/` var læsbare for ham i
 * forvejen. Det her afgør om han får dem serveret, ikke om han kan nå dem.
 */
export const ekstraSamlet = (indstilling) => Boolean(indstilling?.[SAMLET]);

/**
 * valideVisning(indstilling) → { ok, fejl }
 *
 * Samme funktion i skærmen og på serveren. Nøglerne skal være dashboards vi
 * kender — en ukendt nøgle ville være en indstilling for noget der ikke
 * findes, og den ville blive stående og se ud som om den betød noget.
 */
export function valideVisning(indstilling) {
  if (!indstilling || typeof indstilling !== "object" || Array.isArray(indstilling)) {
    return { ok: false, fejl: "Indstillingen skal være et opslag." };
  }
  const kendte = new Set(DASHBOARDS.map((d) => d.key));
  const ukendte = Object.keys(indstilling).filter((k) => !kendte.has(k));
  if (ukendte.length) {
    return { ok: false, fejl: `Ukendte dashboards: ${ukendte.join(", ")}.` };
  }
  const ikkeBool = Object.entries(indstilling).filter(([, v]) => typeof v !== "boolean");
  if (ikkeBool.length) {
    return { ok: false, fejl: "Hver værdi skal være sand eller falsk." };
  }
  return { ok: true, fejl: null };
}

/**
 * ⚠ MAN KAN IKKE SKJULE ALT.
 *
 * En bruger uden et eneste dashboard lander på en forside der er tom, og
 * Dashboard er `altid: true` i modulkataloget — den kan ikke fravælges,
 * netop fordi "et system uden forside ikke er et system".
 *
 * Svarer HVORFOR, ikke bare at det ikke kan lade sig gøre: serveren afviser
 * med den sætning skærmen viste.
 */
export function skjulerAlt(indstilling, harModulFn) {
  const tilbage = synligeDashboards(indstilling, harModulFn);
  if (tilbage.length) return null;
  return "Mindst ét dashboard skal være synligt. En bruger uden nogen " +
    "forside har ikke et system at logge ind på.";
}

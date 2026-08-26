/* src/fleet/navvisning.js
 * Hvilke arbejdsområder (topniveaupunkter i sidebaren) en bruger får VIST.
 * INGEN REACT — samme snit som dashboardvisning.js, som er den direkte
 * forlæg for filen her, og som filen bevidst efterligner felt for felt.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ DET ER EN VISNING, IKKE EN ADGANG — SKIVE 2B.
 *
 * Samme skel som dashboardvisning.js og modullisten i moduler.js:
 *
 *   To brugere med samme rolle og samme moduler kan se FORSKELLIGE
 *   topniveaupunkter, hvis en administrator har skjult noget for den ene —
 *   men det de BEGGE kan tilgå på serveren, er UÆNDRET af den forskel.
 *
 * ⚠ DEN ENDELIGE SYNLIGHED ER OG BLIVER ET "OG", ALDRIG ET "ELLER":
 *
 *     endeligSynlighed = eksisterendeNavAdgang && navvisningIkkeSkjult
 *
 * IKKE `eksisterendeNavAdgang || navvisningSynlig`. Navvisning kan derfor
 * KUN reducere hvad en bruger allerede ville se via `kraeverModul`/
 * `kraeverPerm` i nav.js — den kan aldrig tilføje et punkt, en rute, eller
 * en server-læsning. Det håndhæves ikke af en enkelt linje kode et sted;
 * det er selve ARKITEKTUREN her: denne fil kender intet til `moduler` eller
 * `perms` og kan derfor strukturelt ikke "give" noget — den kan kun svare
 * ja/nej til "er DETTE ene, allerede-tilladte punkt slået fra?". Den
 * FAKTISKE kombination med den eksisterende adgang sker i AppShell.jsx, som
 * kalder `erSkjultVedNavvisning()` som det SIDSTE filter i kæden — efter
 * `kraeverModul`/`kraeverPerm`, aldrig i stedet for dem.
 *
 * ⚠ DASHBOARD OG HJÆLP KAN IKKE SKJULES. De står med vilje IKKE i
 * `OMRAADER` nedenfor — ikke fordi de "altid er sat til true", men fordi
 * mekanismen slet ikke kender til dem. Et forsøg på at skrive en indstilling
 * for `dashboard` eller `support` bliver afvist af `valideNavvisning()` (og,
 * server-side, af `firebase.rules.json`s tilsvarende regex) som en UKENDT
 * nøgle — samme behandling som en direkte forkert streng. Se
 * "Et system uden forside er ikke et system" i moduler.js.
 *
 * ⚠ ET UKENDT OMRÅDE-NAVN ER IKKE ET FORBUD MOD AT VISE NOGET — det er
 * fraværet af et. `erSkjultVedNavvisning()` svarer `false` (dvs. "ikke
 * skjult") for ethvert navn der ikke står i `OMRAADER`, uanset hvad en
 * indstilling måtte indeholde. Det er den samme asymmetri som
 * dashboardvisning.js: mekanismen kan gøre en fejl i retning af at VISE for
 * meget af det brugeren alligevel ikke kan bruge, aldrig i retning af at
 * SKJULE noget den ikke skulle.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * De topniveauområder der kan skjules pr. bruger.
 *
 * ⚠ EN LILLE, EKSPLICIT LISTE — SAMME MØNSTER SOM `DASHBOARDS` I
 * dashboards.js, IKKE AFLEDT AF nav.js. Listen deles til functions/delt/
 * (se scripts/kopier-delt.mjs) og skal derfor være lukket under import; at
 * afhænge af `nav.js` ville trække routing/label-metadata ingen
 * Cloud Function har brug for ind i den delte overflade. Prisen er at
 * listen skal holdes ved lige i hånden, ligesom DASHBOARDS — en
 * `test/navvisning.test.mjs`-prøve holder den op mod de faktiske
 * konfigurerbare topniveaupunkter i `nav.js`, så et nyt/omdøbt punkt ikke
 * kan glide forbi ubemærket, sådan som det historisk er sket for
 * DASHBOARDS/dashboards.js (Korrektion 6, 02_TARGET_NAVIGATION.md).
 *
 * Nøglerne er nav.js's egne `key`-felter — samme identifikator begge
 * steder, så en admin-visning og AppShell's rendering aldrig kan tale om to
 * forskellige ting med samme navn.
 */
export const OMRAADER = [
  "kunderOversigt", "fakturacenter", "leverandoerer", "oekonomi",
  "booking", "flaade", "facility", "indkoeb", "warehouse", "unitbooking", "bemanding",
  "opsaetning",
];

/**
 * Er området skjult for brugeren via hans egen navvisning-indstilling?
 *
 * ⚠ KUN ET KENDT, KONFIGURERBART OMRÅDE KAN NOGENSINDE VÆRE SKJULT HER.
 * Et ukendt navn (herunder "dashboard" og "support", som med vilje ikke
 * står i OMRAADER) giver altid `false` — "ikke skjult af denne mekanisme".
 * Det er det der gør Dashboard og Hjælp strukturelt faste: der er ingen
 * kode-sti hvor denne funktion kan svare `true` for dem.
 *
 * ⚠ MANGLENDE INDSTILLING = IKKE SKJULT. Samme "standard er alt synligt,
 * kun et eksplicit false skjuler"-regel som dashboardvisning.js — det er
 * det der gør funktionen sikker at rulle ud: en bruger uden en
 * `navvisning`-post opfører sig præcis som før Skive 2B.
 */
export function erSkjultVedNavvisning(omraadeNoegle, indstilling) {
  if (!OMRAADER.includes(omraadeNoegle)) return false;
  if (!indstilling || typeof indstilling !== "object") return false;
  return indstilling[omraadeNoegle] === false;
}

/**
 * De områder AppShell skal vise, givet dem den EKSISTERENDE adgang allerede
 * tillader (`tilladte`) og brugerens egen indstilling.
 *
 * ⚠ TAGER `tilladte` IND UDEFRA — DENNE FUNKTION AFGØR IKKE ADGANG. Kalderen
 * (AppShell.jsx) har allerede filtreret `tilladte` på `kraeverModul`/
 * `kraeverPerm`; denne funktion kan kun fjerne flere af DEM, aldrig
 * tilføje et navn der ikke allerede var med. Det er selve "OG, ikke
 * ELLER"-garantien, skrevet som kode i stedet for kun som kommentar.
 */
export function synligeOmraader(tilladte, indstilling) {
  return tilladte.filter((noegle) => !erSkjultVedNavvisning(noegle, indstilling));
}

/**
 * valideNavvisning(indstilling) → { ok, fejl }
 *
 * Samme funktion i skærmen og på serveren (kopieres til functions/delt/,
 * se scripts/kopier-delt.mjs). Nøglerne skal være områder vi kender — en
 * ukendt nøgle ville være en indstilling for noget der ikke findes, og den
 * ville blive stående og se ud som om den betød noget.
 */
export function valideNavvisning(indstilling) {
  if (!indstilling || typeof indstilling !== "object" || Array.isArray(indstilling)) {
    return { ok: false, fejl: "Indstillingen skal være et opslag." };
  }
  const kendte = new Set(OMRAADER);
  const ukendte = Object.keys(indstilling).filter((k) => !kendte.has(k));
  if (ukendte.length) {
    return { ok: false, fejl: `Ukendte arbejdsområder: ${ukendte.join(", ")}.` };
  }
  const ikkeBool = Object.entries(indstilling).filter(([, v]) => typeof v !== "boolean");
  if (ikkeBool.length) {
    return { ok: false, fejl: "Hver værdi skal være sand eller falsk." };
  }
  return { ok: true, fejl: null };
}

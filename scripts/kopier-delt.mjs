/* scripts/kopier-delt.mjs
 * Kopierer den delte politik ind i functions/delt/.
 *
 * ⚠ HVORFOR EN KOPI OG IKKE EN IMPORT. Firebase deployer kun `functions/`-
 * mappen. En import op gennem træet (`../src/fleet/audit-regler.js`) virker
 * lokalt og fejler i skyen — og den fejler ved DEPLOY, ikke ved test, altså
 * på det dårligst mulige tidspunkt.
 *
 * ⚠ OG DERFOR ER KOPIEN FARLIG. To kopier der driver fra hinanden er den
 * fejl dette repo bliver ved med at betale for: Bil 104 med to nummerplader,
 * to demo-datasæt, to divisionsfiltre. Her ville driften betyde at klienten
 * filtrerer mod én allowliste og serveren mod en anden — og serveren vinder
 * i tavshed.
 *
 * Derfor to ting: filen kopieres MEKANISK (den redigeres aldrig i hånden), og
 * test/functions-delt.test.mjs fejler hvis de to ikke er byte-identiske.
 *
 * Koer: npm run delt:kopier   (kaldes også af regler:udrul og funktioner:udrul)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROD = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Filer der skal være ens i src/fleet og functions/delt. */
/* ⚠ REGLEN ER IKKE "IMPORTFRI" — DEN ER LUKKET UNDER IMPORT.
   En fil må kun stå her hvis ALT den importerer også står her. Firebase
   deployer kun functions/-mappen, så en import op gennem træet fejler i skyen
   — ved DEPLOY, ikke ved test.

   Listen begyndte med fire importfrie filer, og formuleringen fulgte med. Den
   holdt ikke: priser.js importerer beloeb.js, og det er netop derfor beloeb.js
   står her. Kravet er transitivt, ikke fraværet af imports.

   Tilføjer du en fil, så følg dens imports hele vejen ned. */
export const DELTE_FILER = [
  "audit-regler.js", "permissions.js", "moduler.js", "abonnement.js",
  /* ⚠ beloeb.js SKAL MED FØR priser.js KAN BRUGES SERVER-SIDE. Den funktion
     der fryser en faktureringsperiode, regner i øre — og gjorde den det med
     en afskrift, ville der være to afrundingsregler i ét repo. */
  "beloeb.js", "priser.js",
  /* ⚠ unitbooking.js SKAL MED, fordi kasseudlaanskriv er DEN ENESTE vej ind i
     kasseudlaan — noden er .write: false. Serveren skal proeve mod nøjagtig
     de samme regler som formularen viser brugeren: samme valideUdlaan(),
     samme kanSkifteUdlaan(), samme overlapsregel. Skrev serveren sin egen
     afskrift, ville skaermen sige ja og serveren nej, uden at nogen kunne se
     hvorfor. */
  "unitbooking.js",
  /* ⚠ warehouse.js SKAL MED, fordi bevaegelseskriv er DEN ENESTE vej ind i
     bevaegelser og beholdning — begge noder er .write: false. Serveren skal
     proeve mod noejagtig de samme regler som formularen viser brugeren:
     samme valideBevaegelse(), samme virkningPaaBeholdning(), samme skala. */
  "warehouse.js",
  /* ⚠ warehouse.js IMPORTERER prioritet.js, OG SAA SKAL DEN MED. Reglen er
     ikke "importfri" — den er LUKKET UNDER IMPORT, og prioritet.js er det
     tredje eksempel efter beloeb.js og booking-state.js. Kataloget deles
     desuden af Fleets opgaver og indberetninger, saa den funktion der
     validerer en opgave, proever mod noejagtig de tre trin skaermen viste. */
  "prioritet.js",
  /* ⚠ DE TO HER ER IKKE IMPORTFRIE, og de er beviset på at reglen ovenfor er
     transitiv. booking-state.js importerer permissions.js; grundlag.js
     importerer booking-state.js og beloeb.js. Alle tre står på listen.

     De skal med, fordi den funktion der skriver et fakturagrundlag, skal
     prøve mod NØJAGTIG de samme regler som skærmen viser: samme
     kanGodkende(), samme kanEksportere(), samme nummerformat. Skrev serveren
     sin egen afskrift, ville skærmen sige ja og serveren nej — og et
     regnskabsdokument er det værste sted at have to meninger. */
  "booking-state.js", "grundlag.js",
  /* ⚠ DE FEM DISPONERINGSTJEK OG DERES TRANSITIVE LUKNING.
     `etapeskift` er DEN ENESTE vej ind i `etaper` og `reservationer` — begge
     noder er `.write: false` — og de fem tjek skal HÅNDHÆVES dér frem for at
     blive vist i skærmen. Ligger de kun i skærmen, kan et direkte kald gå
     uden om dem, og så er de dekoration.

     `disponering.js` samler dem; den importerer flaade.js, personale.js,
     reservations.js, koerehviletid.js og format.js — og personale.js
     importerer selv format.js. Alle seks står derfor her. Reglen er
     TRANSITIV, ikke "importfri". */
  /* ⚠ opgaver.js OG opgaveplan-regler.js HØRER SAMMEN, og de kom med
     "Planlæg aktivitet". Funktionen `opgaveplanlaeg` skriver opgaven og dens
     reservation i EEN update(), og den skal proeve mod noejagtig de samme
     regler som formularen viste:

       opgaveMangler()        nodens eget katalog
       reservationFraOpgave() reservationen, bygget eet sted
       valideOpgaveplan()     hvert felt, med SKAERMENS sætning

     Skrev serveren sin egen afskrift, ville skaermen sige ja og serveren nej
     uden at nogen kunne se hvorfor — og en klientvalidering der ikke ogsaa
     staar paa serveren, er en paen knap.

     opgaver.js importerer prioritet.js, som allerede staar paa listen:
     kravet er transitivt. */
  "opgaver.js", "opgaveplan-regler.js",
  /* ⚠ dashboardvisning.js IMPORTERER dashboards.js — listen er lukket under
     import. dashboardvisningskriv proever mod noejagtig de samme regler som
     skaermen viste: samme valideVisning(), samme skjulerAlt(). */
  "dashboards.js", "dashboardvisning.js",
  "flaade.js", "personale.js", "reservations.js", "koerehviletid.js",
  "format.js", "etaper.js", "disponering.js",
  /* ⚠ KPI-aggregeringen er REN — den kender ingen database, saa hele
     regnestykket kan proeves uden en emulator. Jobbet henter noderne og
     kalder den.

     Den stod her ALENE og importfri. Den er den ikke laengere: indkoebets
     noegletal skal regnes med NOEJAGTIG samme leveringspraecision() og
     indkoebBeloebOere() som Indkoeb-skaermene bruger, og de staar i
     leverandoerer.js. En afskrift ville betyde at kortet og noden kunne
     blive uenige om hvad "til tiden" er.

     leverandoerer.js importerer selv format.js — som staar paa listen i
     forvejen. Lukningen holder. */
  "kpi-aggregering.js", "leverandoerer.js",
];

export const kildeSti = (navn) => join(ROD, "src", "fleet", navn);
export const kopiSti = (navn) => join(ROD, "functions", "delt", navn);

/* Hovedet navngiver SIN EGEN kilde. Stod der ét fast filnavn, ville den næste
   delte fil bære en henvisning til en anden — og den der læser den, ville
   rette i det forkerte sted. */
const advarsel = (navn) =>
  "/* ⚠ KOPI — REDIGÉR IKKE HER.\n" +
  ` * Kilden er src/fleet/${navn}. Filen lægges af\n` +
  " * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.\n" +
  " * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.\n" +
  " */\n";

/** Selve kopien, uden advarselshovedet — det er dét der sammenlignes. */
export function kropAf(tekst) {
  return tekst.startsWith("/* ⚠ KOPI")
    ? tekst.slice(tekst.indexOf("*/\n") + 3)
    : tekst;
}

export function kopier() {
  const maalmappe = join(ROD, "functions", "delt");
  if (!existsSync(maalmappe)) mkdirSync(maalmappe, { recursive: true });

  const gjort = [];
  for (const navn of DELTE_FILER) {
    const kilde = readFileSync(kildeSti(navn), "utf8");
    writeFileSync(kopiSti(navn), advarsel(navn) + kilde, "utf8");
    gjort.push(navn);
  }
  return gjort;
}

/* Kun når scriptet køres direkte — så testen kan importere uden at skrive. */
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const gjort = kopier();
  console.log(`Kopieret til functions/delt/: ${gjort.join(", ")}`);
}

/* scripts/provisioner-dev.mjs
 * Provisionerer DEV: tenant-markør, brugere med claims, og demo-data.
 *
 * ⚠ HVORFOR SCRIPTET FINDES: claims-kæden var helt uprøvet i browseren.
 * Tenant-isolationen hviler på custom JWT claims, og kæden — bruger oprettes
 * → claims sættes → token fornys → reglerne læser dem — var kun afprøvet i
 * emulatoren, hvor man kan minte et token med hvilke claims man vil. Det er
 * nyttigt til reglerne, men det springer netop det led over hvor fejlene
 * sidder. Se beslutning 27.
 *
 * ⚠ REGLERNE KRÆVER tenants/<id>/_findes PÅ HVER ENESTE LÆSNING.
 * Uden markøren afviser hver regel alt, og en indlogget bruger ville se
 * "afvist" på hver eneste skærm. Det er trin 1 af en grund.
 *
 * Kør:
 *   node scripts/provisioner-dev.mjs
 *
 * Kræver en servicekontonøgle til DEV i .serviceaccount-dev.json (gitignored,
 * hentes i Firebase-konsollen under Projektindstillinger → Tjenestekonti) og
 * VITE_DEV_BRUGER_KODE i .env.local.
 */
import { readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { DEV_BRUGERE, DEV_TENANT, claimsFor, ejerkonto } from "../src/fleet/dev-brugere.js";
import {
  DEMO_KASSETYPER, DEMO_KASSER, DEMO_KASSEUDLAAN,
} from "../src/fleet/demo-turtlebooking.js"
import {
  DEMO_REOLPLADSER, DEMO_VARER, DEMO_BEHOLDNING, DEMO_CARRIERS, DEMO_ENHEDER,
} from "../src/fleet/demo-lager.js";
import { DEMO_OMKOSTNINGER } from "../src/fleet/demo-omkostninger.js";
import { DEMO_GRUNDLAG } from "../src/fleet/demo-grundlag.js";
import { DEMO_ETAPER } from "../src/fleet/demo-etaper.js";
import { DEMO_OPGAVER } from "../src/fleet/demo-opgaver.js";
import {
  DEMO_INDKOEBSLINJER, DEMO_FAKTURAER, DEMO_LEVERANDOERER,
} from "../src/fleet/demo-indkoeb.js";
import {
  DEMO_LOKATIONER, DEMO_AKTIVER, DEMO_ZONER, DEMO_SENSORER, DEMO_FEJL,
  DEMO_BYGNINGSOMKOSTNING,
} from "../src/fleet/demo-facility.js";
import { reservationerFraEtape } from "../src/fleet/etaper.js";
import { sammenlignRegler, rapport, REGELFIL } from "./tjek-regler.mjs";

import { DEMO_KPI } from "../src/fleet/demo-kpi.js";
import { DEMO_KOERETOEJER } from "../src/fleet/demo-flaade.js";
import { DEMO_PERSONALE, DEMO_KOMPETENCER } from "../src/fleet/demo-personale.js";
import { DEMO_KUNDER } from "../src/fleet/demo-kunder.js";
import { DEMO_FRAVAER, DEMO_FRAVAER_SENSITIVE } from "../src/fleet/demo-fravaer.js";

/* ------------------------------------------------------------------ *
 * Spærringen
 * ------------------------------------------------------------------ */

export const NOEGLEFIL = ".serviceaccount-dev.json";

export const DEV_PROJEKT = "fleetcontrol-dev-1ac1c";
export const PROD_PROJEKT = "fleetcontrol-98e11";

/**
 * ⚠ IKKE KONFIGURERBAR, OG DET ER MENINGEN.
 *
 * Samme begrundelse som loftet i beslutning 24: en spærring der kan hæves af
 * den der rammer den, er ingen spærring. Et seed-script der kan pege på
 * produktion, skriver testdata i rigtige kunders base — og det opdages først
 * når en kunde ringer.
 *
 * Der er derfor hverken et flag, en miljøvariabel eller et --force.
 */
export function tjekProjekt(projektId) {
  if (projektId === DEV_PROJEKT) return;
  if (projektId === PROD_PROJEKT) {
    throw new Error(
      "AFBRUDT: nøglen peger på PRODUKTION (" + PROD_PROJEKT + ").\n" +
      "Scriptet skriver testdata og opretter brugere. Det må aldrig ramme " +
      "rigtige kunders base.\nDer er ingen måde at tvinge det igennem — brug " +
      "en DEV-servicekonto."
    );
  }
  throw new Error(
    `AFBRUDT: ukendt projekt "${projektId}". Scriptet kører kun mod ${DEV_PROJEKT}.`
  );
}

/**
 * ⚠ NØGLEFILEN SKAL VÆRE GITIGNORERET, FØR SCRIPTET RØRER NOGET.
 *
 * Nøglen giver **fuld admin** på DEV-databasen — den går uden om alle regler
 * i firebase.rules.json. En committet servicekontonøgle er ikke en fejl man
 * retter ved at slette filen bagefter; den ligger i historikken.
 *
 * Filnavnet er ikke et almindeligt mønster, og Firebase døber selv den
 * downloadede fil noget i retning af
 * `fleetcontrol-dev-1ac1c-firebase-adminsdk-x7k2p-9f3a1b2c4d.json`. Den der
 * lige har hentet den, omdøber den ikke først. Derfor tjekkes det maskinelt
 * frem for at stå i README — samme valg som produktionsspærringen ovenfor.
 *
 * Ren funktion, så beslutningen kan prøves uden at kalde git.
 *
 * @param kode exit-koden fra `git check-ignore -q <fil>`
 */
export function vurderIgnorering(kode) {
  if (kode === 0) return { ok: true };
  if (kode === 1) {
    return {
      ok: false,
      besked:
        "AFBRUDT: .serviceaccount-dev.json er IKKE dækket af .gitignore.\n" +
        "Nøglen giver fuld admin på DEV-databasen og går uden om alle regler.\n" +
        "Committes den, ligger den i historikken — det retter man ikke ved at\n" +
        "slette filen bagefter.\n" +
        "Tilføj den til .gitignore, og kør igen.",
    };
  }
  /* 128 = ikke et git-repo, eller git findes ikke. Vi ved det ikke, og en
     vagt der gætter, blokerer det forkerte. Kør videre, men sig det. */
  return { ok: true, advarsel: "kunne ikke spørge git, om nøglefilen er ignoreret" };
}

/**
 * Oversæt Firebases Auth-fejl til noget der siger hvad man skal gøre.
 *
 * ⚠ auth/configuration-not-found LYDER som en fejl i nøglen eller i koden.
 * Det er den ikke: den betyder at Authentication aldrig er taget i brug i
 * projektet, eller at Email/adgangskode ikke er slået til som loginmetode.
 * Rå lyder den "There is no configuration corresponding to the provided
 * identifier", og så leder man i servicekontoen og i sin egen kode — ikke i
 * konsollen, hvor knappen sidder.
 *
 * Ren funktion, så oversættelsen kan prøves uden at kalde Firebase.
 */
export function forklarAuthFejl(kode) {
  if (kode === "auth/configuration-not-found") {
    return (
      "Authentication er ikke taget i brug i projektet, eller Email/adgangskode " +
      "er ikke slået til.\n\n" +
      "  Firebase-konsollen → " + DEV_PROJEKT + " → Authentication\n" +
      "  → Kom godt i gang (hvis knappen er der)\n" +
      "  → Sign-in method → Email/Password → Aktivér → Gem\n\n" +
      "Kør derefter npm run provisioner:dev igen. Scriptet kan køres flere " +
      "gange — det opdaterer de konti der allerede findes."
    );
  }
  if (kode === "auth/insufficient-permission" || kode === "auth/invalid-credential") {
    return (
      "Servicekontoen har ikke rettigheder nok til at oprette brugere.\n" +
      "Hent en ny privat nøgle, eller giv kontoen rollen Firebase Authentication Admin."
    );
  }
  if (kode === "auth/invalid-password") {
    return "VITE_DEV_BRUGER_KODE er for kort. Firebase kræver mindst 6 tegn.";
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Hvad der seedes
 * ------------------------------------------------------------------ */

/**
 * Node → datasæt. En tabel, ikke kode pr. node: en ny node er én linje.
 *
 * Kun de noder skærmene FAKTISK læser i dag gennem useListe()/useKpi().
 * De øvrige datasæt i fleet/demo-*.js seedes ikke endnu — et seedet datasæt
 * ingen skærm rører, driver fra sin kilde uden at nogen ser det.
 */
export const SEED = [
  { node: "kpi/gods/current", data: DEMO_KPI.gods, form: "objekt" },
  { node: "kpi/bus/current", data: DEMO_KPI.bus, form: "objekt" },
  { node: "koeretoejer", data: DEMO_KOERETOEJER, form: "liste" },
  { node: "personale", data: DEMO_PERSONALE, form: "liste" },
  { node: "kompetencer", data: DEMO_KOMPETENCER, form: "liste" },
  { node: "kunder", data: DEMO_KUNDER, form: "liste" },
  /* ⚠ OMKOSTNINGER, IKKE PRISER. Satsarket stod som en const i
     Bookingopsaetning.jsx indtil PRISER.md etape 5; uden det her seed ville
     skaermen staa tom i dev, og eksempelberegningen ville vise "ingen sats". */
  { node: "omkostninger", data: DEMO_OMKOSTNINGER, form: "liste" },
  /* ⚠ GRUNDLAGET ER .write: false FOR ALLE, ogsaa admin — som beholdning og
     kasseudlaan. Provisioneringen koerer paa admin-SDK og gaar uden om
     reglerne; uden det her seed ville Fakturering staa tom i dev, og saa
     ville ingen opdage at skaermen nu laeser en rigtig node. */
  { node: "grundlag", data: DEMO_GRUNDLAG, form: "liste" },
  /* ⚠ ETAPERNE SKAL MED. Noden er .write: false som grundlaget, og
     provisioneringen gaar uden om reglerne. Uden dem staar Disponerings
     ugesvisning tom i dev — og saa ville ingen opdage at etapeskift ikke kan
     kaldes. */
  { node: "etaper", data: DEMO_ETAPER, form: "liste" },
  /* ⚠ OPGAVERNE HAR HAFT REGLER OG INGEN DATA. Noden er skrivbar med
     opgaver.skriv og har et indeks — men intet seedede den, og ingen skaerm
     forespurgte paa den, saa den stod tom uden at nogen saa det. Det holdt
     11 KPI-felter paa null. Samme form som etaper foer de blev seedet. */
  { node: "opgaver", data: DEMO_OPGAVER, form: "liste" },
  /* ⚠ INDKOEB HAVDE OGSAA REGLER OG INGEN DATA — og den havde mest af det:
     et indeks, en validering af hver eneste feltform og en kommentar om
     hvorfor prisen er hele oere. Alt sammen om en node der var tom. Den holdt
     9 af de 13 indkoebsfelter paa null.

     ⚠ FAKTURAERNE SKAL MED I SAMME OMBAERING. Et indkoeb uden sin faktura er
     kun den halve historie: fakturaerTilGodkendelse og ikkeLinkedeFakturaer
     kan ikke regnes af linjerne alene. Noden er .write: false for enhver
     klient — provisioneringen koerer paa admin-SDK og gaar uden om reglerne,
     praecis som ved grundlag og etaper. */
  /* ⚠ LEVERANDOEREN FOERST — indkoeb.leverandoerId og fakturaer.leverandoerId
     slaar nu op i leverandoerer/. Provisioneringen koerer paa admin-SDK og
     gaar uden om reglerne, saa raekkefoelgen her aendrer ingenting for
     SEEDET — men den aendrer alt for den der laeser filen og tror at en
     indkoebslinje kan staa alene.

     ⚠ PRISLISTEN LIGGER PAA POSTEN, som et BARN. Den er en liste af poster
     med hver sit id, og somNode() noegler kun det yderste niveau — derfor
     oversaettes den for sig i sammeNode() nedenfor. RTDB har ingen arrays:
     lagde vi den raa, ville den blive et objekt med noeglerne "0","1","2",
     og de noegler flytter sig naar en post fjernes. */
  { node: "leverandoerer", data: DEMO_LEVERANDOERER, form: "liste-med-boern",
    boern: ["prisliste"] },
  { node: "indkoeb", data: DEMO_INDKOEBSLINJER, form: "liste" },
  { node: "fakturaer", data: DEMO_FAKTURAER, form: "liste" },
  /* ⚠ FACILITY HELE VEJEN NU. Lokationerne kom foerst, fordi indkoebets
     lokationId slaar op i dem — resten fulgte, og raekkefoelgen er ikke
     kosmetik: aktiver.lokationId, zoner.lokationId, fejl.aktivId og
     aktiver.ansvarligPersonId slaar ALLE op. Provisioneringen koerer paa
     admin-SDK og gaar uden om reglerne, saa den ville ikke selv opdage en
     brudt reference — men naeste gang en bruger gemte posten, ville den
     blive afvist. En seedet post der ikke kan gemmes igen, er en faelde man
     foerst falder i naar man retter en tastefejl.

     ⚠ OG FACILITY LAASER FAERRE KPI-FELTER OP END VENTET. Aktiver, fejl og
     lokationer baerer ALLE division: false i reglerne — feltet er FORBUDT,
     ikke bare fravaerende. Facility-tallene rammer derfor samme spaerring som
     flaaden: se noten i kpi-aggregering.js. */
  { node: "facility/lokationer", data: DEMO_LOKATIONER, form: "liste" },
  { node: "facility/aktiver", data: DEMO_AKTIVER, form: "liste" },
  { node: "facility/zoner", data: DEMO_ZONER, form: "liste" },
  { node: "facility/fejl", data: DEMO_FEJL, form: "liste" },
  /* Allerede paa nodeform: sensorerne er noeglet paa ZONEN, ikke paa et
     sensor-id. En zone har én maaling ad gangen, og et id mere ville vaere et
     led ingen slaar op i. */
  { node: "facility/sensorer", data: DEMO_SENSORER, form: "objekt" },
  /* ⚠ KOMPONENTER, IKKE EN TOTAL. bygningsomkostningOere() summerer dem hos
     forbrugeren; et gemt totalfelt kunne drive fra sine egne komponenter. */
  { node: "facility/omkostning", data: DEMO_BYGNINGSOMKOSTNING, form: "objekt" },
  { node: "fravaer", data: DEMO_FRAVAER, form: "liste" },
  /* Allerede på nodeform — demo-fravaer.js gemmer den bevidst sådan, fordi
     `art` ligger i sensitive/ og ikke på posten. Se filens egen note. */
  { node: "sensitive/fravaer", data: DEMO_FRAVAER_SENSITIVE, form: "objekt" },
  /* ⚠ TURTLEBOOKING SEEDES OGSAA, og kasseudlaan er med selv om noden er
     .write: false for enhver klient. Provisioneringen kører på admin-SDK og
     går uden om reglerne — det er netop det den er til for. Uden udlånene
     ville Udlån-skærmen stå tom i dev, og så ville ingen opdage at
     kasseudlaanskriv ikke kan kaldes. */
  { node: "kassetyper", data: DEMO_KASSETYPER, form: "liste" },
  { node: "reolpladser", data: DEMO_REOLPLADSER, form: "liste" },
  { node: "kasser", data: DEMO_KASSER, form: "liste" },
  { node: "kasseudlaan", data: DEMO_KASSEUDLAAN, form: "liste" },
  /* Warehouse. ⚠ beholdning seedes selv om noden er .write: false for enhver
     klient — provisioneringen koerer paa admin-SDK og gaar uden om reglerne.
     Uden den ville Varer- og Lokationer-skaermene staa med tomme kolonner i
     dev, og saa ville ingen opdage at summen ikke blev regnet. */
  { node: "varer", data: DEMO_VARER, form: "liste" },
  { node: "beholdning", data: DEMO_BEHOLDNING, form: "liste" },
  /* ⚠ CARRIERNE SKAL MED, ELLERS SER HYLDERNE FRIERE UD I DEV END DE ER.
     Belægningen tæller nu beholdning, kasser OG carriers; uden det sidste
     sæt ville dev vise den fejl skærmen lige er holdt op med at lave. */
  { node: "carriers", data: DEMO_CARRIERS, form: "liste" },
  /* ⚠ ENHEDERNE SKAL MED, OG DE SKAL STEMME MED BEHOLDNINGEN. Noden er
     .write: false som beholdningen; provisioneringen gaar uden om reglerne.
     Uden dem ville Sporbarhed vise nul enheder OG en afvigelse paa hver
     serie-sporet vare i dev — en uenighed vi selv havde lavet. Selvkontrollen
     i demo-lager.js fanger det, hvis de to saet driver fra hinanden. */
  { node: "enheder", data: DEMO_ENHEDER, form: "liste" },
];

/**
 * useListe læser rækker som `{ id: barn.key, ...barn.val() }` — id'et kommer
 * fra NØGLEN. Derfor nøgles der på id, og id'et fjernes fra værdien: to
 * kilder til samme felt er præcis den slags der kan nå at blive uenige.
 */
export function somNode(raekker) {
  const ud = {};
  for (const { id, ...resten } of raekker) {
    if (!id) throw new Error("somNode: en række uden id kan ikke nøgles.");
    if (ud[id]) throw new Error(`somNode: id "${id}" optræder to gange.`);
    ud[id] = resten;
  }
  return ud;
}

/**
 * Som somNode(), men hvor NAVNGIVNE børn selv er lister der skal nøgles.
 *
 * ⚠ RTDB HAR INGEN ARRAYS. En array skrevet råt bliver til et objekt med
 * nøglerne "0", "1", "2" — og de nøgler FLYTTER SIG når en post fjernes.
 * En prisliste hvor pl-olie-2 pludselig hedder "1", er en prishistorik hvor
 * ingen reference holder. Barnet nøgles derfor på sit eget id, som alt andet.
 */
export function sammeNode(raekker, boern = []) {
  const ud = somNode(raekker);
  for (const post of Object.values(ud)) {
    for (const barn of boern) {
      if (Array.isArray(post[barn])) post[barn] = somNode(post[barn]);
    }
  }
  return ud;
}

/* ------------------------------------------------------------------ *
 * Kørslen
 * ------------------------------------------------------------------ */

export function laesKode() {
  const kode = process.env.VITE_DEV_BRUGER_KODE || laesFraEnvLocal("VITE_DEV_BRUGER_KODE");
  if (!kode) {
    throw new Error(
      "AFBRUDT: VITE_DEV_BRUGER_KODE mangler.\n" +
      "Sæt den i .env.local (gitignored). Alle seks DEV-konti deler den, og " +
      "brugervælgeren bruger den til at skifte session."
    );
  }
  if (kode.length < 8) throw new Error("AFBRUDT: VITE_DEV_BRUGER_KODE skal være mindst 8 tegn.");
  return kode;
}

export function laesFraEnvLocal(navn) {
  try {
    const linje = readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${navn}=`));
    return linje ? linje.slice(navn.length + 1).trim() : null;
  } catch {
    return null;
  }
}

/**
 * Ligner en af filerne i roden den nøgle vi leder efter?
 *
 * ⚠ WINDOWS SKJULER KENDTE FILTYPENAVNE. Omdøber man i Stifinder, hedder
 * filen `.serviceaccount-dev.json.json` uden at man kan se det, og scriptet
 * ville bare sige "mangler" — så leder man efter en fil man kan SE ligger der.
 * Det er den mest almindelige måde dette skridt går galt på.
 *
 * Den anden er slet ikke at omdøbe: Firebase kalder den downloadede fil noget
 * i retning af `fleetcontrol-dev-1ac1c-firebase-adminsdk-x7k2p-9f3a1b2c4d.json`.
 *
 * Ren funktion, så den kan prøves uden et filsystem.
 */
export function foreslaaNoeglefil(filnavne) {
  return filnavne.filter(
    (f) =>
      f !== NOEGLEFIL &&
      (/firebase-adminsdk/i.test(f) || /serviceaccount/i.test(f) || /\.json\.json$/i.test(f))
  );
}

export function laesNoegle() {
  try {
    return JSON.parse(readFileSync(NOEGLEFIL, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") {
      let kandidater = [];
      try { kandidater = foreslaaNoeglefil(readdirSync(".")); } catch { /* ligegyldigt */ }

      throw new Error(
        `AFBRUDT: ${NOEGLEFIL} mangler.\n` +
        (kandidater.length
          ? "\nMen der ligger noget der ligner:\n" +
            kandidater.map((f) => `  ${f}`).join("\n") +
            `\n\nOmdøb til ${NOEGLEFIL} — fra terminalen, ikke i Stifinder:\n` +
            `  mv "${kandidater[0]}" ${NOEGLEFIL}\n` +
            "Stifinder skjuler kendte filtypenavne, så en omdøbning dér kan give\n" +
            "et usynligt ekstra .json til sidst.\n"
          : "\nHent den i Firebase-konsollen for fleetcontrol-dev-1ac1c under\n" +
            "Projektindstillinger → Tjenestekonti → Generer ny privat nøgle,\n" +
            "og læg den i projektets rod.\n") +
        "\nFilen er gitignored — den må aldrig committes."
      );
    }
    throw new Error(`AFBRUDT: ${NOEGLEFIL} kunne ikke læses som JSON.\n${e.message}`);
  }
}

async function main() {
  /* Rækkefølgen er ikke tilfældig: begge spærringer skal have svaret, før
     der oprettes en bruger eller skrives en byte. */
  const ignorering = vurderIgnorering(
    spawnSync("git", ["check-ignore", "-q", NOEGLEFIL], { stdio: "ignore" }).status ?? 128
  );
  if (!ignorering.ok) throw new Error(ignorering.besked);
  if (ignorering.advarsel) console.warn(`  ! ${ignorering.advarsel}\n`);

  const noegle = laesNoegle();
  tjekProjekt(noegle.project_id);
  const kode = laesKode();

  /* Importeres først her. Så kan tjekProjekt() og somNode() prøves uden at
     firebase-admin overhovedet indlæses. */
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  const { getDatabase } = await import("firebase-admin/database");

  const app = initializeApp({
    credential: cert(noegle),
    databaseURL: `https://${DEV_PROJEKT}-default-rtdb.europe-west1.firebasedatabase.app`,
  });
  const auth = getAuth(app);
  const db = getDatabase(app);

  console.log(`Provisionerer ${noegle.project_id}, tenant "${DEV_TENANT}".\n`);

  /* 1. Tenant-markøren. Uden den afviser hver regel alt. */
  await db.ref(`tenants/${DEV_TENANT}/_findes`).set(true);
  console.log("  _findes            sat");

  /* 2. Brugere og claims. Ejerkontoen — hvis der er sat en — provisioneres
     ad NØJAGTIG samme vej som de seks. Ingen bagdør: en adgang der kommer et
     andet sted fra end alle andres, er den der bliver glemt når rettighederne
     skal gennemgås. */
  const ejer = ejerkonto(process.env.VITE_DEV_EJER_MAIL || laesFraEnvLocal("VITE_DEV_EJER_MAIL"));
  for (const b of ejer ? [...DEV_BRUGERE, ejer] : DEV_BRUGERE) {
    let bruger;
    try {
      bruger = await auth.getUserByEmail(b.email);
      await auth.updateUser(bruger.uid, { password: kode, displayName: b.navn });
    } catch (e) {
      if (e.code !== "auth/user-not-found") throw e;
      bruger = await auth.createUser({ email: b.email, password: kode, displayName: b.navn });
    }
    await auth.setCustomUserClaims(bruger.uid, claimsFor(b.rolle, DEV_TENANT));

    /* Uden det beholder en allerede indlogget session sine GAMLE claims,
       indtil tokenet udløber af sig selv. Man ville tro man havde ændret
       adgangen, og den gamle ville stadig virke — den værste fejltilstand,
       fordi den ser ud som om den lykkedes. Se ARKITEKTUR om rolleskift. */
    await auth.revokeRefreshTokens(bruger.uid);
    console.log(`  ${b.rolle.padEnd(18)} ${b.email}`);
  }

  /* 3. Demo-data under de noder skærmene faktisk læser. */
  console.log("");
  for (const { node, data, form, boern } of SEED) {
    const nyttelast = form === "liste-med-boern"
      ? sammeNode(data, boern)
      : form === "liste" ? somNode(data) : data;
    await db.ref(`tenants/${DEV_TENANT}/${node}`).set(nyttelast);
    const antal = form === "objekt" ? "objekt" : `${data.length} rækker`;
    console.log(`  ${node.padEnd(24)} ${antal}`);
  }

  /* ══════════════════════════════════════════════════════════════════════
     ⚠ EN RESERVERET ETAPE HAR RESERVATIONER — OG DE ER IKKE ET DATASÆT.

     `reservationer` står ikke i SEED, fordi den ikke er en liste af poster:
     den er UDLEDT af etaperne, med `reservationerFraEtape()` — den samme
     funktion `etapeskift` bruger. To udgaver ville betyde at dev viste et
     lager der var reserveret på én måde og produktion på en anden.

     Uden dem ser hver eneste bil FRI ud i dev: reservationerne skrives kun af
     `etapeskift`, og et seed der springer dem over, springer dem over for
     altid. Så kan konflikttjekket ikke ses virke — og en probe der godkendte
     to ture på samme chauffør, ville se ud som en fejl i tjekket frem for i
     dataene. Det er nøjagtig hvad der skete.
     ══════════════════════════════════════════════════════════════════════ */
  const BUNDET = ["reserveret", "udfoert"];
  const reservationer = {};
  let antalResv = 0;
  for (const e of DEMO_ETAPER) {
    if (!BUNDET.includes(e.tilstand)) continue;
    for (const [i, r] of reservationerFraEtape(e).entries()) {
      reservationer[r.ressourceType] ??= {};
      reservationer[r.ressourceType][r.ressourceId] ??= {};
      reservationer[r.ressourceType][r.ressourceId][`res-${e.id}-${i}`] = {
        fra: r.fra, til: r.til, kilde: r.kilde,
        oprettetAf: "provisioner", oprettetMs: Date.now(),
      };
      antalResv += 1;
    }
  }
  await db.ref(`tenants/${DEV_TENANT}/reservationer`).set(reservationer);
  console.log(`  ${"reservationer".padEnd(24)} ${antalResv} (udledt af etaperne)`);

  /* 4. Håndhæver databasen den regelfil vi lige har prøvet 591 gange?
     Provisionering er det øjeblik hvor man sætter et miljø op — og det var
     netop dér hullet stod ubemærket i månedsvis. Se beslutning 29.
     Advarer, afbryder ikke: dataene ER seedet, og en exit-kode her ville
     ligne at provisioneringen mislykkedes. */
  const token = await app.options.credential.getAccessToken();
  const svar = await fetch(
    `https://${noegle.project_id}-default-rtdb.europe-west1.firebasedatabase.app` +
    `/.settings/rules.json?access_token=${token.access_token}`
  );
  if (svar.ok) {
    const r = sammenlignRegler(readFileSync(REGELFIL, "utf8"), await svar.text());
    if (!r.ens) {
      console.warn(`\n⚠ ${rapport(r, noegle.project_id)}\n`);
    }
  }

  console.log(`\nFærdig. Log ind med en af adresserne ovenfor.`);
  await app.delete();
}

/* Kun når filen KØRES. Prøverne importerer den for tjekProjekt og somNode,
   og de skal ikke provisionere noget som helst. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    const forklaring = forklarAuthFejl(e?.code);
    console.error(`\n${forklaring ? `AFBRUDT: ${forklaring}` : e.message}\n`);
    process.exit(1);
  });
}

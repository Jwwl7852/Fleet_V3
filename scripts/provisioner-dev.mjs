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
 *   node scripts/provisioner-dev.mjs                  → tenanten "demo"
 *   node scripts/provisioner-dev.mjs --tenant=nordvest → en RIGTIG kunde
 *
 * ⚠ MED --tenant OPRETTES DER INGEN BRUGERE. DEV-brugerne hører til
 * dev-tenanten; en kundes tenant skal ikke pludselig have syv konti med
 * kendte adgangskoder, fordi nogen ville se data på en skærm.
 *
 * ⚠ OG SEEDET FØLGER KUNDENS MODULER. En kunde uden Booking skal ikke have
 * bookinger — noden ville være ulæselig for ham (modulklausulen i reglerne),
 * så tallene ville regnes af data ingen kan se. Hvilket modul en node hører
 * til, LÆSES UD AF REGELFILEN og står ikke i en liste her: en liste nummer to
 * driver, og det er hele grunden til at nodelisten i rules.tenant.test.mjs
 * også læses derfra.
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
} from "../src/fleet/demo-unitbooking.js"
import {
  DEMO_REOLPLADSER, DEMO_VARER, DEMO_BEHOLDNING, DEMO_CARRIERS, DEMO_ENHEDER,
} from "../src/fleet/demo-lager.js";
import { DEMO_OMKOSTNINGER, DEMO_LAGRE } from "../src/fleet/demo-omkostninger.js";
import { DEMO_GRUNDLAG } from "../src/fleet/demo-grundlag.js";
import { DEMO_ETAPER } from "../src/fleet/demo-etaper.js";
import { DEMO_BOOKINGER } from "../src/fleet/demo-bookinger.js";
import { DEMO_OPGAVER } from "../src/fleet/demo-opgaver.js";
import {
  DEMO_INDBERETNINGER, DEMO_INDBERETNINGER_SENSITIVE,
} from "../src/fleet/demo-indberetninger.js";
import {
  DEMO_INDKOEBSLINJER, DEMO_FAKTURAER, DEMO_LEVERANDOERER,
} from "../src/fleet/demo-indkoeb.js";
import {
  DEMO_INDKOEBSBEHOV, DEMO_INDKOEBSORDRER, DEMO_GODKENDELSESREGLER,
} from "../src/fleet/demo-procure.js";
import {
  DEMO_FORBRUGSVARER, DEMO_FORBRUGSVAREBEVAEGELSER,
} from "../src/fleet/demo-forbrugsvarer.js";
import { ORDRESERIE, ORDRE_PRAEFIKS } from "../src/fleet/procure.js";
import {
  DEMO_LOKATIONER, DEMO_AKTIVER, DEMO_ZONER, DEMO_SENSORER, DEMO_FEJL,
  DEMO_BYGNINGSOMKOSTNING,
} from "../src/fleet/demo-facility.js";
import { reservationerFraEtape } from "../src/fleet/etaper.js";
import { reservationFraFravaer } from "../src/fleet/fravaer.js";
import { reservationFraOpgave } from "../src/fleet/opgaver.js";
import { sammenlignRegler, rapport, REGELFIL } from "./tjek-regler.mjs";

import { beregnKpi } from "../src/fleet/kpi-aggregering.js";
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
  { node: "koeretoejer", data: DEMO_KOERETOEJER, form: "liste" },
  { node: "personale", data: DEMO_PERSONALE, form: "liste" },
  { node: "kompetencer", data: DEMO_KOMPETENCER, form: "liste" },
  { node: "kunder", data: DEMO_KUNDER, form: "liste" },
  /* ⚠ OMKOSTNINGER, IKKE PRISER. Satsarket stod som en const i
     Bookingopsaetning.jsx indtil PRISER.md etape 5; uden det her seed ville
     skaermen staa tom i dev, og eksempelberegningen ville vise "ingen sats". */
  { node: "omkostninger", data: DEMO_OMKOSTNINGER, form: "liste" },
  /* ⚠ LAGRENE VAR DEN SIDSTE NODE UDEN DATA — og tomheden var ikke
     harmloes. omkostningsark() byggede slet ikke `lagre`, og
     beregnForloeb() slaar op i satsark.lagre[lagerId]: hvert lagerophold
     ramte undefined og blev sprunget over i TAVSHED. Fem doegn gav 0 oere
     og estimeret: false. Se test/pricing-forloeb.test.mjs.

     Satserne er BOERN af posten, som prislisten paa en leverandoer. */
  { node: "lagre", data: DEMO_LAGRE, form: "liste-med-boern",
    boern: ["satser", "haandteringSatser"] },
  /* ⚠ GRUNDLAGET ER .write: false FOR ALLE, ogsaa admin — som beholdning og
     kasseudlaan. Provisioneringen koerer paa admin-SDK og gaar uden om
     reglerne; uden det her seed ville Fakturering staa tom i dev, og saa
     ville ingen opdage at skaermen nu laeser en rigtig node. */
  { node: "grundlag", data: DEMO_GRUNDLAG, form: "liste" },
  /* ⚠ ETAPERNE SKAL MED. Noden er .write: false som grundlaget, og
     provisioneringen gaar uden om reglerne. Uden dem staar Disponerings
     ugesvisning tom i dev — og saa ville ingen opdage at etapeskift ikke kan
     kaldes. */
  /* ⚠ BOOKINGERNE VAR IKKE SEEDET — MEN ETAPERNE VAR.
     Hver etape bærer et `bookingId`, og i en frisk base pegede alle otte på
     bookinger der ikke fandtes. Det så man ikke: Bookingoversigten læste
     `DEMO_BOOKINGER` DIREKTE, så skærmen viste otte forløb mens noden var
     tom. To svar på ét spørgsmål — og det ene kom slet ikke fra databasen.

     ⚠ Og det blev først synligt da `bookingopret` kom (beslutning 55): en
     nyoprettet booking landede i en node ingen skærm læste. */
  { node: "bookinger", data: DEMO_BOOKINGER, form: "liste" },
  /* ⚠ FORSLAGENE SKAL NØGLES PÅ DERES EGET id. Med `form: "liste"` blev
     etapens `forslag`-array skrevet råt, og RTDB gjorde den til nøglerne
     0, 1, 2 med id'et liggende INDE i posten. Reglen kræver at
     `valgtForslagId` peger på en nøgle der findes — så et valg kunne aldrig
     matche, og nøglerne ville dertil FLYTTE SIG når et forslag blev trukket
     tilbage. Se beslutning 58. */
  { node: "etaper", data: DEMO_ETAPER, form: "liste-med-boern", boern: ["forslag"] },
  /* ⚠ OPGAVERNE HAR HAFT REGLER OG INGEN DATA. Noden er skrivbar med
     opgaver.skriv og har et indeks — men intet seedede den, og ingen skaerm
     forespurgte paa den, saa den stod tom uden at nogen saa det. Det holdt
     11 KPI-felter paa null. Samme form som etaper foer de blev seedet. */
  { node: "opgaver", data: DEMO_OPGAVER, form: "liste" },
  /* ⚠ DEN SJETTE NODE MED REGLER OG INGEN DATA. Den blokerede kun ét
     KPI-felt, og det er derfor den ikke stod på nogen liste — Dashboardet
     hardkodede tallet i stedet.

     ⚠ OG DE KLASSIFICEREDE FELTER LIGGER I EN SATELLIT, også i demo. Ikke
     fordi demoen har brug for adgangskontrol, men fordi formen på noden er
     det skærmen bygges imod. Noden findes for ALLE arter, de fleste med et
     TOMT objekt: at et felt er skjult, er i sig selv en oplysning — skjulte
     vi kun skadebeskrivelsen når der ER en skade, kunne man læse af
     hængelåsen at der skete noget. */
  { node: "indberetninger", data: DEMO_INDBERETNINGER, form: "liste" },
  { node: "sensitive/indberetninger", data: DEMO_INDBERETNINGER_SENSITIVE, form: "objekt" },
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
  /* ⚠ TRIN 1 I PROCURES PROCES — beslutning 78. Noden er `.write: false`,
     saa den kan kun fyldes herfra eller af `behovskriv`. Uden seedet staar
     skaermen tom, og demo-saettet maa IKKE traede i stedet: en seedet node
     skal vise sig selv (beslutning 56 og 64). */
  { node: "indkoebsbehov", data: DEMO_INDKOEBSBEHOV, form: "liste" },
  /* ⚠ TRIN 2. Ordrerne skal med i SAMME ombaering som behovene: tre af
     behovene staar som "bestilt" og peger paa en ordre, og seedede vi kun
     behovene, ville de pege paa noget der ikke findes. Og en node der ikke
     seedes, er en node demo-i-skaerm springer over — saa kunne skaermen
     laese demofilen direkte uden at loftet saa det (beslutning 56). */
  { node: "indkoebsordrer", data: DEMO_INDKOEBSORDRER, form: "liste" },
  /* ⚠ ET OBJEKT, IKKE EN LISTE — der er ÉN politik pr. virksomhed. Og den
     SKAL seedes sammen med ordrerne: tre af dem staar i koeen fordi de er
     over graensen, og uden reglen ville graensen vaere ukendt, standarden
     "ingen godkendelse" gaelde, og de tre raekker staa i en koe serveren
     ikke kunne have lavet. Se beslutning 82. */
  { node: "godkendelsesregler", data: DEMO_GODKENDELSESREGLER, form: "objekt" },
  /* ⚠ PROCURES EGET VARELAGER — ikke Warehouses `varer`, som er KUNDENS
     gods. Og de to noder hoerer SAMMEN: beholdningen paa varen er summen
     af bevaegelserne, og seedede vi kun den ene, ville skaermens
     `beholdningsafvigelse()` vise en drift vi selv havde lavet.
     Se beslutning 85. */
  { node: "forbrugsvarer", data: DEMO_FORBRUGSVARER, form: "liste" },
  { node: "forbrugsvarebevaegelser", data: DEMO_FORBRUGSVAREBEVAEGELSER, form: "liste" },
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
  /* ⚠ UNITBOOKING SEEDES OGSAA, og kasseudlaan er med selv om noden er
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
/**
 * Hvilket modul spærrer noden? — læst ud af `firebase.rules.json`.
 *
 * Reglens `.read` bærer klausulen `moduler').child('<modul>').val() === true`
 * for de noder der hører til et modul. Er der ingen klausul, hører noden til
 * alle (fx `brugere`, `countere`).
 *
 * ⚠ LÆST, IKKE SKREVET AF. En liste her ville være den samme kendsgerning to
 * steder, og den ene ville drive — præcis den fejl beslutning 70 fjernede en
 * hel akse for.
 */
/* ⚠ REGLERNE LÆSES SOM JSON, IKKE SOM TEKST — og det er en rettelse.
 *
 * Den gamle udgave fandt `"<node>": {` med `findIndex` og læste otte linjer
 * frem. Den fandt det FØRSTE tekstfund, og `"beholdning"` findes to steder:
 * som node under tenanten, og som et FELT i `forbrugsvarer`
 * (`"beholdning": { ".validate": "newData.isNumber()" }`). Feltet står først
 * i filen, det har ingen `.read`, og svaret blev derfor `null` — altså "hører
 * til alle".
 *
 * Følgen kunne måles: DEV-kunden `nordvest` har ikke Warehouse, og fik
 * alligevel **seks beholdningsposter** seedet. Data han aldrig kan læse,
 * liggende i hans egen tenant.
 *
 * Det er samme fejl som har kostet noget fem gange i dette repo — et anker
 * der findes to steder — og her sad den i den funktion der skulle beskytte
 * mod netop den slags.
 *
 * Princippet er uændret: mappingen LÆSES ud af reglerne, den skrives ikke af.
 * Det er metoden der var forkert.
 *
 * ⚠ NÆRMESTE `.read` VINDER, og der walkes bagfra: `facility/lokationer`
 * arver `facility`s klausul, mens en node med sin egen klausulfri `.read`
 * hører til alle. En `.read` kaskaderer NED i RTDB — et barn kan tilføje
 * adgang, aldrig fjerne den.
 */
export function modulForNode(node, regeltekst) {
  let tenant;
  try {
    tenant = JSON.parse(
      String(regeltekst).replace(/^﻿/, "").replace(/^\s*\/\/.*$/gm, "")
    ).rules?.tenants?.$tenantId;
  } catch {
    return null;
  }
  if (!tenant) return null;

  const dele = String(node).split("/");
  for (let i = dele.length; i > 0; i -= 1) {
    const post = dele.slice(0, i).reduce((o, k) => (o == null ? o : o[k]), tenant);
    const laes = post?.[".read"];
    if (typeof laes !== "string") continue;
    const m = laes.match(/child\('moduler'\)\.child\('(\w+)'\)\.val\(\) === true/);
    return m ? m[1] : null;
  }
  return null;
}

/**
 * Feltnavn → den node det peger på.
 *
 * ⚠ ÉN DEFINITION. `test/demo-referencer.test.mjs` importerer den herfra, så
 * seedet og prøven ikke kan blive uenige om hvad et `*Id` peger på. To kopier
 * er hvordan den ene glemmer et felt — og et felt der glemmes, er en
 * reference ingen prøver.
 *
 * `uid`, `afUid`, `oprettetAf`, `anmoderId` og `bestillerId` står IKKE her:
 * de peger på et login, ikke på en post i en node. Se `uid` mod `personId` i
 * CLAUDE.md.
 */
export const FELT_NODE = {
  koeretoejId: "koeretoejer",
  koeretoejIder: "koeretoejer",
  personId: "personale",
  ansvarligPersonId: "personale",
  lagerId: "lagre",
  leverandoerId: "leverandoerer",
  kundeId: "kunder",
  bookingId: "bookinger",
  etapeId: "etaper",
  kasseId: "kasser",
  aktivId: "facility/aktiver",
  lokationId: "facility/lokationer",
  zoneId: "facility/zoner",
  ordreId: "indkoebsordrer",
  behovId: "indkoebsbehov",
  forbrugsvareId: "forbrugsvarer",
  indkoebId: "indkoeb",
  vareId: "varer",
  carrierId: "carriers",
  fraCarrierId: "carriers",
  tilCarrierId: "carriers",
  afsendCarrierId: "carriers",
  pladsId: "reolpladser",
  hjemPladsId: "reolpladser",
  fraPladsId: "reolpladser",
  tilPladsId: "reolpladser",
  erstatterId: "grundlag",
  erstattetAfId: "grundlag",
};

/** Hvert felt der ender på Id, i en post og i dens underlister. */
export function referencerI(post, sti = "") {
  const ud = [];
  if (!post || typeof post !== "object") return ud;
  for (const [k, v] of Object.entries(post)) {
    if (v === null || v === undefined) continue;
    if (/Id$|Ider$/.test(k)) { ud.push({ felt: k, sti: `${sti}${k}` }); continue; }
    if (Array.isArray(v)) {
      for (const [i, e] of v.entries()) ud.push(...referencerI(e, `${sti}${k}[${i}].`));
    } else if (typeof v === "object") {
      ud.push(...referencerI(v, `${sti}${k}.`));
    }
  }
  return ud;
}

/**
 * Hvilke poster kan denne tenant overhovedet bruge?
 *
 * ⚠ EN POST DER PEGER PÅ ET MODUL KUNDEN IKKE HAR, ER IKKE HANS DATA.
 * Node-filteret ovenfor springer hele noder over. Det er ikke nok: `grundlag`
 * hører til BASEN og seedes for alle — men de fire demo-grundlag bærer et
 * `bookingId` og et `kundeId`, og DEV-kunden `nordvest` har hverken Planning
 * eller Kunder. Fire fakturagrundlag der peger på bookinger der ikke findes
 * i hans tenant, målt i den udrullede base.
 *
 * ⚠ OG SVARET ER IKKE DET SAMME FOR ALLE FELTER. Reglen afgør:
 *
 *   PÅKRÆVET felt  → posten kan slet ikke være hans. Den udelades.
 *                    `grundlag` kræver `kundeId`; uden Kunder-modulet ville
 *                    posten være ugyldig i hans egen node.
 *   VALGFRIT felt  → posten er hans, men koblingen er ikke. Feltet nulles.
 *                    `indberetninger` kræver ikke `bookingId`: en kunde uden
 *                    Planning har udmærket indberetninger, de er bare ikke
 *                    bundet til en tur.
 *
 * Udelod vi posten i begge tilfælde, ville hans base se tommere ud end den
 * er; nullede vi i begge, ville der stå ugyldige poster i den. Reglen ved
 * hvilket af de to der gælder — vi skal bare spørge den.
 */
export function seedbarePoster(node, liste, { harModulet, paakraevede }) {
  const kraevet = new Set(paakraevede(node));
  const beholdt = [];
  let udeladt = 0;
  let nullet = 0;

  for (const post of liste) {
    const daarlige = referencerI(post).filter(({ felt }) => {
      const maal = FELT_NODE[felt];
      return maal && !harModulet(maal);
    });
    if (!daarlige.length) { beholdt.push(post); continue; }

    if (daarlige.some(({ felt }) => kraevet.has(felt))) { udeladt += 1; continue; }

    /* Kun felter på POSTENS eget niveau nulles — en reference nede i en
       underliste hører til den linje, og en linje kan ikke nulles uden at
       ændre hvad posten siger. Bærer en underliste en umulig reference, er
       posten ikke hans. */
    const paaTop = daarlige.filter((d) => d.sti === d.felt);
    if (paaTop.length !== daarlige.length) { udeladt += 1; continue; }

    const kopi = { ...post };
    for (const { felt } of paaTop) kopi[felt] = null;
    beholdt.push(kopi);
    nullet += 1;
  }
  return { beholdt, udeladt, nullet };
}

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

  /* ⚠ EN ANDEN TENANT END DEV'S ER EN KUNDE, og så skal to ting være
     anderledes: der oprettes INGEN brugere, og seedet følger kundens moduler.
     Begge dele er sikkerhed, ikke pænhed — se hovedet. */
  const valgt = (process.argv.find((a) => a.startsWith("--tenant=")) || "").slice(9)
    || DEV_TENANT;
  const erDev = valgt === DEV_TENANT;

  /* ⚠ TENANTEN SKAL FINDES I FORVEJEN når den ikke er dev's. Et seed der
     OPRETTER en tenant, ville lave en kunde uden om `kundeopret` — og dermed
     uden en post i `udbyder/kunder`, som natjobbet henter sin tenantliste
     fra. Kunden ville få data og aldrig få nøgletal. */
  if (!erDev) {
    const findes = (await db.ref(`tenants/${valgt}/_findes`).once("value")).val();
    if (!findes) {
      throw new Error(
        `Tenanten "${valgt}" findes ikke. Opret den med kundeopret først — `
        + "et seed må ikke være en bagdør til at oprette en kunde."
      );
    }
  }

  const moduler = (await db.ref(`tenants/${valgt}/moduler`).once("value")).val();
  const regeltekst = readFileSync("firebase.rules.json", "utf8");

  /**
   * ⚠ SAMME LOGIK SOM REGLEN, LED FOR LED — inklusive det første.
   *
   * Reglen er `!moduler.exists() || moduler.child(X).val() === true`: en tenant
   * UDEN en `moduler`-node har adgang til ALT. Det er ikke en genvej; det er
   * hvordan en tenant der endnu ikke er modulopdelt, kan bruges.
   *
   * ⚠ FØRSTE UDGAVE HER SKREV `?? {}` OG GLEMTE DET LED — og `demo` har ingen
   * `moduler`-node. Resultatet: **27 af 31 noder blev sprunget over**, og
   * dev-tenanten stod tilbage med fire. En filterkopi der er 90 % rigtig,
   * afviser præcis dét reglen tillader.
   */
  /* Hvad reglen KRÆVER af en post i noden — læst, ikke skrevet af. Samme
     princip som modulForNode(): listen står i reglerne, ikke i scriptet. */
  const regler = JSON.parse(
    regeltekst.replace(/^﻿/, "").replace(/^\s*\/\/.*$/gm, "")
  ).rules?.tenants?.$tenantId || {};
  const paakraevedeFelter = (node) => {
    const post = node.split("/").reduce((o, k) => (o == null ? o : o[k]), regler);
    const barn = Object.keys(post || {}).find((k) => k.startsWith("$"));
    const udtryk = barn ? post[barn]?.[".validate"] : null;
    const m = typeof udtryk === "string"
      ? udtryk.match(/hasChildren\(\[([^\]]*)\]\)/)
      : null;
    return m ? m[1].split(",").map((x) => x.trim().replace(/['"]/g, "")) : [];
  };
  const renset = [];

  const harModulet = (node) => {
    if (!moduler) return true;
    const m = modulForNode(node, regeltekst);
    return !m || moduler[m] === true;
  };

  console.log(`Provisionerer ${noegle.project_id}, tenant "${valgt}".`);
  if (!erDev) {
    console.log(
      `  moduler: ${Object.entries(moduler).filter(([, v]) => v === true).map(([k]) => k).join(", ") || "(ingen)"}`
      + "\n  brugere: springes over — DEV-konti hører ikke i en kundes tenant"
    );
  }
  console.log("");

  /* 1. Tenant-markøren. Uden den afviser hver regel alt. */
  await db.ref(`tenants/${valgt}/_findes`).set(true);
  console.log("  _findes            sat");

  /* 2. Brugere og claims. Ejerkontoen — hvis der er sat en — provisioneres
     ad NØJAGTIG samme vej som de seks. Ingen bagdør: en adgang der kommer et
     andet sted fra end alle andres, er den der bliver glemt når rettighederne
     skal gennemgås. */
  const ejer = ejerkonto(process.env.VITE_DEV_EJER_MAIL || laesFraEnvLocal("VITE_DEV_EJER_MAIL"));
  /* ⚠ ROLLE → uid. Demo-data kan ikke kende et Firebase-uid — det laves af
     Auth ved oprettelsen — og alle referencer til en BRUGER i demo-sættene er
     derfor pladsholdere. De skal oversættes her, hvor de rigtige uid'er
     findes. Uden det peger godkendelsesreglen paa nogen der ikke kan logge
     ind, og koeen er en post der venter paa et spoegelse. */
  const uidFor = {};
  for (const b of erDev ? (ejer ? [...DEV_BRUGERE, ejer] : DEV_BRUGERE) : []) {
    let bruger;
    try {
      bruger = await auth.getUserByEmail(b.email);
      await auth.updateUser(bruger.uid, { password: kode, displayName: b.navn });
    } catch (e) {
      if (e.code !== "auth/user-not-found") throw e;
      bruger = await auth.createUser({ email: b.email, password: kode, displayName: b.navn });
    }
    await auth.setCustomUserClaims(bruger.uid, claimsFor(b.rolle, valgt));

    /* Uden det beholder en allerede indlogget session sine GAMLE claims,
       indtil tokenet udløber af sig selv. Man ville tro man havde ændret
       adgangen, og den gamle ville stadig virke — den værste fejltilstand,
       fordi den ser ud som om den lykkedes. Se ARKITEKTUR om rolleskift. */
    await auth.revokeRefreshTokens(bruger.uid);
    uidFor[b.rolle] = bruger.uid;

    /* ⚠ BRUGERINDEKSET SKREV SIG IKKE SELV. `tenants/<id>/brugere/<uid>` er
       det eneste sted en klient kan slaa et navn op paa et uid — auditloggen,
       Brugere & roller og godkendelsens "Anmoder"-kolonne laeser alle den.
       Den blev skrevet af `opretbruger`, som DEV-konti aldrig gaar igennem,
       saa noden var TOM i DEV: skaermene viste raa uid'er, og
       godkender-vaelgeren havde ingen at vaelge. Formen er den samme som
       `indeksPost()` i functions/index.js. */
    await db.ref(`tenants/${valgt}/brugere/${bruger.uid}`).set({
      email: b.email,
      navn: b.navn || b.email,
      rolle: b.rolle,
      spaerret: false,
      opdateretMs: Date.now(),
    });
    console.log(`  ${b.rolle.padEnd(18)} ${b.email}`);
  }

  /* 3. Demo-data under de noder skærmene faktisk læser. */
  console.log("");
  let sprunget = 0;
  for (const { node, data, form, boern } of SEED) {
    /* ⚠ EN NODE KUNDEN IKKE KAN LÆSE, SKAL HELLER IKKE SEEDES. Modulklausulen
       i reglerne ville afvise hans læsning — så dataene ville ligge der,
       tælle med i nøgletallene, og ikke kunne ses. Et tal regnet af data ingen
       kan se, er værre end intet tal. */
    if (!harModulet(node)) {
      sprunget += 1;
      continue;
    }
    /* ⚠ OG POSTERNE ENKELTVIS. En node kan høre til basen og alligevel
       bære poster der peger på et modul kunden ikke har — `grundlag` er
       basens, og de fire demo-grundlag bærer et bookingId. Se
       seedbarePoster(). */
    const raa = form === "objekt" ? null : data;
    let brugt = data;
    if (raa) {
      const { beholdt, udeladt, nullet } = seedbarePoster(node, raa, {
        harModulet, paakraevede: paakraevedeFelter,
      });
      brugt = beholdt;
      if (udeladt || nullet) {
        renset.push(`${node}: ${udeladt} udeladt, ${nullet} med nullet reference`);
      }
    }
    const nyttelast = form === "liste-med-boern"
      ? sammeNode(brugt, boern)
      : form === "liste" ? somNode(brugt) : brugt;
    await db.ref(`tenants/${valgt}/${node}`).set(nyttelast);
    const antal = form === "objekt" ? "objekt" : `${brugt.length} rækker`;
    console.log(`  ${node.padEnd(24)} ${antal}`);
  }

  /* ⚠ EN UDELADELSE MAN KAN SE, ER ET VALG; en man ikke kan se, er en fejl.
     Samme regel som gitteret skriver når det skjuler tomme rækker. */
  if (sprunget) {
    console.log(`  (${sprunget} noder sprunget over — kunden har ikke modulet)`);
  }
  /* ⚠ SAMME REGEL FOR POSTERNE: en udeladelse man kan se, er et valg. */
  for (const r of renset) console.log(`  ! ${r}`);

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
  /* ⚠ EN RESERVATION UDEN SIN KILDE ER VÆRRE END INGEN. Etaperne seedes kun
     hvis kunden har Booking-modulet — og uden dem ville de her reservationer
     pege på ture der ikke findes: tretten enheder der ser OPTAGET ud af noget
     ingen kan slå op. Det blev målt på nordvest, ikke antaget. */
  for (const e of harModulet("etaper") ? DEMO_ETAPER : []) {
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
  /* ══════════════════════════════════════════════════════════════════════
     ⚠ OG EN SYG CHAUFFOER SKAL HELLER IKKE KUNNE DISPONERES.

     Her stod KUN etapernes reservationer. Maalt paa den udrullede base:
     7 koeretoej/booking og 6 medarbejder/booking — og INTET fravaer. Reglen i
     firebase.rules.json siger det modsatte om noden: "Skriver en reservation
     med kilde 'fravaer' paa chaufføren, saa en syg chauffoer ikke kan
     disponeres."

     Det er ikke en kosmetisk mangel. etapeskift haandhaever de fem tjek mod
     reservationer, og et fravaer der ikke staar i noden, findes ikke for
     serveren: en booking kunne lande paa en chauffoer der er sygemeldt.
     Disponering-skaermen udledte sine EGNE af demo-fravaeret og viste derfor
     en konflikt serveren ikke kendte — skaermen VISER, funktionen HAANDHAEVER,
     og de to var uenige i den farlige retning.

     ⚠ SAMME FUNKTION SOM SKAERMEN OG SERVEREN BRUGER. reservationFraFravaer()
     baerer beslutningen om at hverken navn eller aarsag kommer med: posten er
     synlig for enhver der kan laese reservationsnoden, og en helbredsoplysning
     maa ikke laekke ud af sensitive/ ad bagvejen.
     ══════════════════════════════════════════════════════════════════════ */
  let antalFravaer = 0;
  for (const f of DEMO_FRAVAER) {
    let r;
    try {
      r = reservationFraFravaer(f);
    } catch {
      /* Et ufuldstaendigt fravaer reserverer ingenting. Funktionen kaster
         frem for at gaette et tidsrum — se noten ved den. */
      continue;
    }
    reservationer[r.ressourceType] ??= {};
    reservationer[r.ressourceType][r.ressourceId] ??= {};
    reservationer[r.ressourceType][r.ressourceId][`res-${f.id}`] = {
      fra: r.fra, til: r.til, kilde: r.kilde,
      oprettetAf: "provisioner", oprettetMs: Date.now(),
    };
    antalFravaer += 1;
  }

  /* ══════════════════════════════════════════════════════════════════════
     ⚠ OG EN BIL PÅ VÆRKSTED SKAL HELLER IKKE KUNNE DISPONERES.

     Opgavernes reservationer manglede, og grunden var ikke et glemt seed:
     reservationFraOpgave() KUNNE IKKE kaldes på en rigtig opgave. Den krævede
     fra/til; noden bærer startMs og estimeretMin, så hver eneste opgave
     kastede. At funktionen alligevel virkede, skyldtes at alle tre kaldsteder
     fodrer den med et BESØG — som tilfældigvis har fra/til.

     Resultatet: en værkstedsopgave på vores egen lift spærrede ingenting, og
     etapeskift kunne disponere bilen mens den stod der. Prioritet 40 — den
     højeste af dem alle — fandtes kun i skærmen.

     ⚠ VINDUET ER ET ESTIMAT, IKKE EN MÅLING. estimeretMin er hvad vi tror;
     faktiskMin er hvad der gik. En reservation er et krav på fremtiden, så
     estimatet er det rigtige grundlag — og en opgave UDEN estimat reserverer
     ingenting frem for at få en gættet standardlængde.
     ══════════════════════════════════════════════════════════════════════ */
  let antalOpgaver = 0;
  for (const o of DEMO_OPGAVER) {
    let r;
    try {
      r = reservationFraOpgave(o);
    } catch {
      /* Uden ressource eller uden vindue reserverer opgaven ingenting.
         Funktionen kaster frem for at gætte — se noten ved den. */
      continue;
    }
    reservationer[r.ressourceType] ??= {};
    reservationer[r.ressourceType][r.ressourceId] ??= {};
    reservationer[r.ressourceType][r.ressourceId][`res-${o.id}`] = {
      fra: r.fra, til: r.til, kilde: r.kilde,
      oprettetAf: "provisioner", oprettetMs: Date.now(),
    };
    antalOpgaver += 1;
  }

  await db.ref(`tenants/${valgt}/reservationer`).set(reservationer);
  console.log(
    `  ${"reservationer".padEnd(24)} ${antalResv} fra etaper, ${antalFravaer} fra fravær, ` +
    `${antalOpgaver} fra opgaver`);

  /* ══════════════════════════════════════════════════════════════════════
     ⚠ COUNTEREN SKAL KENDE DET HØJESTE NUMMER DER ALLEREDE ER UDSTEDT.

     Bookingerne bærer BKG-2026-00311 og opefter. Uden de her linjer står
     `countere/booking/<år>` på nul, og den første booking `bookingopret`
     laver, får BKG-2026-00001 — en serie der begynder FORFRA under de numre
     der allerede findes, og som kolliderer ved den 318.

     ⚠ TALLET LÆSES AF POSTERNE, IKKE GÆTTET. En post hvis nummer ikke passer
     til formatet, springes over og rapporteres frem for at trække serien ned.
     Det er ikke en optælling — beslutning 8 forbyder optællingen som
     NUMMERKILDE — det er en efterudfyldning af en tæller der aldrig blev sat.
     ══════════════════════════════════════════════════════════════════════ */
  /* ⚠ ÉN TABEL, IKKE ÉN BLOK PR. SERIE. Her stod regnestykket kun for
     bookingerne, og da Procure fik sin egen serie (beslutning 81), var den
     nærliggende rettelse at kopiere blokken. To kopier af den samme
     efterudfyldning driver — den ene ville få rettet sin modulklausul og den
     anden ikke. Serierne står nu som DATA, og der er ét regnestykke. */
  const SERIER = [
    { serie: "booking", praefiks: "BKG", modul: "bookinger", poster: DEMO_BOOKINGER },
    /* ⚠ OG PROCURES SERIE SKAL MED. Demo-ordrerne bærer BST-2026-00040 og
       opefter; uden den her linje står tælleren på nul, og den første
       bestilling "ordreskriv" laver, hedder BST-2026-00001 — en serie der
       begynder FORFRA under numre der allerede findes. Det er nøjagtig den
       fejl blokken her blev skrevet for at lukke for bookingerne. */
    { serie: ORDRESERIE, praefiks: ORDRE_PRAEFIKS, modul: "indkoeb",
      poster: DEMO_INDKOEBSORDRER },
  ];

  for (const { serie, praefiks, modul, poster } of SERIER) {
    const hoejesteNummer = {};
    let udenNummer = 0;
    /* ⚠ OG TÆLLEREN FØLGER MODULET. En kunde uden Booking har ingen bookinger
       og skal ikke have en bookingtæller stående på 318 — den ville få hans
       FØRSTE booking (den dag han køber modulet) til at hedde BKG-2026-00319,
       som om der lå tre hundrede før den. Målt på nordvest. */
    const form = new RegExp("^" + praefiks + "-(\\d{4})-(\\d{5})$");
    for (const post of harModulet(modul) ? poster : []) {
      const m = form.exec(post.nummer || "");
      if (!m) { udenNummer += 1; continue; }
      hoejesteNummer[m[1]] = Math.max(hoejesteNummer[m[1]] || 0, Number(m[2]));
    }
    for (const [aar, n] of Object.entries(hoejesteNummer)) {
      await db.ref(`tenants/${valgt}/countere/${serie}/${aar}`).set(n);
    }
    if (Object.keys(hoejesteNummer).length) {
      console.log(
        `  ${("countere/" + serie).padEnd(24)} ` +
        Object.entries(hoejesteNummer).map(([a, n]) => `${a}: ${n}`).join(", ") +
        (udenNummer ? ` (${udenNummer} uden gyldigt nummer sprunget over)` : ""));
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     ⚠ DEMO-SÆTTENES BRUGER-PLADSHOLDERE OVERSÆTTES TIL RIGTIGE uid'er.

     Demo-sættene skriver `oprettetAf: "uid-mikkel"` og lignende. Ingen af
     dem er et Firebase-uid — de KAN ikke være det, for uid'et laves først
     når kontoen oprettes, og et demo-sæt er en fil i repoet.

     Seedet råt betyder det to ting, og begge ser ud som fejl i koden:

       1. Skærmene viser "uid-thomas" i en Anmoder-kolonne, fordi opslaget i
          brugerindekset ikke finder noget, og faldbakken er uid'et selv.
       2. `godkendelsesregler` udpeger en godkender der ikke kan logge ind.
          Køen ville stå der, knappen ville være grå for ALLE, og grunden
          ("kun den udpegede godkender kan afgøre den her ordre") ville pege
          på et spøgelse.

     ⚠ TABELLEN ER PLADSHOLDER → ROLLE, IKKE → uid. Rollen er dét demoen
     faktisk mener — godkenderen er koordinatoren, samme snit som
     `grundlag.godkend` — og uid'et skifter hver gang en DEV-base bygges op
     igen. Skrev vi uid'et, skulle tabellen rettes efter hver oprydning.
     ══════════════════════════════════════════════════════════════════════ */
  const PLADSHOLDER_ROLLE = {
    "uid-mikkel": "koordinator",
    "uid-thomas": "disponent",
    "uid-lars": "casehandler",
    "uid-jens": "admin",
    "uid-michael": "lagermedarbejder",
    "uid-anders": "chauffoer",
    "uid-mette": "casehandler",
  };
  const rigtigt = (pladsholder) => uidFor[PLADSHOLDER_ROLLE[pladsholder]] || null;

  let omskrevet = 0;
  const omskrivOprettetAf = async (node, poster) => {
    if (!harModulet(node)) return;
    for (const post of poster) {
      const nyt = rigtigt(post.oprettetAf);
      if (!nyt) continue;
      await db.ref(`tenants/${valgt}/${node}/${post.id}/oprettetAf`).set(nyt);
      omskrevet += 1;
    }
  };
  await omskrivOprettetAf("indkoebsordrer", DEMO_INDKOEBSORDRER);
  await omskrivOprettetAf("indkoebsbehov", DEMO_INDKOEBSBEHOV);

  if (harModulet("godkendelsesregler")) {
    const godkenderUid = rigtigt(DEMO_GODKENDELSESREGLER.overBeloeb.godkenderUid);
    if (godkenderUid) {
      await db.ref(`tenants/${valgt}/godkendelsesregler/overBeloeb/godkenderUid`)
        .set(godkenderUid);
      omskrevet += 1;
    }
  }
  if (omskrevet) {
    console.log(`  ${"uid-pladsholdere".padEnd(24)} ${omskrevet} omskrevet til rigtige konti`);
  }

  /* ⚠ OG HVER ETAPE SKAL PEGE PÅ EN BOOKING DER FINDES. Før bookingerne kom
     i SEED, gjorde ingen af dem det — og det kunne ikke ses, fordi
     Bookingoversigten læste demofilen direkte. En dinglende reference her er
     samme fejl som fakturaen der pegede på en linje i den anden demofil. */
  const bookingIder = new Set(DEMO_BOOKINGER.map((b) => b.id));
  const dinglende = DEMO_ETAPER.filter((e) => e.bookingId && !bookingIder.has(e.bookingId));
  if (dinglende.length) {
    console.warn(
      `  ⚠ ${dinglende.length} etape(r) peger på en booking der ikke findes: ` +
      dinglende.map((e) => `${e.id}→${e.bookingId}`).join(", "));
  }

  /* ══════════════════════════════════════════════════════════════════════
     ⚠ NØGLETALLENE SEEDES IKKE LÆNGERE — DE REGNES.

     Her stod `kpi/gods/current` og `kpi/bus/current` med DEMO_KPI som data.
     Det betød at dev viste MOCKUPPENS tal oven på sine egne: "18 åbne ordrer"
     stod over en tabel med 6 rækker, og "287 aktiver" over 15 hentede. De to
     var ikke uenige — de kom bare fra hver sin kilde, og kun den ene af dem
     var kundens.

     ⚠ OG DET BRØD EN HUSREGEL. Opdigtede tal findes KUN hvor der ikke er en
     database at spørge (se datatilstand.js og beslutning 26). Dev HAR en
     database. Så længe `kpi/` manglede kilder, var seedet den mindste onde;
     nu er KILDER_DER_MANGLER tom, og undtagelsen har ingen grund tilbage.

     ⚠ DE HENTES TILBAGE FRA BASEN, ikke fra demo-konstanterne. Det er den
     SAMME vej jobbet går — læs noderne, kald beregnKpi() — og derfor prøver
     det her seed også om det der lige blev skrevet, kan LÆSES som
     aggregeringen forventer. En form der kun virker på vej ind, er ikke en
     form.

     ⚠ INGEN `forrige`. Deltaerne bliver null i en frisk base, og det er det
     rigtige: der ER ingen forrige periode. Et opdigtet forrige-tal ville
     give en pil der pegede et sted ingen kunne genfinde. Første natlige
     kørsel arkiverer `current` og giver deltaerne deres grundlag.

     Samme mønster som reservationerne ovenfor: udledt, ikke seedet.
     ══════════════════════════════════════════════════════════════════════ */
  const somRaekker = (v) => Object.entries(v || {}).map(([id, x]) => ({ id, ...x }));
  const hentNode = async (n) =>
    somRaekker((await db.ref(`tenants/${valgt}/${n}`).once("value")).val());

  const [
    kpiKunder, kpiEtaper, kpiGrundlag, kpiOpgaver, kpiIndkoeb, kpiFakturaer,
    kpiLeverandoerer, kpiAktiver, kpiFejl, kpiSensorer, kpiIndberetninger,
    kpiKoeretoejer, kpiPersonale, kpiKompetencer, kpiBookinger, kpiFravaer,
    kpiForbrugsvarer,
  ] = await Promise.all([
    "kunder", "etaper", "grundlag", "opgaver", "indkoeb", "fakturaer",
    "leverandoerer", "facility/aktiver", "facility/fejl", "facility/sensorer",
    "indberetninger",
    /* ⚠ DE TRE KOM TIL MED `disponering.konflikter`. Jobbet i
       functions/index.js henter de SAMME lister — og gjorde provisioneringen
       det ikke, ville dev vise null hvor natten viser et tal. To regnestykker
       med hvert sit input er to svar på ét spørgsmål. */
    "koeretoejer", "personale", "kompetencer",
    /* ⚠ BOOKINGERNE KOM MED FOR `opgaver.nyeBookinger`. ⚠ Og rækkefølgen ER
       kontrakten: destruktureringen ovenfor matcher positionerne her. */
    "bookinger",
    /* ⚠ FRAVÆRET KOM MED FOR `bemanding.fravaerIDag` (beslutning 69). Jobbet
       henter den SAMME node, og gjorde provisioneringen det ikke, ville dev
       vise 0 hvor natten viser et tal — en nul der ligner en måling. */
    "fravaer",
    /* ⚠ PROCURES EGET VARELAGER (beslutning 85), og det står SIDST af samme
       grund som bookingerne og fraværet: rækkefølgen ER kontrakten.

       ⚠ OG DET SKAL HENTES BEGGE STEDER. Uden det her led ville
       `lavBeholdning` blive skrevet som 0 i noden, mens Varelageret regner
       4 af de samme rækker — to svar på ét spørgsmål, ét klik fra hinanden.
       Det er nøjagtig det de tre noter herover advarer om. */
    "forbrugsvarer",
  ].map(hentNode));

  /* ⚠ RESERVATIONERNE ER ET TRAE, IKKE EN LISTE — og de er lige blevet
     skrevet ovenfor. Formen er den `tjekDisponering()` slaar op i:
     <type>/<id>/[poster]. */
  const kpiReservationer = (() => {
    const ud = {};
    for (const [type, paaType] of Object.entries(reservationer || {})) {
      ud[type] = {};
      for (const [id, poster] of Object.entries(paaType || {})) {
        ud[type][id] = Object.entries(poster || {}).map(([rid, v]) => ({ id: rid, ...v }));
      }
    }
    return ud;
  })();

  const nuMs = Date.now();
  {
    const tal = beregnKpi({
      kunder: kpiKunder, etaper: kpiEtaper, grundlag: kpiGrundlag,
      opgaver: kpiOpgaver, indkoeb: kpiIndkoeb, fakturaer: kpiFakturaer,
      leverandoerer: kpiLeverandoerer,
      facilityAktiver: kpiAktiver, facilityFejl: kpiFejl, facilitySensorer: kpiSensorer,
      indberetninger: kpiIndberetninger,
      koeretoejer: kpiKoeretoejer, personale: kpiPersonale,
      kompetencer: kpiKompetencer, reservationer: kpiReservationer,
      bookinger: kpiBookinger, fravaer: kpiFravaer,
      forbrugsvarer: kpiForbrugsvarer,
      forrige: null, nu: nuMs,
    });
    await db.ref(`tenants/${valgt}/kpi/current`).set(tal);

    /* ⚠ TO SLAGS null, OG DE MAA IKKE TAELLES SAMMEN. Foerste udgave af
       den her linje skrev "56 felter uden kilde" — men de fleste af dem var
       DELTAER, som er null fordi der ingen forrige koersel er i en frisk
       base. Det er ikke et efterslaeb; det retter sig selv i nat.

       Blandet sammen var tallet ubrugeligt til det ene det skal bruges til:
       at man kan SE om en etape har flyttet noget. */
    const blade = Object.values(tal)
      .filter((v) => v && typeof v === "object" && !Array.isArray(v))
      .flatMap((o) => Object.entries(o));
    const erDelta = ([f]) => /Delta|Point$/.test(f);
    const udenKilde = blade.filter(([, v]) => v === null).filter((x) => !erDelta(x)).length;
    const udenForrige = blade.filter(([, v]) => v === null).filter(erDelta).length;
    console.log(
      `  ${"kpi/current".padEnd(24)} beregnet — ${udenKilde} uden kilde, ` +
      `${udenForrige} deltaer uden forrige periode`);
  }

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

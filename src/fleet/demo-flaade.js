/* src/fleet/demo-flaade.js
 * ÉN demo-flåde. Ikke tre.
 *
 * Bilerne stod hardkodede tre steder, og to af dem var direkte uenige:
 * Bil 104 var en "Mercedes Actros, reg. AB 12 345" i demo-sag.js og en
 * "Mercedes Actros 1845, reg. DE 45 678" i Bookingopsætning. Det er beslutning
 * 6's 84-mod-83 igen, denne gang på en nummerplade — og en nummerplade er
 * værre, for den er det man slår op på i en fejlsøgning.
 *
 * Denne fil er kilden. Dashboard, Bookingopsætning og demo-sag retter sig ind.
 *
 * FORMEN ER NODENS, IKKE SKÆRMENS — samme regel som demo-personale.js.
 * Posterne ser ud præcis som tenants/<t>/koeretoejer/<id>: samme felter, samme
 * navne, samme enheder. Den dag der ligger rigtige data i DEV, skal Flåde ikke
 * laves om; demo-sættet skal bare falde væk.
 *
 * INGEN DIVISION — beslutning 19. Feltet er ikke udeladt for at spare plads:
 * reglerne afviser det med .validate: false, og et demo-sæt der havde det med,
 * ville lære den næste udvikler en form der ikke kan gemmes. En påhængsvogn
 * kan tilhøre både en gods- og en busvognmand; arten siger det der kan siges.
 *
 * ART STYRER FELTSKEMAET. Traileren har ingen kmStand, og det er ikke et hul i
 * datasættet — den har ingen motor. Se ART_FELTER i flaade.js og brug
 * harFelt() frem for at tjekke om værdien er udfyldt.
 *
 * DET ER ET UDSNIT. 16 enheder er ikke hele flåden — kpi/ siger 42 aktive i
 * gods og 18 i bus. Rosteren er tegnet til at dække alle ni arter og alle fem
 * statusser, ikke til at summe op til nøgletallene. Selvkontrollen nedenfor
 * fastholder at den bliver ved med at være mindre end totalen; skærmen skriver
 * "af N hentede" frem for at lade to tal modsige hinanden.
 */
import { STED } from "./steder.js";
import { ALLE_ARTER, ENHEDSART, KOERETOEJ_STATUS, harFelt, FELT } from "./flaade.js";
import { DEMO_KPI } from "./demo-kpi.js";

const NU = Date.now();
const D = 86400000;

/* Længder i MILLIMETER som integer — aldrig meter som float. Færgetakster har
   grænser ved 10 og 20 m, og 9,998 mod 10,002 afgør prisen. Se
   samletLaengdeMm() i flaade.js. */

export const DEMO_KOERETOEJER = [
  /* --- Trækkere ---------------------------------------------------- */
  {
    id: "kt-012", kaldenavn: "Bil 12", navn: "Volvo FH 500",
    registrering: "DE 12 345", art: "traekker", status: "aktiv",
    hjemsted: STED.kolding, naesteServiceKm: 414500,
    laengdeMm: 6200, driftPrKmOere: 310,
    /* En trækker bærer næsten intet — lasten ligger på traileren. Nul er den
       rigtige værdi, ikke et manglende tal. Se samletKapacitet(). */
    kapacitet: { m3: 0, kg: 0 },
    kmStand: 412800, naesteServiceMs: NU + 22 * D, synMs: NU + 140 * D,
    tachografNr: "TG-40122", securityLevel: "normal",
  },
  {
    id: "kt-078", kaldenavn: "Bil 78", navn: "Scania R 450",
    registrering: "DE 78 901", art: "traekker", status: "aktiv",
    hjemsted: STED.aalborg, naesteServiceKm: 270000,
    laengdeMm: 6050, driftPrKmOere: 305,
    kapacitet: { m3: 0, kg: 0 },
    kmStand: 268400, naesteServiceMs: NU + 51 * D, synMs: NU + 96 * D,
    tachografNr: "TG-40789", securityLevel: "normal",
  },
  {
    id: "kt-034", kaldenavn: "Bil 34", navn: "MAN TGX 18.480",
    registrering: "DE 34 567", art: "traekker", status: "aktiv",
    hjemsted: STED.kolding, naesteServiceKm: 533150,
    laengdeMm: 6150, driftPrKmOere: 318,
    kapacitet: { m3: 0, kg: 0 },
    kmStand: 531900, naesteServiceMs: NU + 9 * D, synMs: NU + 61 * D,
    tachografNr: "TG-40345", securityLevel: "normal",
  },
  {
    /* Solgt. Posten bliver stående — se noten om sletning nederst. */
    id: "kt-077", kaldenavn: "Bil 77", navn: "MAN TGA 18.440",
    registrering: "DE 77 111", art: "traekker", status: "solgt",
    hjemsted: STED.kolding,
    laengdeMm: 6100, driftPrKmOere: 355,
    kapacitet: { m3: 0, kg: 0 },
    kmStand: 918200, naesteServiceMs: NU - 210 * D, synMs: NU - 180 * D,
    tachografNr: "TG-40771", securityLevel: "normal",
    afgangMs: NU - 96 * D, afgangAarsag: "Solgt til Jysk Trans ApS",
  },

  /* --- Lastbiler ----------------------------------------------------- */
  {
    /* Bil 104 — den sag der ligger på Værkstedskalender handler om denne.
       ÉT registreringsnummer, og det er dette. */
    id: "kt-104", kaldenavn: "Bil 104", navn: "Mercedes Actros 1845",
    registrering: "DE 45 678", art: "lastbil", status: "aktiv",
    hjemsted: STED.vejle, naesteServiceKm: 299700,
    laengdeMm: 10500, driftPrKmOere: 342,
    kapacitet: { m3: 48, kg: 12000 },
    kmStand: 298450, naesteServiceMs: NU + 9 * D, synMs: NU + 118 * D,
    tachografNr: "TG-41045", securityLevel: "normal",
  },
  {
    id: "kt-106", kaldenavn: "Lastbil 106", navn: "DAF XF 480",
    registrering: "DE 90 123", art: "lastbil", status: "vaerksted",
    hjemsted: STED.kolding, naesteServiceKm: 380200,
    laengdeMm: 10350, driftPrKmOere: 338,
    kapacitet: { m3: 46, kg: 11800 },
    kmStand: 377100, naesteServiceMs: NU + 4 * D, synMs: NU + 73 * D,
    tachografNr: "TG-41061", securityLevel: "normal",
  },
  {
    id: "kt-155", kaldenavn: "Bil 155", navn: "Iveco S-Way 460",
    registrering: "DE 56 789", art: "lastbil", status: "aktiv",
    hjemsted: STED.odense, naesteServiceKm: 186900,
    laengdeMm: 10420, driftPrKmOere: 349,
    kapacitet: { m3: 47, kg: 11500 },
    kmStand: 184600, naesteServiceMs: NU + 26 * D, synMs: NU + 205 * D,
    tachografNr: "TG-41552", securityLevel: "normal",
  },

  /* --- Busser og minibus --------------------------------------------- */
  {
    /* Bus: saeder frem for kapacitet. En turistbus' bagagerum i m³ er ikke
       det man disponerer efter — passagerantallet er. Se ART_FELTER. */
    id: "kt-b12", kaldenavn: "Bus 12", navn: "Volvo 9700 turistbus",
    registrering: "DE 22 111", art: "bus", status: "aktiv",
    hjemsted: STED.vejle, naesteServiceKm: 415400,
    laengdeMm: 13100, driftPrKmOere: 268,
    saeder: 53,
    kmStand: 412300, naesteServiceMs: NU + 17 * D, synMs: NU + 88 * D,
    tachografNr: "TG-42211", securityLevel: "normal",
  },
  {
    id: "kt-b16", kaldenavn: "Bus 16", navn: "Setra S 516 HDH",
    registrering: "DE 33 222", art: "bus", status: "aktiv",
    hjemsted: STED.odense, naesteServiceKm: 229100,
    laengdeMm: 13200, driftPrKmOere: 274,
    saeder: 57,
    kmStand: 226800, naesteServiceMs: NU + 44 * D, synMs: NU + 152 * D,
    tachografNr: "TG-43322", securityLevel: "normal",
  },
  {
    /* Minibus er sin EGEN art, ikke en lille bus. D1 og ikke D, og en
       færgetakst der ligger mellem varevogn og bus. Rundes den til nogen af
       dem, bliver enten kørekortkravet eller taksten forkert. */
    id: "kt-m03", kaldenavn: "Minibus 3", navn: "Mercedes Sprinter 519",
    registrering: "DE 44 555", art: "minibus", status: "aktiv",
    hjemsted: STED.odense, naesteServiceKm: 98750,
    laengdeMm: 7390, driftPrKmOere: 212,
    saeder: 16,
    kmStand: 96200, naesteServiceMs: NU + 63 * D, synMs: NU + 41 * D,
    securityLevel: "normal",
  },

  /* --- Varevogn, scooter, truck -------------------------------------- */
  {
    id: "kt-v21", kaldenavn: "Varevogn 21", navn: "VW Crafter 35",
    registrering: "DE 66 777", art: "varevogn", status: "aktiv",
    hjemsted: STED.kolding, naesteServiceKm: 76400,
    laengdeMm: 5986, driftPrKmOere: 178,
    kapacitet: { m3: 14, kg: 1400 },
    kmStand: 74300, naesteServiceMs: NU + 35 * D, synMs: NU + 12 * D,
    securityLevel: "normal",
  },
  {
    id: "kt-s01", kaldenavn: "Scooter 1", navn: "Piaggio Liberty 125",
    registrering: "DE 99 001", art: "scooter", status: "udeAfDrift",
    hjemsted: STED.aalborg, naesteServiceKm: 8400,
    laengdeMm: 1885, driftPrKmOere: 42,
    kmStand: 8400, naesteServiceMs: NU - 12 * D,
    securityLevel: "normal",
  },
  {
    /* Kører på matriklen: intet syn, ingen tachograf. Registreringen er et
       internt nummer — feltet findes, kravet om en nummerplade gør ikke. */
    id: "kt-t02", kaldenavn: "Truck 2", navn: "Linde H30 D",
    registrering: "INT-T02", art: "truck", status: "aktiv",
    hjemsted: STED.kolding, naesteServiceKm: 4600,
    laengdeMm: 2510, driftPrKmOere: 118,
    kapacitet: { m3: 0, kg: 3000 },
    kmStand: 4120, naesteServiceMs: NU + 20 * D,
    securityLevel: "normal",
  },

  /* --- Påhængt materiel ---------------------------------------------- */
  {
    /* Ingen kmStand: der er ingen motor. Men eget registreringsnummer, eget
       syn og egne dæk — derfor en selvstændig enhed og ikke et felt på
       trækkeren. Kan reserveres alene, men ikke disponeres alene. */
    id: "kt-tr41", kaldenavn: "Trailer 41", navn: "Krone SDP 27 gardintrailer",
    registrering: "DE 41 100", art: "trailer", status: "aktiv",
    hjemsted: STED.kolding,
    laengdeMm: 13620, driftPrKmOere: 88,
    kapacitet: { m3: 92, kg: 24000 },
    naesteServiceMs: NU + 30 * D, synMs: NU + 55 * D,
    securityLevel: "normal",
  },
  {
    id: "kt-tr42", kaldenavn: "Trailer 42", navn: "Schmitz S.KO køletrailer",
    registrering: "DE 42 200", art: "trailer", status: "vaerksted",
    hjemsted: STED.aalborg,
    laengdeMm: 13600, driftPrKmOere: 132,
    kapacitet: { m3: 86, kg: 22000 },
    naesteServiceMs: NU + 6 * D, synMs: NU + 33 * D,
    securityLevel: "normal",
  },
  {
    id: "kt-ph07", kaldenavn: "Påhæng 7", navn: "Kel-Berg 3-akslet kærre",
    registrering: "DE 70 300", art: "paahaeng", status: "skrottet",
    hjemsted: STED.vejle,
    laengdeMm: 9450, driftPrKmOere: 64,
    kapacitet: { m3: 38, kg: 9000 },
    naesteServiceMs: NU - 320 * D, synMs: NU - 290 * D,
    securityLevel: "normal",
    afgangMs: NU - 150 * D, afgangAarsag: "Skrottet efter rustskade i chassis",
  },
];

/** Opslag på kaldenavn — det er dét Dashboard og Bookingopsætning bruger. */
export const demoKoeretoej = (kaldenavn) =>
  DEMO_KOERETOEJER.find((k) => k.kaldenavn === kaldenavn) || null;

export const demoKoeretoejId = (id) =>
  DEMO_KOERETOEJER.find((k) => k.id === id) || null;

/* Tællinger, så skærmen og selvkontrollen regner ens. */
export const demoAntal = (status) =>
  DEMO_KOERETOEJER.filter((k) => k.status === status).length;

export const demoServiceInden30 = (nu = Date.now()) =>
  DEMO_KOERETOEJER.filter(
    (k) => k.naesteServiceMs != null && k.naesteServiceMs - nu < 30 * D
  ).length;

/* ---- Selvkontrol ------------------------------------------------------
 *
 * Den her er grunden til at demo-personale.js virkede, og den skal med i hver
 * ny demo-fil. Den retter ingenting — den siger til, i dev, før en skærm når
 * at vise et tal der modsiger sig selv.
 *
 * ⚠ BEMÆRK HVAD DER *IKKE* KAN KONTROLLERES HER, og hvorfor.
 *
 * demo-personale kunne sammenlignes direkte med DEMO_KPI, fordi
 * kompetencerUdloeber er ÉT tal: staben er én, og beslutning 19 gjorde feltet
 * ens under gods og bus. Flådens tal er det ikke — kpi/ siger 42 aktive i gods
 * og 18 i bus. Men et køretøj har ingen division (beslutning 19), så rosteren
 * kan ikke deles op og kan derfor ikke ramme nogen af de to tal.
 *
 * Det er ikke en mangel ved datasættet. Det er beslutning 19's åbne spørgsmål
 * — om hele Gods/Bus-toggle'en holder — der stikker op gennem demo-data, og
 * det løses ikke her.
 *
 * Det der KAN kontrolleres, er at rosteren aldrig påstår mere end platformen:
 * et udsnit må være mindre end totalen, aldrig større. Rammer man loftet, er
 * det enten fordi nogen har tilføjet for mange enheder, eller fordi kpi/ er
 * skruet ned — og begge dele skal siges højt.
 */
if (import.meta.env?.DEV) {
  /* --- Formkrav reglerne håndhæver. Fanges her, før en skrivning fejler. --- */
  for (const k of DEMO_KOERETOEJER) {
    if ("division" in k) {
      console.warn(
        `demo-flaade: ${k.id} har en division. Beslutning 19 — reglerne afviser ` +
        `feltet på koeretoejer/ med .validate: false, så posten kan ikke gemmes.`
      );
    }
    if (!Number.isInteger(k.laengdeMm) || k.laengdeMm <= 0) {
      console.warn(
        `demo-flaade: ${k.id} har laengdeMm=${k.laengdeMm}. Skal være et positivt ` +
        `INTEGER i millimeter — en float ved en færgetakstgrænse er en fejl der venter.`
      );
    }
    if (!ENHEDSART[k.art]) console.warn(`demo-flaade: ${k.id} har ukendt art "${k.art}".`);
    if (!KOERETOEJ_STATUS[k.status]) console.warn(`demo-flaade: ${k.id} har ukendt status "${k.status}".`);

    /* Et felt arten ikke har, må ikke stå på posten. Står der en kmStand på en
       trailer, begynder en skærm at vise den — og så er "ingen motor" blevet
       til "ingen har tastet den". */
    for (const felt of [FELT.kmStand, FELT.saeder, FELT.kapacitet, FELT.tachografNr, FELT.synMs]) {
      if (k[felt] != null && !harFelt(k.art, felt)) {
        console.warn(
          `demo-flaade: ${k.id} (${k.art}) har ${felt}, men arten har ikke feltet. ` +
          `Se ART_FELTER i flaade.js.`
        );
      }
    }
  }

  /* --- Dækning: alle ni arter skal være repræsenteret. --- */
  const manglendeArter = ALLE_ARTER.filter((a) => !DEMO_KOERETOEJER.some((k) => k.art === a));
  if (manglendeArter.length) {
    console.warn(
      `demo-flaade: ingen enheder med arten ${manglendeArter.join(", ")}. ` +
      `Rosteren skal dække alle ni, ellers kan feltskemaet ikke afprøves.`
    );
  }

  /* --- Loftet mod kpi/. Se noten ovenfor for hvorfor det er et loft og ikke
         en lighed. DEMO_KPI importeres statisk fra demo-kpi.js — den har ingen
         React i sig, så den samme kontrol kan køre i test/flaade.test.mjs. --- */
  const total = (felt) =>
    (DEMO_KPI.gods?.flaade?.[felt] || 0) + (DEMO_KPI.bus?.flaade?.[felt] || 0);

  const loft = [
    ["aktive", demoAntal("aktiv")],
    ["udeAfDrift", demoAntal("udeAfDrift")],
    ["paaVaerksted", demoAntal("vaerksted")],
    ["serviceInden30", demoServiceInden30()],
  ];

  for (const [felt, iRosteren] of loft) {
    const iAlt = total(felt);
    if (iRosteren > iAlt) {
      console.warn(
        `demo-flaade: rosteren har ${iRosteren} enheder i "${felt}", men kpi/ siger ${iAlt} ` +
        `i hele flåden (gods + bus). Et udsnit kan ikke være større end totalen — ` +
        `Flåde ville vise et nøgletal der modsiger tabellen under det.`
      );
    }
  }
}

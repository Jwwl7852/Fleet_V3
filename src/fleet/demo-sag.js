/* src/fleet/demo-sag.js
 * Demo-sager til fase 0 af beslutning 20. Én værkstedssag, én facility-sag.
 *
 * FORMEN ER NODENS, IKKE SKÆRMENS — samme regel som demo-personale.js.
 * Posterne herunder ser ud præcis som tenants/<t>/sager/<sagId> og
 * tenants/<t>/sensitive/sager/<sagId>/… gør i ARKITEKTUR.md. Den dag der
 * ligger rigtige data i DEV, skal Sagsvisning ikke laves om; demo-sættet skal
 * bare falde væk.
 *
 * ⚠ BEMÆRK DELINGEN, den er ikke kosmetisk:
 *   sag.*            general — nummer, tilstand, parter, tællere. Kan listes.
 *   sag.beskeder     hører i sensitive/. Brødtekst fra internettet.
 *   sag.karantaene   hører i sensitive/. Og den er IKKE en del af tråden.
 *   sag.aftale       strukturen i general, den citerede sætning i sensitive.
 * Se beslutning 17 og 20 i BESLUTNINGER.md.
 *
 * BILEN KOMMER FRA demo-flaade.js. Bil 104 er kt-104, en Mercedes Actros 1845
 * med registrering DE 45 678 — ét sted, ét nummer. Den stod her med AB 12 345
 * og i Bookingopsætning med DE 45 678, hvilket er beslutning 6's 84-mod-83 på
 * en nummerplade. Opfind ikke en bil her; slå den op i rosteren.
 *
 * SÆTTET ER TEGNET TIL AT VISE MEKANISMEN, IKKE ET LYKKELIGT FORLØB.
 * Derfor er der med vilje én besked i karantæne og én vedhæftning der ikke er
 * scannet færdig. Et demo-sæt hvor alt er grønt, lærer den næste udvikler at
 * de to tilstande er kanttilfælde — de er hovedsagen.
 */
import {
  AFSENDER_STATUS, VEDHAEFTNING_STATUS, sagsnummerFraEmne, vurderAfsender,
} from "./sager.js";

/* Faste tidspunkter, ikke Date.now()-forskydninger. Aftalen i infografikken
   er 18-08-2026 kl. 08.00, og en demo hvor datoen flytter sig, kan ikke
   sammenlignes med den. Måneden er 0-indekseret: 7 = august. */
const T = (d, t, m = 0) => new Date(2026, 7, d, t, m).getTime();

/* Vores egen afsender. Bruges også af selvkontrollen nedenfor: en mail fra
   vores eget domæne skal vurderes 'kendt' uden at stå på parter[]. */
export const DEMO_EGNE_DOMAENER = ["nordvest-transport.dk"];

/* ---- FLT-2026-00381 — værkstedssag ---------------------------------- */

const FLT = {
  id: "sag-flt-381",
  nummer: "FLT-2026-00381",
  art: "fleet",
  tilstand: "aaben",
  emne: "Bil 104 – serviceeftersyn 30.000 km",
  modul: "flaade",
  objektType: "koeretoej",
  objektId: "kt-104",
  objektLabel: "Bil 104",
  modpartNavn: "Mercedes Greve",
  parter: ["service@mercedes-greve.dk"],
  securityLevel: "normal",
  oprettetMs: T(7, 9, 10),
  sidsteBeskedMs: T(8, 16, 20),
  antalBeskeder: 4,
  antalKarantaene: 1,

  /* Strukturen i general — ingen fritekst. En liste kan vise at der ER en
     aftale, og hvornår, uden at hente noget følsomt. */
  harAftale: true,
  aftaleTilstand: "aftalt",
  aftaleFraMs: T(18, 8, 0),

  /* --- sensitive/sager/<id>/aftaleforslag/<id> --- */
  aftale: {
    id: "aft-1",
    tilstand: "aftalt",
    fra: T(18, 8, 0),
    til: T(18, 16, 0),
    sted: "Mercedes Greve",
    ressourceType: "koeretoej",
    ressourceId: "kt-104",
    /* Sætningen maskinen læste datoen ud af. Den SKAL stå ved siden af
       feltet i UI'et — ellers kan mennesket ikke se hvad der blev gættet. */
    udtrukketFra: "b-2",
    udtrukketSaetning: "Vi kan tage bilen 18/8 kl. 08.00, den er nok klar igen sidst på dagen.",
    bekraeftetAf: "René Thomsen",
    bekraeftetMs: T(8, 8, 5),
  },

  /* --- sensitive/sager/<id>/beskeder/<id> --- */
  beskeder: [
    {
      id: "b-1",
      ms: T(7, 9, 14),
      retning: "udgaaende",
      afsender: "drift@nordvest-transport.dk",
      afsenderNavn: "René Thomsen",
      modtagere: ["service@mercedes-greve.dk"],
      emne: "[FLT-2026-00381] Bil 104 – serviceeftersyn 30.000 km",
      tekst:
        "Hej\n\nBil 104 (Mercedes Actros 1845, reg. DE 45 678) skal til 30.000 km-eftersyn. " +
        "Vi har den ledig fra uge 34. Hvornår kan I tage den ind?\n\nVenlig hilsen\nRené Thomsen",
      afsenderStatus: AFSENDER_STATUS.kendt,
      dmarc: "pass",
      vedhaeftninger: [],
    },
    {
      id: "b-2",
      ms: T(7, 14, 32),
      retning: "indgaaende",
      afsender: "service@mercedes-greve.dk",
      afsenderNavn: "Mercedes Greve – Service",
      modtagere: ["drift@nordvest-transport.dk"],
      emne: "Re: [FLT-2026-00381] Bil 104 – serviceeftersyn 30.000 km",
      tekst:
        "Hej René\n\nVi kan tage bilen 18/8 kl. 08.00, den er nok klar igen sidst på dagen. " +
        "Vedhæftet er vores tilbud på eftersynet.\n\nMvh\nMercedes Greve",
      afsenderStatus: AFSENDER_STATUS.kendt,
      dmarc: "pass",
      vedhaeftninger: [
        {
          id: "v-1",
          filnavn: "Tilbud-serviceeftersyn.pdf",
          stoerrelse: 184320,
          status: VEDHAEFTNING_STATUS.ren,
          scannetMs: T(7, 14, 33),
        },
      ],
    },
    {
      id: "b-3",
      ms: T(8, 8, 5),
      retning: "udgaaende",
      afsender: "drift@nordvest-transport.dk",
      afsenderNavn: "René Thomsen",
      modtagere: ["service@mercedes-greve.dk"],
      emne: "Re: [FLT-2026-00381] Bil 104 – serviceeftersyn 30.000 km",
      tekst: "Det passer fint. Vi kommer med bilen 18/8 kl. 08.00.\n\nMvh\nRené",
      afsenderStatus: AFSENDER_STATUS.kendt,
      dmarc: "pass",
      vedhaeftninger: [],
    },
    {
      id: "b-4",
      ms: T(8, 11, 47),
      retning: "indgaaende",
      afsender: "service@mercedes-greve.dk",
      afsenderNavn: "Mercedes Greve – Service",
      modtagere: ["drift@nordvest-transport.dk"],
      emne: "Re: [FLT-2026-00381] Bil 104 – serviceeftersyn 30.000 km",
      tekst: "Noteret. Her er udkast til arbejdsseddel.\n\nMvh\nMercedes Greve",
      afsenderStatus: AFSENDER_STATUS.kendt,
      dmarc: "pass",
      vedhaeftninger: [
        {
          id: "v-2",
          filnavn: "Arbejdsseddel-udkast.pdf",
          stoerrelse: 96256,
          /* Scanneren er ikke færdig. Der må ikke tegnes et downloadlink,
             og status må ikke drifte mod "nok i orden". */
          status: VEDHAEFTNING_STATUS.afventerScan,
          scannetMs: null,
        },
      ],
    },
  ],

  /* --- sensitive/sager/<id>/karantaene/<id> ---
     LIGGER IKKE I beskeder[]. Den vises ikke i tråden, og det er kontrollen:
     rendereres den gråtonet inline, læser mennesket den og handler på den.

     Bemærk hvorfor den er i karantæne. DMARC er 'pass' — men DMARC beviser kun
     at afsenderen ejer det domæne han skriver fra. Domænet her ER et andet
     (…-service.dk mod …-greve.dk), og det står ikke som part på sagen. Præcis
     sådan ser et fakturasnyderi ud: et gyldigt sagsnummer, et domæne der
     ligner, og nye kontooplysninger. */
  karantaene: [
    {
      id: "k-1",
      ms: T(8, 16, 20),
      retning: "indgaaende",
      afsender: "faktura@mercedes-greve-service.dk",
      afsenderNavn: "Mercedes Greve Service A/S",
      modtagere: ["sag@nordvest-transport.fleetcontrol.dk"],
      emne: "Re: [FLT-2026-00381] Bil 104 – ændrede betalingsoplysninger",
      tekst:
        "Bemærk at vi har skiftet bankforbindelse. Fremtidige betalinger bedes " +
        "indsat på konto 9860-4471902233.",
      afsenderStatus: AFSENDER_STATUS.karantaene,
      dmarc: "pass",
      aarsag: "faktura@mercedes-greve-service.dk står ikke som part på sagen.",
      vedhaeftninger: [
        {
          id: "v-3",
          filnavn: "Kontoændring.pdf",
          stoerrelse: 51200,
          status: VEDHAEFTNING_STATUS.afventerScan,
          scannetMs: null,
        },
      ],
    },
  ],

  /* --- Aktiviteter. Hvad SYSTEMET gjorde — ikke hvad folk skrev. ---
     Fritekst fra mails hører ikke her, og slet ikke i auditposten:
     `emne` står ikke på LOGBARE_FELTER, og det skal det ikke komme til. */
  aktiviteter: [
    { ms: T(7, 9, 10), handling: "Sag oprettet", detalje: "FLT-2026-00381 · Bil 104", af: "René Thomsen" },
    { ms: T(7, 9, 14), handling: "Mail sendt", detalje: "service@mercedes-greve.dk", af: "René Thomsen" },
    { ms: T(7, 14, 32), handling: "Svar modtaget", detalje: "Kendt afsender", af: "System" },
    { ms: T(7, 14, 33), handling: "Vedhæftning scannet", detalje: "Tilbud-serviceeftersyn.pdf · ren", af: "System" },
    { ms: T(7, 15, 2), handling: "Aftaleforslag udtrukket", detalje: "18-08-2026 kl. 08.00 · afventer bekræftelse", af: "System" },
    { ms: T(8, 8, 5), handling: "Aftale bekræftet", detalje: "18-08-2026 kl. 08.00 · Mercedes Greve", af: "René Thomsen" },
    { ms: T(8, 11, 47), handling: "Svar modtaget", detalje: "Kendt afsender · 1 vedhæftning afventer scanning", af: "System" },
    { ms: T(8, 16, 20), handling: "Besked sat i karantæne", detalje: "Ukendt afsender · ikke lagt på tråden", af: "System" },
  ],
};

/* ---- FAC-2026-00127 — facility-sag ----------------------------------- */

/* Identisk opbygning. Det er meningen: forskellen på de to arter er præfiks,
   counter og hvad knappen hedder — ikke skærmen. */
const FAC = {
  id: "sag-fac-127",
  nummer: "FAC-2026-00127",
  art: "facility",
  tilstand: "afventerSvar",
  emne: "Port 3 – porten lukker langsomt",
  modul: "facility",
  objektType: "facilityAktiv",
  objektId: "fa-port3",
  objektLabel: "Port 3",
  modpartNavn: "Crawford Døre & Porte",
  parter: ["service@crawford.dk"],
  securityLevel: "normal",
  oprettetMs: T(6, 10, 40),
  sidsteBeskedMs: T(6, 10, 44),
  antalBeskeder: 1,
  antalKarantaene: 0,
  harAftale: false,
  aftaleTilstand: null,
  aftaleFraMs: null,
  aftale: null,

  beskeder: [
    {
      id: "fb-1",
      ms: T(6, 10, 44),
      retning: "udgaaende",
      afsender: "facility@nordvest-transport.dk",
      afsenderNavn: "Benjamin Krogh",
      modtagere: ["service@crawford.dk"],
      emne: "[FAC-2026-00127] Port 3 – porten lukker langsomt",
      tekst:
        "Hej\n\nPort 3 i hal B lukker meget langsomt og står nogle gange helt stille " +
        "på halvvejs. Kan I komme og se på den i denne uge?\n\nMvh\nBenjamin Krogh",
      afsenderStatus: AFSENDER_STATUS.kendt,
      dmarc: "pass",
      vedhaeftninger: [],
    },
  ],
  karantaene: [],
  aktiviteter: [
    { ms: T(6, 10, 40), handling: "Sag oprettet", detalje: "FAC-2026-00127 · Port 3", af: "Benjamin Krogh" },
    { ms: T(6, 10, 44), handling: "Mail sendt", detalje: "service@crawford.dk", af: "Benjamin Krogh" },
  ],
};

export const DEMO_SAGER = [FLT, FAC];

export const demoSagerFor = (modul) => DEMO_SAGER.filter((s) => s.modul === modul);

export const demoSag = (nummer) => DEMO_SAGER.find((s) => s.nummer === nummer) || null;

/* ---- Selvkontrol ------------------------------------------------------
 *
 * Datasættet skal BEVISE politikken, ikke illustrere den. Kontrollen kører
 * kun i dev, retter ingenting og siger til — samme mønster som
 * demo-personale.js.
 *
 * Den fanger tre ting, og alle tre er fejl nogen kommer til at lave:
 *   1. En besked i beskeder[] der ikke ville blive vurderet 'kendt'. Det er
 *      hele modellen sat på hovedet — så ligger uautentificeret input i
 *      tråden.
 *   2. En besked i karantaene[] der faktisk ER kendt. Så er karantænen støj,
 *      og støj bliver klikket væk.
 *   3. Et emnefelt hvor sagsnummeret ikke kan genkendes. Så ville beskeden
 *      i virkeligheden aldrig være landet på sagen.
 */
if (import.meta.env?.DEV) {
  for (const sag of DEMO_SAGER) {
    const ctx = { parter: sag.parter, egneDomaener: DEMO_EGNE_DOMAENER };

    for (const b of sag.beskeder) {
      const { status } = vurderAfsender({ envelopeAfsender: b.afsender, dmarc: b.dmarc, ...ctx });
      if (status !== AFSENDER_STATUS.kendt) {
        console.warn(
          `demo-sag: ${sag.nummer}/${b.id} ligger i tråden, men vurderAfsender() siger "${status}". ` +
          `En besked der ikke er kendt, må ikke stå i beskeder[] — den hører i karantaene[].`
        );
      }
      const fundet = sagsnummerFraEmne(b.emne);
      if (fundet?.nummer !== sag.nummer) {
        console.warn(
          `demo-sag: emnet på ${sag.nummer}/${b.id} giver ${fundet?.nummer ?? "intet nummer"}. ` +
          `Beskeden ville aldrig være landet på sagen.`
        );
      }
    }

    for (const k of sag.karantaene) {
      const { status } = vurderAfsender({ envelopeAfsender: k.afsender, dmarc: k.dmarc, ...ctx });
      if (status === AFSENDER_STATUS.kendt) {
        console.warn(
          `demo-sag: ${sag.nummer}/${k.id} står i karantæne, men afsenderen er kendt. ` +
          `En karantæne der rammer kendte afsendere, bliver klikket væk.`
        );
      }
    }

    /* Tællerne i general skal svare til det der ligger i sensitive/ — ellers
       viser listen et andet tal end sagen selv. */
    if (sag.antalBeskeder !== sag.beskeder.length || sag.antalKarantaene !== sag.karantaene.length) {
      console.warn(
        `demo-sag: ${sag.nummer} siger ${sag.antalBeskeder}/${sag.antalKarantaene} beskeder/karantæne, ` +
        `men har ${sag.beskeder.length}/${sag.karantaene.length}.`
      );
    }
  }
}

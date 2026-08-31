/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/leverandoerportal-regler.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/* src/fleet/leverandoerportal-regler.js
 * Leverandørportalens egen, snævre regelmaskine.
 *
 * ⚠ ADSKILT FRA DEN INTERNE OPGAVE_OVERGANGE, MED VILJE. Den fulde
 * tilstandsmaskine (opgaveplan-regler.js) håndhæver stadig den hele
 * sandhed om en opgave — denne fil siger kun hvilken DELMÆNGDE af den en
 * EKSTERN leverandørbruger overhovedet må røre. En leverandør kan ALDRIG
 * sætte `udfoert` eller `annulleret`: tillægskravets §10/§11 er eksplicit
 * — han melder kun SIN del af arbejdet færdig, han lukker aldrig den
 * interne Fleet-sag selv. Se functions/index.js's kraevLeverandoerGrant()
 * for hvorfor en ekstern bruger slet ikke har et {tenant, rolle, perms}
 * at holde denne op imod.
 *
 * INGEN FIREBASE-IMPORT. Ren kerne — Cloud Function'en
 * (leverandoerStatusOpdater/leverandoerPortalOpgaver) og en fremtidig
 * portal-UI skal bruge NØJAGTIG samme regler, ikke en afskrift hver. Se
 * samme disciplin i opgaveplan-regler.js's eget hoved.
 */

/**
 * Kun de opgave-tilstande en ekstern leverandørbruger overhovedet må sætte.
 *
 * ⚠ TO-LAGS HÅNDHÆVELSE. Denne liste afgør hvad en EKSTERN bruger kan nå;
 * den fulde OPGAVE_OVERGANGE prøves DEREFTER som ekstra lag i selve
 * Cloud Function'en, samme maskine skærmen og opgavestatus bruger. Et
 * fremtidigt hul i det ene lag fanges af det andet.
 */
export const LEVERANDOER_TILLADTE_SKIFT = {
  planlagt: ["igang"],
  afventer: ["igang"],
  igang: ["klar_til_afhentning"],
};

export const kanLeverandoerSkifte = (fraStatus, tilStatus) =>
  (LEVERANDOER_TILLADTE_SKIFT[fraStatus] || []).includes(tilStatus);

/* ⚠ "AKTIVE"/"AFSLUTTEDE" ER PORTALENS EGEN INDDELING (§6: "Aktive" /
   "Afsluttede" faner), ikke opgavens fulde statuskatalog rendret råt —
   samme skel som Turplanens stop-tilstande er en FORTOLKNING af
   rutestatus, ikke rutestatus selv. annulleret hører under "afsluttede",
   ikke fordi arbejdet blev udført, men fordi opgaven ikke længere er
   noget leverandøren skal handle på — en forsvundet opgave uden
   forklaring ville forvirre mere end en synlig, annulleret én.
   ⚠ OG "indberettet" ER MED VILJE I INGEN AF DE TO LISTER. §5 i
   tillægskravet: en opgave er kun synlig for leverandøren "i en status
   hvor leverandørsamarbejde er relevant" — en opgave der endnu ikke er
   planlagt, har intet konkret at vise ham endnu. fordelPortalOpgaver()
   dropper den derfor stille, ikke som en fejl, men som den tilsigtede
   femte mulighed: hverken aktiv eller afsluttet, bare endnu ikke klar
   til at blive vist. */
export const LEV_PORTAL_AKTIVE = new Set(["planlagt", "afventer", "igang", "klar_til_afhentning"]);
export const LEV_PORTAL_AFSLUTTEDE = new Set(["udfoert", "annulleret"]);

/**
 * ⚠ INGEN INTERNE FELTER, INGEN TEKNISKE ID'ER. Portalen skal bevidst
 * være meget enklere end kontorprogrammet (§6/§14/§17) — `koeretoejId`
 * slås op og erstattes af et NAVN her, aldrig sendt råt til en klient der
 * ikke har (og ikke skal have) læseadgang til `koeretoejer/`.
 *
 * ⚠ F.2 — dokumenter FILTRERES HER, IKKE KUN I DOWNLOAD-FUNKTIONEN. Et
 * dokument der hverken er "aktiv" eller `synligForLeverandoer`, optræder
 * ikke engang i LISTEN — leverandoerDokumentDownloadLink's egen kontrol
 * (functions/index.js) er dermed forsvar i dybden, ikke den eneste
 * spærring. Kun METADATA sendes med (intet storagePath, intet link) —
 * selve linket udstedes først når leverandøren beder om ÉT bestemt
 * dokument, samme adskillelse som fakturabilagenes Bilag/hentLink.
 */
export function leverandoerSynligOpgave(id, o, koeretoejer) {
  const koe = (koeretoejer && koeretoejer[o.koeretoejId]) || {};
  return {
    id,
    koeretoejNavn: koe.kaldenavn || koe.navn || null,
    koeretoejRegistrering: koe.registrering || null,
    arbejdstype: o.arbejdstype || null,
    beskrivelse: o.beskrivelse || null,
    startMs: Number.isFinite(o.startMs) ? o.startMs : null,
    prioritet: o.prioritet || null,
    status: o.status,
    /* ⚠ HELE HISTORIKKEN, IKKE KUN DET SIDSTE. §8: "overskriv ikke det
       gamle uden audit/historik" — hvert tilbud er sit eget push()-barn
       i noden, og portalen viser dem alle, ældste først (§9's "Modtaget
       ..."-visning læser det seneste af listen, ikke et separat felt). */
    tilbud: Object.entries(o.leverandoertilbud || {})
      .map(([tilbudId, t]) => ({
        id: tilbudId, beloebOere: t.beloebOere, valuta: t.valuta,
        kommentar: t.kommentar || null,
        forventetFaerdigMs: Number.isFinite(t.forventetFaerdigMs) ? t.forventetFaerdigMs : null,
        indsendtMs: t.indsendtMs, status: t.status,
      }))
      .sort((a, b) => (a.indsendtMs || 0) - (b.indsendtMs || 0)),
    dokumenter: Object.entries(o.dokumenter || {})
      .filter(([, d]) => d.status === "aktiv" && d.synligForLeverandoer === true)
      .map(([dokumentId, d]) => ({
        id: dokumentId, originaltFilnavn: d.originaltFilnavn,
        valideretMime: d.valideretMime, stoerrelse: d.stoerrelse,
        oprettetTid: d.oprettetTid,
      }))
      .sort((a, b) => (a.oprettetTid || 0) - (b.oprettetTid || 0)),
  };
}

/**
 * fordelPortalOpgaver(opgaverEntries, leverandoerId, koeretoejer)
 *   → { aktive: [...], afsluttede: [...] }
 *
 * opgaverEntries er Object.entries() af HELE tenantens opgave-node —
 * filtreringen på leverandoerId sker HER, server-side i Cloud Function'en
 * der kalder denne, aldrig som et klient-forespørgselsparameter.
 */
export function fordelPortalOpgaver(opgaverEntries, leverandoerId, koeretoejer) {
  const mine = opgaverEntries
    .filter(([, o]) => o.leverandoerId === leverandoerId)
    .map(([id, o]) => leverandoerSynligOpgave(id, o, koeretoejer));
  return {
    aktive: mine.filter((o) => LEV_PORTAL_AKTIVE.has(o.status)),
    afsluttede: mine.filter((o) => LEV_PORTAL_AFSLUTTEDE.has(o.status)),
  };
}

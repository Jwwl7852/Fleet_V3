/* src/fleet/servicepunkter.js
 * Fleet §9.10 Servicebog — konfigurerbare, tilbagevendende servicepunkter pr.
 * enhed (syn, service, dæk, lovpligtige eftersyn, egne kontrolpunkter).
 * INGEN REACT — samme opdeling som driftskalender.js og gitter.js, så
 * intervalregningen kan prøves uden en emulator.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ INGEN NY NODE. Punkterne bor på `koeretoejer/$id/servicepunkter/$id`,
 * samme post som resten af enhedens stamdata (hjemsted, naesteServiceMs,
 * synMs). "Ingen parallel serviceopgavemodel uden verificeret behov"
 * (produktejer-review 2026-09-01, §9.10-fuldførelsen) — en ny top-level node
 * med sin egen modulklausul, permission og Cloud Function ville være netop
 * den parallelmodel kravet advarer imod, for et regnestykke der ikke rører
 * andre noder. Skrivningen går derfor gennem den ALLEREDE eksisterende
 * `koeretoejer.skriv`-rettighed og `skriv.js` — ingen ny Cloud Function.
 *
 * ⚠ OG DET ERSTATTER IKKE `naesteServiceMs`/`synMs`. De to felter er
 * ÉT-punkts-pr-art-genveje som Enheder-tabellen og k.flaade.serviceInden30
 * allerede læser (se kpi-aggregering.js). At lade Servicebogens liste
 * overskrive dem ville kræve en migrering af begge forbrugere i samme
 * ombæring — ikke gjort her. De to lever side om side: de gamle felter er
 * "hvornår er NÆSTE service, ét tal", den her liste er "hvilke punkter har
 * enheden, og hvornår er hvert af dem sidst udført og næste gang forfaldent".
 * ═══════════════════════════════════════════════════════════════════════════
 */

const DAG = 86400000;

export const SERVICEPUNKT_TYPE = {
  syn:          { label: "Syn" },
  service:      { label: "Service" },
  daek:         { label: "Dæk" },
  lovpligtigt:  { label: "Lovpligtigt eftersyn" },
  egen:         { label: "Eget kontrolpunkt" },
};

export const ALLE_SERVICEPUNKT_TYPER = Object.keys(SERVICEPUNKT_TYPE);

/** Hvor langt forude et forfald varsles — samme margin som
 *  k.flaade.serviceInden30 bruger for dato (30 dage); km-siden har intet
 *  forbillede i kpi-aggregering.js, så 1.000 km er sat her og kan justeres. */
export const VARSEL_DAGE = 30;
export const VARSEL_KM = 1000;

/** Kalendermåneder, ikke `+ n * 30 * DAG` — en service hver 6. måned skal
 *  falde på samme dag i måneden, ikke glide med korte og lange måneder. */
export function tilfoejMaaneder(ms, maaneder) {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + maaneder);
  return d.getTime();
}

/**
 * naesteForfaldMs(punkt) → ms | null
 *
 * ⚠ null NÅR PUNKTET ALDRIG ER UDFØRT — ikke "om intervalMaaneder fra nu".
 * Et punkt uden en dato at regne fra har intet forfald at vise; det er en
 * ubesvaret opsætning ("hvornår blev den sidst lavet"), ikke et beregnet nul.
 */
export function naesteForfaldMs(punkt) {
  if (!Number.isFinite(punkt?.intervalMaaneder)) return null;
  if (!Number.isFinite(punkt?.senestUdfoertMs)) return null;
  return tilfoejMaaneder(punkt.senestUdfoertMs, punkt.intervalMaaneder);
}

/** Samme regel, for km-baserede punkter (dæk, lovpligtige km-eftersyn). */
export function naesteForfaldKm(punkt) {
  if (!Number.isFinite(punkt?.intervalKm)) return null;
  if (!Number.isFinite(punkt?.senestUdfoertKm)) return null;
  return punkt.senestUdfoertKm + punkt.intervalKm;
}

export const SERVICEPUNKT_STATUS = {
  forfalden: { label: "Forfalden",           pill: "bad" },
  snart:     { label: "Snart",               pill: "warn" },
  ok:        { label: "OK",                  pill: "ok" },
  ukendt:    { label: "Ikke konfigureret",   pill: "info" },
};

/**
 * servicepunktStatus(punkt, { nu, kmStand }) → nøgle i SERVICEPUNKT_STATUS
 *
 * ⚠ "ukendt" ER IKKE "ok". Et punkt uden interval, eller aldrig udført, kan
 * hverken være forfaldent eller til tiden — samme figur som `udenVarighed` i
 * driftskalender.js. At vise det som OK ville skjule præcis de punkter en
 * værkfører skal konfigurere færdigt.
 */
export function servicepunktStatus(punkt, { nu = Date.now(), kmStand } = {}) {
  const forfaldMs = naesteForfaldMs(punkt);
  const forfaldKm = naesteForfaldKm(punkt);
  if (forfaldMs === null && forfaldKm === null) return "ukendt";

  const kmKendt = Number.isFinite(kmStand);
  const forfaldenNu = (forfaldMs !== null && forfaldMs < nu)
    || (forfaldKm !== null && kmKendt && kmStand >= forfaldKm);
  if (forfaldenNu) return "forfalden";

  const snartNu = (forfaldMs !== null && forfaldMs < nu + VARSEL_DAGE * DAG)
    || (forfaldKm !== null && kmKendt && kmStand >= forfaldKm - VARSEL_KM);
  if (snartNu) return "snart";

  return "ok";
}

/**
 * valideServicepunkt(post) → { felt: besked }
 *
 * ⚠ SPEJLER firebase.rules.json's nestede .validate under
 * koeretoejer/$id/servicepunkter/$id — ikke en selvstændig politik. Er de to
 * uenige, er reglerne rigtige (se CLAUDE.md).
 */
export function valideServicepunkt(post = {}) {
  const f = {};
  if (!post.type || !ALLE_SERVICEPUNKT_TYPER.includes(post.type)) {
    f.type = "Vælg en type.";
  }
  if (!post.label || !String(post.label).trim()) {
    f.label = "Skriv et navn på punktet.";
  }
  const mdr = post.intervalMaaneder;
  const km = post.intervalKm;
  if (mdr != null && !(Number.isFinite(mdr) && mdr > 0)) {
    f.intervalMaaneder = "Skal være et positivt antal måneder.";
  }
  if (km != null && !(Number.isFinite(km) && km > 0)) {
    f.intervalKm = "Skal være et positivt antal kilometer.";
  }
  if (mdr == null && km == null) {
    f.interval = "Angiv mindst ét interval — dato, km, eller begge.";
  }
  return f;
}

/** Bygger en historikpost. Kaldes ved "Meld udført" — se Servicebog.jsx. */
export function byggUdfoerelse({ ms = Date.now(), km = null, kommentar = "", udfoertAf = null } = {}) {
  return {
    udfoertMs: ms,
    udfoertKm: Number.isFinite(km) ? km : null,
    kommentar: kommentar || "",
    udfoertAf: udfoertAf || null,
  };
}

/**
 * alleServicepunkter(koeretoejer, { nu }) → [{ ...punkt, id, koeretoejId, status, naesteForfaldMs, naesteForfaldKm }]
 *
 * ⚠ FLADT UD AF DEN ALLEREDE HENTEDE `koeretoejer`-LISTE — ingen ny
 * forespørgsel. Overblik.jsx, Servicebog.jsx og Oversigt.jsx henter alle
 * `koeretoejer` alligevel; dette er en KLIENTSIDE-udfoldning af data der
 * allerede ligger der, akkurat som driftstal() tæller de lister skærmen
 * allerede har.
 */
export function alleServicepunkter(koeretoejer = [], { nu = Date.now() } = {}) {
  const ud = [];
  for (const kt of koeretoejer) {
    const punkter = kt?.servicepunkter || {};
    for (const [id, p] of Object.entries(punkter)) {
      if (p?.aktiv === false) continue;
      ud.push({
        ...p,
        id,
        koeretoejId: kt.id,
        status: servicepunktStatus(p, { nu, kmStand: kt.kmStand }),
        naesteForfaldMs: naesteForfaldMs(p),
        naesteForfaldKm: naesteForfaldKm(p),
      });
    }
  }
  return ud;
}

/** Sortering til Servicebog/Overblik: forfaldne først, så snart, så resten —
 *  inden for samme status, det nærmeste forfald først. Samme idé som
 *  sorterKoe() i driftskalender.js. */
const STATUS_VAEGT = { forfalden: 0, snart: 1, ok: 2, ukendt: 3 };

export function sorterServicepunkter(punkter = []) {
  return [...punkter].sort((a, b) => {
    const v = STATUS_VAEGT[a.status] - STATUS_VAEGT[b.status];
    if (v !== 0) return v;
    const at = a.naesteForfaldMs ?? Infinity;
    const bt = b.naesteForfaldMs ?? Infinity;
    return at - bt || String(a.id).localeCompare(String(b.id), "da");
  });
}

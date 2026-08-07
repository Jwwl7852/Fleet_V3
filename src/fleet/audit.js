/* src/fleet/audit.js
 * ÉN audit-service. Alle moduler bruger den — den eftermonteres ikke til
 * Booking bagefter.
 *
 * Sti:  audit/<tenantId>/<klasse>/<år>/<måned>/<id>
 *
 * HVORFOR LIGGER DEN IKKE UNDER tenants/<id>/ ?
 * Fordi RTDB's .read KASKADERER og ikke kan indsnævres på et barn. Reglen på
 * tenants/$tenantId giver læseadgang til alt nedenunder, og en log over hvem
 * der har set hvad er selv følsom — den afslører hvilke kunder der bliver
 * kigget på, og af hvem. Som topniveau-node kan den få sin egen læseregel med
 * krav om audit.laes. Flyt den ikke ind under tenants/ for at "rydde op".
 *
 * APPEND-ONLY. audit/ er .write: false for alle, også admin. Skrivning sker
 * kun gennem en Cloud Function med Admin SDK. Der findes derfor INGEN
 * audit.skriv-permission — se noten i permissions.js.
 *
 * Politikken — vokabular, feltallowliste, før/efter, retention — ligger i
 * audit-regler.js uden imports, så Cloud Function'en kan bruge nøjagtig samme
 * kilde. Denne fil er kun transporten.
 */
import { db, kaldFunktion } from "../firebase.js";
import { AUDIT, diff, klasseFor } from "./audit-regler.js";

export {
  AUDIT, diff, klasseFor, LOGBARE_FELTER, RETENTION_MAANEDER, retentionFor, KLASSER,
} from "./audit-regler.js";

const nytId = () =>
  globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/** Binder flere poster fra ÉN brugerhandling sammen. Uden den kan man ikke
 *  genfortælle "hvad skete der", når en godkendelse skriver tre poster. */
export const nytKorrelationsId = nytId;

/* Fejl tælles frem for at kastes. En skærm må ikke gå i stykker fordi loggen
   er nede, og en læsning må ikke blokeres af det — men tavshed er heller ikke
   svaret. Indtil Cloud Function'en findes, stiger tælleren ved hvert kald, og
   det er meningen. */
let _fejl = 0;
let _sendt = 0;
export const auditStatus = () => ({ sendt: _sendt, fejlet: _fejl });

async function send(nyttelast) {
  /* Demo-mode: ingen database, ingen funktion. Skærmene skal virke. */
  if (!db) {
    if (import.meta.env?.DEV) console.debug("[audit, demo]", nyttelast);
    return { ok: true, demo: true };
  }
  try {
    await kaldFunktion("audit", nyttelast);
    _sendt++;
    return { ok: true };
  } catch (e) {
    _fejl++;
    if (import.meta.env?.DEV) {
      console.warn(
        `[audit] kunne ikke skrive "${nyttelast.handling} ${nyttelast.objekt}" ` +
        `(${_fejl} fejlet i alt). Cloud Function'en findes muligvis ikke endnu.`,
        e?.message || e
      );
    }
    return { ok: false, fejl: e };
  }
}

/**
 * audit.log — en ændring.
 *
 * Kaster ALDRIG. Kan kaldes uden await.
 *
 * Serveren sætter selv tenantId, brugerUid, rolle, ms, ip og userAgent ud fra
 * tokenet — de kan ikke sendes med herfra. En klient der selv må oplyse hvem
 * den er, er ikke en audit-log.
 *
 * Serveren filtrerer foer/efter mod LOGBARE_FELTER IGEN.
 */
export function log({ handling, objekt, objektId, foer, efter, korrelationsId, note }) {
  const d = foer || efter ? diff(foer, efter) : null;
  return send({
    handling,
    objekt,
    objektId: objektId ?? null,
    klasse: klasseFor(handling, objekt),
    aendrede: d?.aendrede ?? null,
    foer: d?.foer ?? null,
    efter: d?.efter ?? null,
    korrelationsId: korrelationsId ?? nytId(),
    /* note er til en KORT, ikke-følsom forklaring. Den filtreres ikke, så
       skriv ikke data i den. */
    note: note ?? null,
  });
}

/**
 * audit.laes — en læsning af følsomme data.
 *
 * Det er den del der plejer at mangle, og den RA-kunder spørger om.
 * `antal` er hvor mange poster der blev vist — ikke posterne selv.
 *
 * Kaldes normalt ikke i hånden: brug auditerSom i useListe(), så en skærm
 * ikke kan glemme det.
 */
export function laes({ objekt, objektId, antal, korrelationsId }) {
  return send({
    handling: AUDIT.laes,
    objekt,
    objektId: objektId ?? null,
    klasse: klasseFor(AUDIT.laes, objekt),
    antal: antal ?? null,
    korrelationsId: korrelationsId ?? nytId(),
  });
}

/**
 * audit.adgangNaegtet — et afvist forsøg.
 *
 * Et forsøg der bliver afvist, er ofte det mest interessante i en auditlog.
 *
 * ⚠ Den her er KLIENTRAPPORTERET og dermed svagere end resten: en klient der
 * ikke kalder den, logger ikke. Reglerne afviser stadig, men sporet afhænger
 * af at klienten er ærlig.
 *
 * Rigtig serverlogning af afviste forsøg kræver, at følsomme læsninger går
 * gennem en callable der autoriserer, auditerer og først derefter læser med
 * Admin SDK. Reglerne bliver stående som anden linje. Det hører i
 * Cloud Function-opgaven — se ARKITEKTUR.
 */
export function adgangNaegtet({ objekt, objektId, aarsag, korrelationsId }) {
  return send({
    handling: AUDIT.adgangNaegtet,
    objekt,
    objektId: objektId ?? null,
    klasse: klasseFor(AUDIT.adgangNaegtet, objekt),
    /* aarsag er en kort kode — "permission_denied" — ikke en fejlbesked der
       kan indeholde data. */
    note: aarsag ?? null,
    korrelationsId: korrelationsId ?? nytId(),
  });
}

export default {
  AUDIT, log, laes, adgangNaegtet, diff, klasseFor, nytKorrelationsId, auditStatus,
};

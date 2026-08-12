/* src/fleet/skriv.js
 * ÉN vej ind i databasen. Modulerne kalder aldrig db.ref().set() selv.
 *
 * Det er samme aftale som useListe() for læsning, og af samme grund: skriver
 * tyve skærme hver sin vej, bygger de også hver sin fejlhåndtering — og så er
 * det tilfældigt hvilke af dem der husker at logge, at bruge tenant-stien, og
 * at kunne forklare en afvisning.
 *
 * ⚠ POLITIKKEN LIGGER I skriv-regler.js. Denne fil er kun transporten, præcis
 * som audit.js er det for audit-regler.js. Grunden er praktisk og hård: denne
 * fil importerer firebase.js, som læser import.meta.env og derfor kun kan
 * indlæses af Vite — logik der lå her, kunne ikke prøves i Node.
 *
 * ⚠ DER HÅRDSLETTES ALDRIG. Der er ingen slet() i denne fil, og der skal ikke
 * komme en. Regnskabsdata bliver stående, og reglerne håndhæver det med
 * newData.exists() — en post tages ud af drift med en status og en årsag. Skal
 * noget forsvinde fra en liste, er det et filter, ikke en fjernelse. En prøve
 * fastholder at der ikke findes en vej til det: en funktion der findes,
 * bliver kaldt.
 *
 * ⚠ SERVEREN ER AUTORITETEN. Klientsidig validering findes for at give et
 * hurtigt svar, ikke for at afgøre noget. Reglerne validerer igen, og hvis de
 * to er uenige, er reglerne rigtige.
 */
import { db } from "../firebase.js";
import { log as auditLog, AUDIT, nytKorrelationsId } from "./audit.js";
import { SKRIV, skrivBesked, tolkFejl } from "./skriv-regler.js";

export { SKRIV, skrivBesked, tolkFejl, nyId } from "./skriv-regler.js";

/**
 * gem({ sti, data, foer, objekt, objektId, handling, note })
 *
 * `sti` er FULD sti inkl. tenant — brug `path()` fra useFleet(), så et modul
 * aldrig bygger "tenants/…"-strenge selv og dermed heller ikke kan ramme
 * forkert tenant.
 *
 * `foer` er den gamle post, hvis der er en. Den bruges KUN til auditloggens
 * før/efter — den sendes ikke til databasen.
 *
 * Returnerer { art, ok, besked, fejl }. Kaster ikke: en skærm skal kunne vise
 * hvad der gik galt frem for at gå i stykker.
 */
export async function gem({
  sti, data, foer = null, objekt, objektId = null,
  handling = AUDIT.aendre, note = null, korrelationsId = null,
  formentligGyldig = true,
  /**
   * ⚠ `flet` FINDES FOR DE NODER TO MODULER DELER, og den er ikke en
   * bekvemmelighed.
   *
   * `reolpladser` skrives af BÅDE Turtlebooking (hal · reol · fag · hylde ·
   * plads) og Warehouse (zone · type · status · temperatur). Med `.set()`
   * sender hver formular kun SINE felter — og sletter dermed den andens i
   * tavshed. En lagermedarbejder der rettede en hyldes nummer, ville have
   * nulstillet dens temperatur og taget den ud af karantæne uden at vide det.
   *
   * `flet: true` bruger `update()`, så hver skærm kun rører det den kender.
   * Et felt der skal ryddes, sendes som `null` — præcis som med `set()`.
   *
   * ⚠ DET ER IKKE EN SLETNING. `update()` med null fjerner ét felt, ikke en
   * post; der er stadig ingen vej til at hardslette en post herfra, og
   * `skrivning.test.mjs` holder øje med det.
   */
  flet = false,
}) {
  if (!db) {
    if (import.meta.env?.DEV) console.debug("[skriv, demo]", sti, data);
    return { art: SKRIV.demo, ok: false, besked: skrivBesked(SKRIV.demo), fejl: null };
  }

  try {
    if (flet) await db.ref(sti).update(data);
    else await db.ref(sti).set(data);
  } catch (fejl) {
    const art = tolkFejl(fejl, { formentligGyldig });
    /* ⚠ EN AFVIST SKRIVNING LOGGES OGSÅ. Det er den man vil se bagefter:
       hvem forsøgte hvad, og blev det stoppet. Rummer loggen kun det der
       lykkedes, beskriver den kun de lovlige handlinger. */
    if (art === SKRIV.naegtet) {
      auditLog({
        handling: AUDIT.adgangNaegtet, objekt, objektId,
        korrelationsId, note: "skrivning",
      });
    }
    return { art, ok: false, besked: skrivBesked(art), fejl };
  }

  /* Loggen må ikke kunne vælte skrivningen. audit.log() tæller selv sine
     fejl og kaster ikke — men vi venter heller ikke på den. */
  auditLog({ handling, objekt, objektId, foer, efter: data, korrelationsId, note });

  return { art: SKRIV.ok, ok: true, besked: null, fejl: null };
}

/**
 * Flere skrivninger der hører til ÉN brugerhandling.
 *
 * ⚠ DET ER IKKE EN TRANSAKTION. RTDB kan skrive flere stier atomisk med en
 * multi-path update, men kun under samme rod, og reglerne skal tillade hver
 * sti. Den her binder kun auditposterne sammen med ét korrelationsId, så man
 * bagefter kan genfortælle hvad der skete.
 *
 * Skal to skrivninger være atomiske — en reservation og en etape, et salg og
 * et lagertræk — hører de i en Cloud Function. Se de låste noder i
 * firebase.rules.json.
 */
export async function gemFlere(poster) {
  const korrelationsId = nytKorrelationsId();
  const svar = [];
  for (const p of poster) {
    const r = await gem({ ...p, korrelationsId });
    svar.push(r);
    /* Stopper ved første fejl. Fortsætter man, efterlader man en halv
       ændring uden at nogen bad om det. */
    if (!r.ok) break;
  }
  return { ok: svar.every((r) => r.ok), svar, korrelationsId };
}

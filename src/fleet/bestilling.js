/* src/fleet/bestilling.js
 * Klientvejen til `indkoebsordrer` — beslutning 78, etape 3.
 *
 * ⚠ ÉN VEJ IND. Noden er `.write: false`, og ordren skrives sammen med
 * behovenes tilstand i én `update()`. Det her er indpakningen, så skærmene
 * ikke bygger hver sin fejlhåndtering.
 */
import { kaldFunktion } from "../firebase.js";

const FUNKTION = "ordreskriv";

/**
 * opretBestilling({ leverandoerId, linjer, bestillerId, note })
 *   → { ok, art, besked, data }
 *
 * ⚠ INTET id OG INTET NUMMER. Serveren laver begge dele: et id udefra kunne
 * overskrive en andens ordre, og et nummer udefra ville gøre tælleren til
 * pynt — hele beslutning 8 er at nummeret kommer ét sted fra.
 *
 * ⚠ OG INGEN VARE ELLER ANTAL FRA BEHOVET. Klienten sender `behovId` og den
 * pris der er aftalt; serveren slår behovet op og bygger linjen. Kom varen
 * udefra, kunne ordren bede om noget andet end behovet sagde — og sporet
 * tilbage ville pege på et løfte der ikke blev holdt.
 *
 * ⚠ KASTER ALDRIG. En afvisning er et SVAR, ikke en nedbrudt forbindelse.
 */
export async function opretBestilling({ leverandoerId, linjer = [], bestillerId, note } = {}) {
  if (!leverandoerId) {
    return { ok: false, art: "afvist", besked: "Vælg en leverandør.", data: null };
  }
  if (!linjer.length) {
    return { ok: false, art: "afvist", besked: "Vælg mindst én vare.", data: null };
  }

  try {
    const svar = await kaldFunktion(FUNKTION, {
      leverandoerId,
      linjer: linjer.map((l) => ({
        behovId: l.behovId,
        /* undefined frem for null: en callable DROPPER feltet, og et felt der
           ikke sendes, er noget andet end et felt der sendes tomt. */
        antal: Number.isFinite(l.antal) ? l.antal : undefined,
        prisPrEnhedOere: Number.isInteger(l.prisPrEnhedOere) ? l.prisPrEnhedOere : undefined,
      })),
      bestillerId: bestillerId || undefined,
      note: note || undefined,
    });
    return { ok: true, art: "ok", besked: null, data: svar?.data ?? svar ?? null };
  } catch (e) {
    const kode = String(e?.code || "");
    if (kode.includes("permission-denied")) {
      return { ok: false, art: "naegtet", besked: e?.message || "Du må ikke det her.", data: null };
    }
    /* ⚠ `failed-precondition` ER IKKE EN FEJL I FORMEN. "Varen er allerede
       bestilt" er et svar om VERDEN, ikke om det brugeren skrev — og han skal
       kunne læse forskellen frem for at rette i en formular der er rigtig. */
    if (kode.includes("failed-precondition")) {
      return { ok: false, art: "afvist", besked: e?.message || "Det kan ikke lade sig gøre nu.", data: null };
    }
    if (kode.includes("invalid-argument") || kode.includes("not-found")) {
      return { ok: false, art: "afvist", besked: e?.message || "Bestillingen blev afvist.", data: null };
    }
    return { ok: false, art: "fejl", besked: "Der er ikke forbindelse til serveren.", data: null };
  }
}

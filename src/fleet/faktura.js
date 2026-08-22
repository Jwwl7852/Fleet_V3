/* src/fleet/faktura.js
 * Klientvejen til fakturaen — beslutning 83, Procures trin 4.
 *
 * ⚠ TRE VEJE IND, OG DE SVARER PÅ HVER SIT SPØRGSMÅL:
 *
 *   `matchFaktura()`   → hvilken BESTILLING betaler fakturaen
 *   `skiftFaktura()`   → må den betales (godkendt / afvist / bogført)
 *   `gemKontantkoeb()` → et køb der allerede er betalt
 *
 * De to første er uafhængige med vilje. En faktura kan være matchet og afvist,
 * eller godkendt uden nogensinde at have haft en bestilling. Lå de i ét felt,
 * kunne man ikke skrive det ene uden at påstå noget om det andet.
 *
 * ⚠ INGEN AF DEM KASTER. En afvisning er et SVAR, ikke en nedbrudt
 * forbindelse — og `permission-denied` betyder at reglerne VIRKER.
 *
 * ⚠ OG MATCHSCOREN SENDES IKKE MED. Klienten siger hvilken ORDRE; serveren
 * skriver afgørelsen. Kom scoren udefra, gemte vi en påstand vi ikke kan
 * efterprøve — og et sikkerhedstal der ser præcist ud uden at være det, er
 * værre end intet tal.
 */
import { kaldFunktion } from "../firebase.js";

async function kald(navn, data, standardfejl) {
  try {
    const svar = await kaldFunktion(navn, data);
    return { ok: true, art: "ok", besked: null, data: svar?.data ?? svar ?? null };
  } catch (e) {
    const kode = String(e?.code || "");
    if (kode.includes("permission-denied")) {
      return { ok: false, art: "naegtet", besked: e?.message || "Du må ikke det her.", data: null };
    }
    /* "Bestillingen er allerede matchet med en anden faktura" er et svar om
       VERDEN, ikke om det brugeren skrev. De to skal kunne skelnes. */
    if (kode.includes("failed-precondition")) {
      return { ok: false, art: "afvist", besked: e?.message || "Det kan ikke lade sig gøre nu.", data: null };
    }
    if (kode.includes("invalid-argument") || kode.includes("not-found")) {
      return { ok: false, art: "afvist", besked: e?.message || standardfejl, data: null };
    }
    return { ok: false, art: "fejl", besked: "Der er ikke forbindelse til serveren.", data: null };
  }
}

/**
 * matchFaktura({ fakturaId, ordreId })          → bekræft et match
 * matchFaktura({ fakturaId, handling: "fjern" }) → tag matchet af igen
 * matchFaktura({ fakturaId, handling: "ikkeMatchbar", grund }) → afklar den
 *
 * ⚠ "INGEN AF FORSLAGENE PASSER" ER ET SVAR, ikke en tom tilstand. Uden det
 * står fakturaen for evigt på listen over dem der mangler et match — og en
 * liste der ikke kan tømmes, holder man op med at kigge på.
 */
export async function matchFaktura({ fakturaId, ordreId, handling, grund } = {}) {
  if (!fakturaId) return { ok: false, art: "afvist", besked: "Vælg en faktura.", data: null };
  if (!handling && !ordreId) {
    return { ok: false, art: "afvist", besked: "Vælg en bestilling.", data: null };
  }
  if (handling === "ikkeMatchbar" && !String(grund || "").trim()) {
    return {
      ok: false, art: "afvist", data: null,
      besked: "Skriv hvorfor ingen af bestillingerne passer.",
    };
  }
  return kald("fakturamatch", {
    fakturaId,
    ordreId: handling ? undefined : ordreId,
    handling: handling || undefined,
    grund: grund ? String(grund).trim() : undefined,
  }, "Matchet blev afvist.");
}

/**
 * skiftFaktura({ fakturaId, til, begrundelse })
 *
 * `til` er `godkendt` | `afvist` | `bogfoert`.
 *
 * ⚠ EN AFVISNING KRÆVER EN GRUND. En afvist regning skal kunne forklares til
 * leverandøren, og uden grunden er afvisningen en tavshed der ender i et
 * telefonopkald ingen kan svare på.
 */
export async function skiftFaktura({ fakturaId, til, begrundelse } = {}) {
  if (!fakturaId) return { ok: false, art: "afvist", besked: "Vælg en faktura.", data: null };
  if (!til) return { ok: false, art: "afvist", besked: "Vælg en handling.", data: null };
  if (til === "afvist" && !String(begrundelse || "").trim()) {
    return { ok: false, art: "afvist", besked: "Skriv hvorfor fakturaen afvises.", data: null };
  }
  return kald("fakturastatus", {
    fakturaId,
    til,
    begrundelse: begrundelse ? String(begrundelse).trim() : undefined,
  }, "Skiftet blev afvist.");
}

/**
 * gemKontantkoeb(post) → { ok, … }
 *
 * ⚠ DET BLIVER EN `indkoeb`-LINJE, ikke en post i en node ved siden af. Et
 * kontantkøb ER et køb; en egen node ville være den samme kendsgerning to
 * steder, og hvert beløb i modulet skulle huske at lægge dem sammen.
 *
 * ⚠ BELØBET ER EKSKL. MOMS I HELE ØRE. En kvittering viser inkl., og det er
 * netop derfor feltet hedder noget andet end det der står på bonnen.
 */
export async function gemKontantkoeb(post = {}) {
  return kald("kontantkoebskriv", {
    vare: post.vare || undefined,
    leverandoerId: post.leverandoerId || undefined,
    antal: Number.isFinite(post.antal) ? post.antal : undefined,
    prisPrEnhedOere: Number.isInteger(post.prisPrEnhedOere) ? post.prisPrEnhedOere : undefined,
    momsOere: Number.isInteger(post.momsOere) ? post.momsOere : undefined,
    enhed: post.enhed || undefined,
    kategori: post.kategori || undefined,
    koeretoejId: post.koeretoejId || undefined,
    note: post.note || undefined,
    dato: Number.isFinite(post.dato) ? post.dato : undefined,
    udlaegAf: post.udlaegAf || undefined,
  }, "Kontantkøbet blev afvist.");
}

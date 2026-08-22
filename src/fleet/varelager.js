/* src/fleet/varelager.js
 * Klientvejen til Procures eget varelager — beslutning 85.
 *
 * ⚠ TO VEJE IND, OG DE GØR IKKE DET SAMME:
 *
 *   `gemForbrugsvare()`  opretter eller retter STAMDATA — navn, enhed,
 *                        varenummer, minimum. Den rører ALDRIG beholdningen.
 *   `flytBeholdning()`   skriver en BEVÆGELSE, og beholdningen følger med i
 *                        samme `update()`.
 *
 * Skellet er ikke ryddelighed. Beholdningen er summen af bevægelser; kunne en
 * formular sætte den direkte, var det en femte bevægelsesart ingen har
 * besluttet — og den ville ikke stå i historikken. Skal tallet rettes, er det
 * en **optælling**, og så står rettelsen der hvor man leder efter den.
 *
 * ⚠ INGEN AF DEM KASTER. En afvisning er et SVAR, ikke en nedbrudt
 * forbindelse — og `permission-denied` betyder at reglerne VIRKER.
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
 * gemForbrugsvare({ id, navn, enhed, varenummer, minimumBeholdning, … })
 *
 * `id` udeladt → opret. `id` sat → ret.
 *
 * ⚠ `minimumBeholdning: null` BETYDER UDTRYKKELIGT "ingen grænse", ikke
 * "uændret". Uden den skelnen kunne en grænse aldrig fjernes igen — og en
 * grænse man ikke kan fjerne, bliver sat til et højt tal i stedet, hvor den
 * ligner en beslutning.
 */
export async function gemForbrugsvare(post = {}) {
  if (!String(post.navn || "").trim()) {
    return { ok: false, art: "afvist", besked: "Skriv hvad varen hedder.", data: null };
  }
  return kald("forbrugsvareskriv", {
    id: post.id || undefined,
    navn: post.navn,
    enhed: post.enhed || "stk",
    varenummer: post.varenummer || undefined,
    note: post.note || undefined,
    leverandoerId: post.leverandoerId || undefined,
    /* null sendes MED — det er svaret "ingen grænse". undefined betyder
       "rør den ikke". De to må ikke smelte sammen. */
    minimumBeholdning: post.minimumBeholdning === null
      ? null
      : (Number.isFinite(post.minimumBeholdning) ? post.minimumBeholdning : undefined),
  }, "Varen blev afvist.");
}

/**
 * flytBeholdning({ forbrugsvareId, art, antal, note, ordreId })
 *
 * ⚠ ANTALLET ER ALTID POSITIVT. Retningen kommer af ARTEN — et minus på et
 * forbrug ville trække to gange.
 *
 * ⚠ OG EN OPTÆLLING BÆRER DET TALTE, ikke en ændring. Det er hele forskellen
 * på arten: uden den skulle den der tæller, regne forskellen i hovedet, og en
 * fejl i det hovedregnestykke ser bagefter ud som svind.
 */
export async function flytBeholdning({ forbrugsvareId, art, antal, note, ordreId } = {}) {
  if (!forbrugsvareId) {
    return { ok: false, art: "afvist", besked: "Vælg en vare.", data: null };
  }
  if (!art) {
    return { ok: false, art: "afvist", besked: "Vælg hvad der skete med varen.", data: null };
  }
  if (!Number.isFinite(antal)) {
    return { ok: false, art: "afvist", besked: "Skriv et antal.", data: null };
  }
  if (art === "svind" && !String(note || "").trim()) {
    return {
      ok: false, art: "afvist", data: null,
      besked: "Skriv hvad der skete. Svind uden en grund bliver ikke undersøgt.",
    };
  }
  return kald("forbrugsvarebevaegelse", {
    forbrugsvareId,
    art,
    antal,
    note: note ? String(note).trim() : undefined,
    ordreId: ordreId || undefined,
  }, "Bevægelsen blev afvist.");
}

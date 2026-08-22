/* src/fleet/behov.js
 * Klientvejen til `indkoebsbehov` — beslutning 78, etape 2.
 *
 * ⚠ ÉN VEJ IND, som `skriv.js` er det for de åbne noder. Noden er
 * `.write: false`, så skrivningen går gennem `behovskriv`; det her er
 * indpakningen, så tyve skærme ikke bygger hver sin fejlhåndtering.
 */
import { kaldFunktion } from "../firebase.js";
import { valideBehov } from "./procure.js";

const FUNKTION = "behovskriv";

/**
 * ⚠ KASTER ALDRIG. En afvist skrivning er et SVAR: "du må ikke", "modulet er
 * ikke aktivt" og "der er ingen forbindelse" er tre forskellige ting, og
 * kaster funktionen, bliver de til den samme røde boks. Samme mønster som
 * `opretBooking()`.
 */
async function kald(nyttelast) {
  try {
    const svar = await kaldFunktion(FUNKTION, nyttelast);
    return { ok: true, art: "ok", besked: null, data: svar?.data ?? svar ?? null };
  } catch (e) {
    const kode = String(e?.code || "");
    /* ⚠ EN AFVISNING ER IKKE EN NETVÆRKSFEJL. `permission-denied` betyder at
       reglerne virker — "prøv igen" ville lære brugeren at systemet er i
       stykker, og han ville prøve igen, og igen. */
    if (kode.includes("permission-denied")) {
      return { ok: false, art: "naegtet", besked: e?.message || "Du må ikke det her.", data: null };
    }
    if (kode.includes("invalid-argument") || kode.includes("failed-precondition")) {
      return { ok: false, art: "afvist", besked: e?.message || "Behovet blev afvist.", data: null };
    }
    if (kode.includes("not-found")) {
      return { ok: false, art: "afvist", besked: e?.message || "Det findes ikke.", data: null };
    }
    return { ok: false, art: "fejl", besked: "Der er ikke forbindelse til serveren.", data: null };
  }
}

/**
 * meldBehov(post) → { ok, art, besked, data }
 *
 * ⚠ INTET id OG INGEN status. Serveren laver begge dele: et id udefra kunne
 * overskrive en andens post, og en status udefra ville gøre `nyt` til noget
 * en klient kunne springe over. Samme grund som `opretBooking()`.
 *
 * ⚠ OG DEN PRØVER FORMEN FØR DEN SENDER. Ikke for at afgøre — serveren gør
 * det med den SAMME `valideBehov()` — men for at svare hurtigt. Er de to
 * uenige, er serveren rigtig.
 */
export async function meldBehov(post = {}) {
  const udkast = {
    ...post,
    status: "nyt",
    /* Serveren sætter dem; her er de kun med for at kunne prøve formen. */
    oprettetAf: post.oprettetAf || "klient",
    oprettetMs: post.oprettetMs || Date.now(),
  };
  const svar = valideBehov(udkast);
  if (!svar.ok) {
    return {
      ok: false, art: "afvist", fejl: svar.fejl,
      besked: Object.values(svar.fejl)[0] || "Behovet er ikke gyldigt.", data: null,
    };
  }

  return kald({
    handling: "opret",
    vare: post.vare,
    kilde: post.kilde,
    /* ⚠ undefined FREM FOR null: RTDB afviser undefined, men en callable
       DROPPER feltet — og et felt der ikke sendes, er noget andet end et felt
       der sendes tomt. */
    antal: Number.isFinite(post.antal) ? post.antal : undefined,
    enhed: post.enhed || undefined,
    prioritet: post.prioritet || undefined,
    note: post.note || undefined,
    varenummer: post.varenummer || undefined,
    anmoderId: post.anmoderId || undefined,
    leverandoerId: post.leverandoerId || undefined,
  });
}

/**
 * afvisBehov(id, begrundelse) → { ok, art, besked }
 *
 * ⚠ ET AFVIST BEHOV SLETTES IKKE. Det får en tilstand og en grund — samme
 * regel som resten af systemet. Uden den kan man ikke se at nogen HAR meldt
 * ind, og den samme mangel bliver meldt ind igen i næste uge.
 */
export async function afvisBehov(id, begrundelse) {
  if (!id) return { ok: false, art: "afvist", besked: "Intet behov valgt.", data: null };
  if (!begrundelse?.trim()) {
    return {
      ok: false, art: "afvist", data: null,
      besked: "Angiv en begrundelse. Den der meldte ind, skal kunne se hvorfor.",
    };
  }
  return kald({ handling: "afvis", id, begrundelse: begrundelse.trim() });
}

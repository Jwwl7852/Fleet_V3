/* src/fleet/braendstofmatch-klient.js
 * Klientvejen til brændstofmatch — G.2.
 *
 * ⚠ SAMME MØNSTER SOM faktura.js's matchFaktura(). En afvisning er et SVAR,
 * ikke en nedbrudt forbindelse — `permission-denied` betyder at reglerne
 * VIRKER. Scoren sendes ikke med — klienten siger hvilken TANKNING;
 * serveren skriver afgørelsen.
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

/** koerBraendstofAutomatch() → { ok, data: { automatiskMatchet, forbliverAabne } } */
export async function koerBraendstofAutomatch() {
  return kald("braendstofAutomatch", {}, "Automatisk match kunne ikke køres.");
}

/**
 * braendstofMatchBekraeft({ indkoebId, tankningId?, handling?, grund? })
 *
 * `handling` udelades for en almindelig match (kræver `tankningId`),
 * eller er "ikkeMatchbar" (kræver `grund`) | "fjern".
 */
export async function braendstofMatchBekraeft({ indkoebId, tankningId, handling, grund } = {}) {
  if (!indkoebId) return { ok: false, art: "afvist", besked: "Vælg en fakturalinje.", data: null };
  if (!handling && !tankningId) {
    return { ok: false, art: "afvist", besked: "Vælg en tankning.", data: null };
  }
  if (handling === "ikkeMatchbar" && !String(grund || "").trim()) {
    return { ok: false, art: "afvist", besked: "Skriv hvorfor ingen af forslagene passer.", data: null };
  }
  return kald("braendstofMatchBekraeft", {
    indkoebId,
    tankningId: handling ? undefined : tankningId,
    handling: handling || undefined,
    grund: grund ? String(grund).trim() : undefined,
  }, "Matchet blev afvist.");
}

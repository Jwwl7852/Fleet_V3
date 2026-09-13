import { db, kaldFunktion } from "../firebase.js";
import { tolkUdbyderfejl, UDBYDERSVAR } from "./udbyder-regler.js";
export * from "./ejer-tilbud-regler.js";

async function kald(navn, data) {
  try {
    const svar = await kaldFunktion(navn, data);
    return { ok: true, art: UDBYDERSVAR.ok, data: svar?.data || null };
  } catch (fejl) {
    return { ok: false, ...tolkUdbyderfejl(fejl), data: null };
  }
}
export async function hentTilbud() {
  if (!db) throw new Error("Firebase er ikke konfigureret. Tilbud blev ikke hentet.");
  return (await db.ref("udbyder/tilbud").once("value")).val() || {};
}
export async function hentTilbudsPrislister() {
  if (!db) throw new Error("Firebase er ikke konfigureret. Ratebladet blev ikke hentet.");
  return (await db.ref("udbyder/prisliste").once("value")).val() || {};
}
export const gemTilbud = (data) => kald("tilbudgem", data);
export const udstedTilbud = (data) => kald("tilbududsted", data);
export const startTilbudsrevision = (data) => kald("tilbudrevisionstart", data);
export const sendTilbud = (data) => kald("tilbudsend", data);
export const genererTilbudsPdf = (data) => kald("tilbudpdfgenerer", data);
export const hentTilbudsPdf = (data) => kald("tilbudpdfhent", data);
export const registrerTilbudSendt = (data) => kald("tilbudsendtregistrer", data);
export const registrerTilbudsaccept = (data) => kald("tilbudacceptregistrer", data);

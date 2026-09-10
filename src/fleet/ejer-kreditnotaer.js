import { db, kaldFunktion } from "../firebase.js";
import { tolkUdbyderfejl, UDBYDERSVAR } from "./udbyder-regler.js";

async function kald(navn, data = {}) {
  try {
    const svar = await kaldFunktion(navn, data);
    return { ok: true, art: UDBYDERSVAR.ok, data: svar?.data || null };
  } catch (fejl) { return { ok: false, ...tolkUdbyderfejl(fejl), data: null }; }
}

export async function hentEjerKreditnotaer() {
  if (!db) throw new Error("Firebase er ikke konfigureret. Kreditnotaer blev ikke hentet.");
  const [grundlag, fakturajobs, kreditnotaer, kreditjobs, integration, dinero] = await Promise.all([
    db.ref("udbyder/fakturagrundlag").once("value"), db.ref("udbyder/fakturajobs").once("value"),
    db.ref("udbyder/kreditnotaer").once("value"), db.ref("udbyder/kreditjobs").once("value"),
    db.ref("udbyder/integrationer/dinero").once("value"), db.ref("udbyder/dinero").once("value"),
  ]);
  return {
    grundlag: grundlag.val() || {}, fakturajobs: fakturajobs.val() || {},
    kreditnotaer: kreditnotaer.val() || {}, kreditjobs: kreditjobs.val() || {},
    integration: integration.val() || null, dinero: dinero.val() || {},
  };
}

export const opretKreditnota = (data) => kald("kreditnotaopret", data);
export const frigivKreditnota = (data) => kald("kreditnotafrigiv", data);
export const annullerKreditnota = (data) => kald("kreditnotaannuller", data);
export const genererKreditnotadokument = (data) => kald("kreditnotadokumenter", data);
export const hentKreditnotadokument = (data) => kald("kreditnotadokumenthent", data);
export const koerKreditnotajob = (data) => kald("kreditnotajobkoer", data);
export const synkroniserDinero = () => kald("dinerosynkroniser", {});


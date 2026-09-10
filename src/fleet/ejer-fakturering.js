import { db, kaldFunktion } from "../firebase.js";
import { tolkUdbyderfejl, UDBYDERSVAR } from "./udbyder-regler.js";

async function kald(navn, data = {}) {
  try {
    const svar = await kaldFunktion(navn, data);
    return { ok: true, art: UDBYDERSVAR.ok, data: svar?.data || null };
  } catch (fejl) {
    return { ok: false, ...tolkUdbyderfejl(fejl), data: null };
  }
}

export async function hentEjerFakturering() {
  if (!db) throw new Error("Firebase er ikke konfigureret. Fakturagrundlag blev ikke hentet.");
  const [grundlag, jobs, integration] = await Promise.all([
    db.ref("udbyder/fakturagrundlag").once("value"),
    db.ref("udbyder/fakturajobs").once("value"),
    db.ref("udbyder/integrationer/dinero").once("value"),
  ]);
  return { grundlag: grundlag.val() || {}, jobs: jobs.val() || {}, integration: integration.val() || null };
}

export const frigivFakturagrundlag = (data) => kald("fakturagrundlagfrigiv", data);
export const genererFakturagrundlagsdokumenter = (data) => kald("fakturagrundlagdokumenter", data);
export const hentFakturagrundlagsdokument = (data) => kald("fakturagrundlagdokumenthent", data);
export const koerFakturajob = (data) => kald("fakturajobkoer", data);

export const fakturastatus = (grundlag, job) => ({
  dokument: grundlag?.frigivelse ? "frigivet" : "klar",
  afsendelse: job?.sendStatus || grundlag?.afsendelsesStatus || "ikke_koesat",
  betaling: job?.betalingStatus || "ikke_faktureret",
});

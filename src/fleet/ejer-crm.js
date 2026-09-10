/* Firebase-transport for den serverautoritative ejer-CRM. */
import { db, kaldFunktion } from "../firebase.js";
import { tolkUdbyderfejl, UDBYDERSVAR } from "./udbyder-regler.js";

export * from "./ejer-crm-regler.js";

export const EJER_CRM_FUNKTION = Object.freeze({
  profiler: "ejerprofilerhent",
  virksomhedGem: "crmvirksomhedgem",
  mulighedGem: "crmmulighedgem",
  aktivitetGem: "crmaktivitetgem",
});

async function kald(navn, data = {}) {
  try {
    const svar = await kaldFunktion(navn, data);
    return { ok: true, art: UDBYDERSVAR.ok, data: svar?.data || null };
  } catch (fejl) {
    return { ok: false, ...tolkUdbyderfejl(fejl), data: null };
  }
}

export async function hentEjerCrm() {
  if (!db) throw new Error("Firebase er ikke konfigureret. CRM-data blev ikke hentet.");
  return (await db.ref("udbyder/crm/virksomheder").once("value")).val() || {};
}

export async function hentEjerprofiler() {
  const svar = await kald(EJER_CRM_FUNKTION.profiler);
  if (!svar.ok) throw new Error(svar.besked || "Ejerprofiler kunne ikke hentes.");
  return svar.data?.profiler || [];
}

export const gemCrmVirksomhed = (data) => kald(EJER_CRM_FUNKTION.virksomhedGem, data);
export const gemCrmMulighed = (data) => kald(EJER_CRM_FUNKTION.mulighedGem, data);
export const gemCrmAktivitet = (data) => kald(EJER_CRM_FUNKTION.aktivitetGem, data);


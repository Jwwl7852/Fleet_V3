import { kaldFunktion } from "../firebase.js";
import { tolkUdbyderfejl, UDBYDERSVAR } from "./udbyder-regler.js";

async function kald(navn, data = {}) {
  try { const svar = await kaldFunktion(navn, data); return { ok: true, art: UDBYDERSVAR.ok, data: svar?.data || null }; }
  catch (fejl) { return { ok: false, ...tolkUdbyderfejl(fejl), data: null }; }
}

export const hentEjerleverandoerer = () => kald("ejerleverandoererhent");
export const gemEjerleverandoer = (data) => kald("ejerleverandoergem", data);

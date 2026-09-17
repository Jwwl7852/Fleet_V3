import { kaldFunktion } from "../firebase.js";

export async function tilknytRessourceHardware({ art, hardwareId, ressourceType, ressourceId }) {
  try {
    const svar = await kaldFunktion("ressourcehardwaretilknyt", {
      art, hardwareId: hardwareId || null, ressourceType, ressourceId,
    });
    return { ok: true, data: svar?.data || null };
  } catch (fejl) {
    return {
      ok: false,
      fejl,
      besked: fejl?.message || "Hardwaren kunne ikke tilknyttes. Intet blev ændret.",
    };
  }
}

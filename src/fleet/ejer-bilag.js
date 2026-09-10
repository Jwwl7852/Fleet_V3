import { db, kaldFunktion } from "../firebase.js";
import { tolkUdbyderfejl, UDBYDERSVAR } from "./udbyder-regler.js";

async function kald(navn, data = {}) {
  try { const svar = await kaldFunktion(navn, data); return { ok: true, art: UDBYDERSVAR.ok, data: svar?.data || null }; }
  catch (fejl) { return { ok: false, ...tolkUdbyderfejl(fejl), data: null }; }
}

export async function hentEjerBilag() {
  if (!db) throw new Error("Firebase er ikke konfigureret. Bilagsindbakken blev ikke hentet.");
  const [poster, jobs, integrationer, dinero] = await Promise.all([
    db.ref("udbyder/bilagsindbakke/poster").once("value"), db.ref("udbyder/bilagjobs").once("value"),
    db.ref("udbyder/integrationer").once("value"), db.ref("udbyder/dinero").once("value"),
  ]);
  return { poster: poster.val() || {}, jobs: jobs.val() || {}, integrationer: integrationer.val() || {}, dinero: dinero.val() || {} };
}

export async function uploadEjerBilag(file) {
  const operationId = crypto.randomUUID();
  const init = await kald("ejerbilaguploadinitier", { operationId, filnavn: file.name, contentType: file.type, stoerrelse: file.size });
  if (!init.ok) return init;
  if (!init.data.uploadUrl) return { ok: false, art: "ikke_tilsluttet", besked: "Lokal bilagsupload kræver en isoleret Storage-fixture; produktionslinket blev ikke oprettet.", data: init.data };
  let upload;
  try { upload = await fetch(init.data.uploadUrl, { method: "PUT", headers: { "content-type": init.data.contentType }, body: file }); }
  catch (fejl) { return { ok: false, art: "forbindelse", besked: `Filen blev ikke overført: ${fejl.message}`, data: null }; }
  if (!upload.ok) return { ok: false, art: "forbindelse", besked: `Lageret afviste uploaden med HTTP ${upload.status}.`, data: null };
  return kald("ejerbilaguploadbekraeft", { id: init.data.id });
}

export const hentOriginalBilag = (data) => kald("ejerbilaghent", data);
export const gemBilagsmetadata = (data) => kald("ejerbilagmetadatagem", data);
export const saetBilagsstatus = (data) => kald("ejerbilagstatus", data);
export const koerBilagsocr = (data) => kald("ejerbilagocrkoer", data);
export const klargoerBilagTilDinero = (data) => kald("ejerbilagklargoerdinero", data);
export const matchBilagTilDinero = (data) => kald("ejerbilagmatchdinero", data);
export const gemDineroKontomapping = (data) => kald("dinerokontomappinggem", data);

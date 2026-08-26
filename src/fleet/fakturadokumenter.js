/* src/fleet/fakturadokumenter.js
 * Klientvejen til fakturabilag — Skive 4C.
 *
 * ⚠ SAMME MØNSTER SOM faktura.js's kald(). En afvisning er et SVAR, ikke en
 * nedbrudt forbindelse — permission-denied betyder at reglerne virker.
 *
 * ⚠ INGEN Firebase Storage-SDK HER. Selve overførslen er en almindelig
 * fetch() PUT mod den signerede URL dokumentUploadInitier udsteder — Storage
 * Rules lukker al direkte SDK-adgang (se storage.rules), så der er intet en
 * klient-SDK kunne gøre her, som en signeret URL ikke allerede gør bedre.
 */
import { kaldFunktion } from "../firebase.js";
import { TILLADT_MIME, MAX_FILSTOERRELSE_BYTES } from "./dokumenter.js";

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
    if (kode.includes("resource-exhausted")) {
      return { ok: false, art: "afvist", besked: e?.message || "Kvoten er brugt op.", data: null };
    }
    return { ok: false, art: "fejl", besked: "Der er ikke forbindelse til serveren.", data: null };
  }
}

/**
 * uploadFakturaDokument({ fakturaId, fil }) → { ok, art, besked, data }
 *
 * `fil` er en almindelig File/Blob fra en <input type="file">. Tre trin:
 * initiér (server tildeler id + signeret upload-URL) → PUT bytes → bekræft
 * (server verificerer signatur/størrelse/kvote og frigiver fra karantæne).
 */
export async function uploadFakturaDokument({ fakturaId, fil } = {}) {
  if (!fakturaId) return { ok: false, art: "afvist", besked: "Vælg en faktura.", data: null };
  if (!fil) return { ok: false, art: "afvist", besked: "Vælg en fil.", data: null };
  if (!TILLADT_MIME.includes(fil.type)) {
    return { ok: false, art: "afvist", besked: "Kun PDF, JPEG og PNG er tilladt.", data: null };
  }
  if (fil.size > MAX_FILSTOERRELSE_BYTES) {
    return {
      ok: false, art: "afvist", data: null,
      besked: `Filen er større end ${Math.round(MAX_FILSTOERRELSE_BYTES / (1024 * 1024))} MB.`,
    };
  }

  const init = await kald("dokumentUploadInitier", {
    fakturaId, originaltFilnavn: fil.name, mimeType: fil.type, stoerrelse: fil.size,
  }, "Upload kunne ikke startes.");
  if (!init.ok) return init;

  const { dokumentId, uploadUrl } = init.data || {};
  if (!dokumentId || !uploadUrl) {
    return { ok: false, art: "fejl", besked: "Serveren svarede uden en upload-adresse.", data: null };
  }

  try {
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": fil.type },
      body: fil,
    });
    if (!res.ok) {
      return { ok: false, art: "fejl", besked: "Filen kunne ikke overføres til lageret.", data: null };
    }
  } catch {
    return { ok: false, art: "fejl", besked: "Der er ikke forbindelse til lageret.", data: null };
  }

  return kald("dokumentUploadBekraeft", { fakturaId, dokumentId }, "Filen kunne ikke verificeres.");
}

/** hentFakturaDokumentLink({ fakturaId, dokumentId }) → { ok, data: { url, udloeberMs } } */
export async function hentFakturaDokumentLink({ fakturaId, dokumentId } = {}) {
  if (!fakturaId || !dokumentId) {
    return { ok: false, art: "afvist", besked: "Vælg et dokument.", data: null };
  }
  return kald("dokumentDownloadLink", { fakturaId, dokumentId }, "Linket kunne ikke udstedes.");
}

/** deaktiverFakturaDokument({ fakturaId, dokumentId }) — statusskift, ikke sletning. */
export async function deaktiverFakturaDokument({ fakturaId, dokumentId } = {}) {
  if (!fakturaId || !dokumentId) {
    return { ok: false, art: "afvist", besked: "Vælg et dokument.", data: null };
  }
  return kald("dokumentDeaktiver", { fakturaId, dokumentId }, "Dokumentet kunne ikke deaktiveres.");
}

/* src/fleet/opgavedokumenter.js
 * Klientvejen til opgavedokumenter — F.2, samme fundament som Skive 4C.
 *
 * ⚠ SAMME MØNSTER SOM fakturadokumenter.js — se dens hoved. Denne fil er en
 * parallel klient, ikke en genbrugt en: fakturaId/opgaveId er forskellige
 * felter i to forskellige Cloud Functions, og et fælles "parentId"-parameter
 * ville skjule hvilken slags dokument der rent faktisk bliver uploadet.
 *
 * ⚠ INGEN Firebase Storage-SDK HER. Selve overførslen er en almindelig
 * fetch() PUT mod den signerede URL opgaveDokumentUploadInitier udsteder —
 * Storage Rules lukker al direkte SDK-adgang (se storage.rules).
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
 * uploadOpgaveDokument({ opgaveId, fil }) → { ok, art, besked, data }
 *
 * `fil` er en almindelig File/Blob fra en <input type="file">. Tre trin:
 * initiér (server tildeler id + signeret upload-URL) → PUT bytes → bekræft
 * (server verificerer signatur/størrelse/kvote og frigiver fra karantæne).
 * Dokumentet er IKKE delt med en eventuel leverandør efter denne — det er
 * en separat, eksplicit beslutning. Se saetOpgaveDokumentSynlighed().
 */
export async function uploadOpgaveDokument({ opgaveId, fil } = {}) {
  if (!opgaveId) return { ok: false, art: "afvist", besked: "Vælg en opgave.", data: null };
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

  const init = await kald("opgaveDokumentUploadInitier", {
    opgaveId, originaltFilnavn: fil.name, mimeType: fil.type, stoerrelse: fil.size,
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

  return kald("opgaveDokumentUploadBekraeft", { opgaveId, dokumentId }, "Filen kunne ikke verificeres.");
}

/** hentOpgaveDokumentLink({ opgaveId, dokumentId }) → { ok, data: { url, udloeberMs } } */
export async function hentOpgaveDokumentLink({ opgaveId, dokumentId } = {}) {
  if (!opgaveId || !dokumentId) {
    return { ok: false, art: "afvist", besked: "Vælg et dokument.", data: null };
  }
  return kald("opgaveDokumentDownloadLink", { opgaveId, dokumentId }, "Linket kunne ikke udstedes.");
}

/** deaktiverOpgaveDokument({ opgaveId, dokumentId }) — statusskift, ikke sletning. */
export async function deaktiverOpgaveDokument({ opgaveId, dokumentId } = {}) {
  if (!opgaveId || !dokumentId) {
    return { ok: false, art: "afvist", besked: "Vælg et dokument.", data: null };
  }
  return kald("opgaveDokumentDeaktiver", { opgaveId, dokumentId }, "Dokumentet kunne ikke deaktiveres.");
}

/**
 * saetOpgaveDokumentSynlighed({ opgaveId, dokumentId, synlig }) → { ok, data }
 *
 * `synlig: true` gør dokumentet hentbart fra leverandørportalen (kun hvis
 * opgaven i forvejen har en leverandoerId); `false` skjuler det igen —
 * uden at røre selve dokumentet eller filen.
 */
export async function saetOpgaveDokumentSynlighed({ opgaveId, dokumentId, synlig } = {}) {
  if (!opgaveId || !dokumentId) {
    return { ok: false, art: "afvist", besked: "Vælg et dokument.", data: null };
  }
  return kald("opgaveDokumentSynlighedSaet", { opgaveId, dokumentId, synlig },
    "Delingen kunne ikke ændres.");
}

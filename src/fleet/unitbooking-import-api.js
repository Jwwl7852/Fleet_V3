/* Klienttransport for UNIT bookingimport. Al autoritativ validering ligger i
 * Cloud Functions; denne fil oversætter kun browserhandlinger og fejl. */
import { kaldFunktion } from "../firebase.js";
import { filtypeFraNavn, valideImportFil } from "./unitbooking-import.js";

const FUNKTION = Object.freeze({
  tekst: "unitbookingimportopret",
  gem: "unitbookingimportgem",
  bekraeft: "unitbookingimportbekraeft",
  uploadStart: "unitbookingimportuploadstart",
  uploadSlut: "unitbookingimportuploadslut",
});

function fejltekst(fejl) {
  const kode = String(fejl?.code || "").replace("functions/", "");
  if (/ingen Firebase-app/i.test(String(fejl?.message))) {
    return "Demo-tilstand: gennemgangen virker, men udkastet kan ikke gemmes uden den lokale backend.";
  }
  if (kode === "permission-denied") return "Du har ikke adgang til at importere UNIT-bookinger.";
  if (kode === "already-exists") return fejl?.message || "Materialet er allerede importeret.";
  if (kode === "failed-precondition") return fejl?.message || "Oplysningerne skal gennemgås igen.";
  if (kode === "unavailable") return "Serveren kan ikke nås. Udkastet er ikke bekræftet.";
  return fejl?.message || "Handlingen kunne ikke gennemføres.";
}

async function kald(navn, data) {
  try {
    const svar = await kaldFunktion(navn, data);
    return { ok: true, data: svar?.data || null, besked: null };
  } catch (fejl) {
    return { ok: false, data: null, besked: fejltekst(fejl), fejl };
  }
}

async function sha256(fil) {
  const bytes = await fil.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const opretTekstimport = ({ originalTekst, operationId }) =>
  kald(FUNKTION.tekst, { originalTekst, operationId });

export const gemImportkladde = ({ kladdeId, kladde, operationId }) =>
  kald(FUNKTION.gem, { kladdeId, kladde, operationId });

export const bekraeftImportkladde = ({ kladdeId, kladde, operationId }) =>
  kald(FUNKTION.bekraeft, { kladdeId, kladde, operationId });

export async function uploadImportfil(fil, operationId) {
  const validering = valideImportFil({
    filnavn: fil?.name, mimeType: fil?.type, stoerrelse: fil?.size,
  });
  if (!validering.ok) {
    return { ok: false, data: null, besked: Object.values(validering.fejl).join(" ") };
  }
  const hash = await sha256(fil);
  const start = await kald(FUNKTION.uploadStart, {
    operationId,
    filnavn: fil.name,
    mimeType: fil.type || "application/octet-stream",
    stoerrelse: fil.size,
    sha256: hash,
    filtype: filtypeFraNavn(fil.name, fil.type),
  });
  if (!start.ok) return start;
  try {
    const respons = await fetch(start.data.uploadUrl, {
      method: "PUT",
      headers: { "content-type": start.data.mimeType },
      body: fil,
    });
    if (!respons.ok) throw new Error(`Upload svarede ${respons.status}.`);
  } catch (fejl) {
    return { ok: false, data: null, besked: `Filen kunne ikke overføres: ${fejl.message}` };
  }
  return kald(FUNKTION.uploadSlut, {
    kladdeId: start.data.kladdeId,
    dokumentId: start.data.dokumentId,
    operationId,
  });
}

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

async function laes(sti) {
  if (!db) throw new Error("Firebase er ikke konfigureret. Ejerens salgsdata blev ikke hentet.");
  return (await db.ref(sti).once("value")).val() || {};
}

export async function hentSalgsplatform() {
  const [traade, mailjobs, viden, integrationer, aiForbrug] = await Promise.all([
    laes("udbyder/salgsindbakke/traade"), laes("udbyder/mailjobs"),
    laes("udbyder/vidensbase/poster"), laes("udbyder/integrationer"), laes("udbyder/ai/forbrug"),
  ]);
  return { traade, mailjobs, viden, integrationer, aiForbrug };
}

export const opdaterSalgstraad = (data) => kald("salgstraadopdater", data);
export const opdaterKommunikationsklassifikation = (data) => kald("kommunikationsklassifikationopdater", data);
export const opdaterSupportsag = (data) => kald("supportsagopdater", data);
export const gemEjerfravaer = (data) => kald("ejerfravaergem", data);
export const hentEjerarbejdsflow = () => kald("ejerarbejdsflowhent");
export const opretSalgsnote = (data) => kald("salgsnoteopret", data);
export const hentSalgsvedhaeftning = (data) => kald("salgsvedhaeftninghent", data);
export const synkroniserMicrosoft365 = () => kald("m365salgsynkroniser");
export const opretTilbudMailkladde = (data) => kald("tilbudmailkladdeopret", data);
export const afsendSalgsmail = (data) => kald("salgsmailafsend", data);
export const gemSalgsopfoelgning = (data) => kald("salgsopfoelgninggem", data);
export const godkendSalgsopfoelgning = (data) => kald("salgsopfoelgninggodkend", data);
export const saetSalgsopfoelgningStatus = (data) => kald("salgsopfoelgningstatus", data);
export const afsendSalgsopfoelgning = (data) => kald("salgsopfoelgningafsend", data);
export const koerSalgsanalyse = (data) => kald("salgsanalysekoer", data);
export const gemAnalyseSvarudkast = (data) => kald("salgsanalysesvarudkastgem", data);
export const spoergSalgsassistent = (data) => kald("salgsassistentspoerg", data);
export const gemVidenspost = (data) => kald("videnspostgem", data);
export const gemKommunikationssvarkladde = (data) => kald("kommunikationssvarkladdegem", data);
export const godkendKommunikationssvar = (data) => kald("kommunikationssvargodkend", data);
export const afsendKommunikationssvar = (data) => kald("kommunikationssvarafsend", data);

export const SALGSSTATUS = Object.freeze({
  ny: "Ny", afventer_os: "Afventer vores svar", afventer_kunden: "Afventer kunden", afsluttet: "Afsluttet",
});

export const MAILSTATUS = Object.freeze({
  planlagt: "Planlagt", kladde: "Kladde", ikke_tilsluttet: "Ikke tilsluttet", afsender: "Afsender",
  accepteret_af_graph: "Accepteret af Microsoft Graph – afventer dokumentation",
  dokumenteret_sendt: "Dokumenteret sendt", fejlet: "Fejlet", ukendt: "Ukendt udfald – må ikke genudsendes blindt",
  godkendt: "Godkendt", pauset: "Pauset", udskudt: "Udskudt", annulleret: "Annulleret",
});

export const SAGSTYPE_LABEL = Object.freeze({
  salg: "Salg", support: "Support", kundedialog: "Kundedialog", leverandoer: "Leverandør", intern: "Intern sag", uafklaret: "Kræver gennemgang",
});

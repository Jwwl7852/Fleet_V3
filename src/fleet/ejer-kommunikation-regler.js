export const KOMMUNIKATION_STATUS = new Set(["ny", "afventer_os", "afventer_kunden", "afsluttet"]);
export const SAGSTYPER = new Set(["salg", "support", "kundedialog", "leverandoer", "intern", "uafklaret"]);
export const DELINGSSTATUS = new Set(["delt", "privat", "afklaring"]);
export const SUPPORT_STATUS = new Set(["ny", "triage", "afventer_os", "afventer_kunden", "loest", "lukket"]);
export const SUPPORT_TYPER = new Set(["spoergsmaal", "fejl", "drift", "adgang", "fakturering", "andet"]);
export const SUPPORT_PRIORITET = new Set(["lav", "normal", "hoej", "kritisk"]);

const trim = (value, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : "";
const email = (value) => trim(value, 320).toLowerCase();

export function postkasseKilde(input = {}) {
  const mailboxId = trim(input.mailboxId, 500);
  const adresse = email(input.adresse || input.mailboxAddress);
  const mappe = trim(input.mappe || input.folder, 40).toLowerCase() || "inbox";
  const ejerUid = trim(input.ejerUid, 160);
  const type = ["personlig", "delt", "alias"].includes(input.type) ? input.type : "uafklaret";
  return { mailboxId, adresse, mappe, ejerUid, type };
}

export function postkasseKildeNoegle(kilde = {}) {
  return [email(kilde.adresse), trim(kilde.mailboxId, 500).toLowerCase(), trim(kilde.mappe, 40).toLowerCase()].join("|");
}

export function fletPostkasseKilder(eksisterende = {}, nyKilde = {}) {
  const kilder = Array.isArray(eksisterende) ? eksisterende : Object.values(eksisterende || {});
  const normaliseret = postkasseKilde(nyKilde);
  const noegle = postkasseKildeNoegle(normaliseret);
  const resultat = new Map(kilder.map((kilde) => [postkasseKildeNoegle(kilde), postkasseKilde(kilde)]));
  if (normaliseret.mailboxId || normaliseret.adresse) resultat.set(noegle, normaliseret);
  return Object.fromEntries([...resultat.entries()].map(([key, value]) => [key.replace(/[.#$\[\]/]/g, "_") || "ukendt", value]));
}

export function klassificerKommunikation({ fra = "", til = "", emne = "", tekst = "", mailboxType = "uafklaret", kendtKunde = false } = {}) {
  const samlet = `${emne}\n${tekst}`.toLowerCase();
  const internAdresse = email(fra).endsWith("@veyrosystems.com") && email(til).endsWith("@veyrosystems.com");
  const supportSignal = /\b(support|hjælp|fejl|virker ikke|nedbrud|login|adgang|problem|bug)\b/i.test(samlet);
  const salgSignal = /\b(tilbud|pris|demo|pilot|modul|opstart|abonnement|købe|koebe)\b/i.test(samlet);
  const leverandoerSignal = /\b(leverandør|leverandoer|ordre|indkøb|indkoeb|faktura fra)\b/i.test(samlet);
  let sagstype = "uafklaret";
  if (internAdresse) sagstype = "intern";
  else if (supportSignal && kendtKunde) sagstype = "support";
  else if (salgSignal) sagstype = "salg";
  else if (leverandoerSignal) sagstype = "leverandoer";
  else if (kendtKunde) sagstype = "kundedialog";
  const delingsstatus = sagstype === "intern" || mailboxType === "personlig"
    ? (sagstype === "support" || sagstype === "salg" || sagstype === "kundedialog" ? "delt" : "afklaring")
    : "delt";
  return {
    sagstype,
    delingsstatus,
    klassifikationsgrundlag: supportSignal ? "supportsignal" : salgSignal ? "salgssignal" : leverandoerSignal ? "leverandoersignal" : kendtKunde ? "kendt_kunde" : internAdresse ? "intern_afsender" : "mangler_afklaring",
    kraeverGennemgang: sagstype === "uafklaret" || delingsstatus === "afklaring",
  };
}

export function normaliserSupport(input = {}, nu = Date.now()) {
  const type = SUPPORT_TYPER.has(input.type) ? input.type : "andet";
  const status = SUPPORT_STATUS.has(input.status) ? input.status : "ny";
  const prioritet = SUPPORT_PRIORITET.has(input.prioritet) ? input.prioritet : "normal";
  const fristMs = Number(input.fristMs);
  return {
    nummer: trim(input.nummer, 40), type, status, prioritet,
    modul: trim(input.modul, 80), ansvarligUid: trim(input.ansvarligUid, 160),
    fristMs: Number.isFinite(fristMs) && fristMs > 0 ? Math.trunc(fristMs) : null,
    opdateretMs: Math.trunc(Number(input.opdateretMs) || nu),
  };
}

export function beregnHitrate(muligheder = []) {
  const afsluttede = muligheder.filter((m) => ["vundet", "tabt"].includes(m?.fase));
  const vundet = afsluttede.filter((m) => m.fase === "vundet").length;
  return { vundet, afsluttede: afsluttede.length, procent: afsluttede.length ? Math.round((vundet / afsluttede.length) * 1000) / 10 : null };
}

export function anvendRabatter(linjer = [], rabatter = []) {
  return linjer.map((linje) => {
    const grundlagOere = Math.max(0, Math.trunc(Number(linje.beloebOere) || 0));
    let beloebOere = grundlagOere;
    const anvendte = [];
    for (const rabat of rabatter) {
      if (rabat?.aktiv === false) continue;
      const maal = Array.isArray(rabat?.linjeIder) ? rabat.linjeIder : [];
      if (maal.length && !maal.includes(linje.id)) continue;
      const procent = Math.min(100, Math.max(0, Number(rabat?.procent) || 0));
      const foerOere = beloebOere;
      beloebOere = Math.round(beloebOere * (1 - procent / 100));
      anvendte.push({ id: trim(rabat?.id, 80), procent, foerOere, efterOere: beloebOere });
    }
    return { ...linje, grundlagOere, beloebOere, anvendteRabatter: anvendte };
  });
}

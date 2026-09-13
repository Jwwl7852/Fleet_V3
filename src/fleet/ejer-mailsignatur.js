export const tomMailsignatur = Object.freeze({ navn: "", titel: "", virksomhed: "", telefon: "", email: "", hjemmeside: "", ekstra: "", navnFed: true, titelKursiv: false, brugLogo: false, revision: 0 });

export function bygMailsignaturTekst(signatur = {}) {
  const linjer = [signatur.navn, signatur.titel, signatur.virksomhed, signatur.telefon, signatur.email, signatur.hjemmeside, signatur.ekstra]
    .map((linje) => String(linje || "").trim()).filter(Boolean);
  return linjer.length ? `Venlig hilsen\n${linjer.join("\n")}` : "";
}

export function harMailsignatur(signatur = {}) { return Boolean(bygMailsignaturTekst(signatur)); }

const regexSikker = (vaerdi) => String(vaerdi || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function findKendtMailsignaturAfslutning(mailtekst = "", kendteNavne = []) {
  const tekst = String(mailtekst || "");
  const navne = kendteNavne.map((navn) => String(navn || "").trim()).filter(Boolean);
  for (const navn of navne) {
    const udtryk = new RegExp(`(?:\\r?\\n){1,2}Venlig hilsen(?:\\r?\\n|[ \\t]+)${regexSikker(navn)}[ \\t]*$`, "i");
    const fund = udtryk.exec(tekst);
    if (fund) return { start: fund.index, tekst: fund[0].trim(), navn };
  }
  return null;
}

export function fjernKendtMailsignaturAfslutning(mailtekst = "", kendteNavne = []) {
  const fund = findKendtMailsignaturAfslutning(mailtekst, kendteNavne);
  return fund ? String(mailtekst).slice(0, fund.start).trimEnd() : String(mailtekst);
}

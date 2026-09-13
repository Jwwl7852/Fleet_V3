/* Udskiftelige porte for ejerens bilagsindbakke. Ingen leverandør er valgt. */

export const BILAG_MAIL_ADAPTERE = Object.freeze(["microsoft365_mappe", "inbound_webhook"]);
export const OCR_ADAPTERE = Object.freeze(["test"]);

export function bilagMailForbindelsesstatus(integration = {}) {
  return {
    invoiceMail: integration.invoiceMail?.status === "aktiv" ? "aktiv" : "ikke_tilsluttet",
    inboundMail: integration.inboundMail?.status === "aktiv" ? "aktiv" : "ikke_tilsluttet",
  };
}

export function normaliserOcrForslag(raw = {}) {
  const sikkerhed = (felt) => Number.isFinite(Number(raw.sikkerhed?.[felt]))
    ? Math.max(0, Math.min(100, Math.round(Number(raw.sikkerhed[felt])))) : null;
  const felter = ["leverandoer", "dokumentnummer", "dato", "forfaldsdato", "valuta", "beloebEksklMomsOere", "momsOere", "totalOere", "kategori", "betalingsreference"];
  return {
    felter: Object.fromEntries(felter.map((felt) => [felt, raw[felt] ?? null])),
    sikkerhed: Object.fromEntries(felter.map((felt) => [felt, sikkerhed(felt)])),
    adapter: raw.adapter || null,
  };
}

export function koerIsoleretOcrTest(fixture) {
  if (!fixture || typeof fixture !== "object") return { kind: "contract_error", error: "OCR-fixture mangler." };
  return { kind: "forslag", resultat: normaliserOcrForslag({ ...fixture, adapter: "test" }) };
}


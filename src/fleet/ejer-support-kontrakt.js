export const EJER_SUPPORT_ADAPTER_STATUS = Object.freeze({
  model: "eksisterende mailtråde + serverberegnede portalprojektioner",
  kanal: "email_eller_portal",
  kontraktRevision: "veyro.support.v1.1",
  portalForbundet: "faelles_endpoints_v1_1",
  tilstand: "ejeradapter_forbundet",
});

export const SUPPORT_PORTAL_ADAPTER = "veyro.support.v1.1";

const nytAnmodningId = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll("-", "_")}`;

export const stabiltSupportAnmodningId = (payload, prefix) =>
  payload.anmodningId || payload.operationId || nytAnmodningId(prefix);

export function bygPortalAiPayload(payload) {
  return {
    sagId: payload.traadId,
    anmodningId: stabiltSupportAnmodningId(payload, "intern_ai"),
    instruktion: payload.instruktion,
    forventetSagRevision: payload.forventetSagRevision,
    forventetRevision: payload.forventetRevision || 0,
    basisAktivitetMs: payload.basisAktivitetMs,
    basisKladdeRevision: payload.basisKladdeRevision || 0,
    basisKladdeFingeraftryk: payload.basisKladdeFingeraftryk,
  };
}

export function bygPortalBaggrundPayload(payload) {
  return {
    sagId: payload.traadId,
    anmodningId: stabiltSupportAnmodningId(payload, "baggrund"),
    vaerdi: payload.vaerdi,
    forventetSagRevision: payload.forventetSagRevision,
    forventetRevision: payload.forventetRevision || 0,
  };
}

export function erPortalSupport(traadEllerPayload = {}) {
  return (traadEllerPayload.kildeAdapter || traadEllerPayload.kilde?.adapter) === SUPPORT_PORTAL_ADAPTER;
}

export function supportKanal(traad = {}) {
  return erPortalSupport(traad) ? "portal" : "email";
}

export function supportStatusVisning(status, ansvarligUid = "") {
  const vaerdi = String(status || "ny");
  if (vaerdi === "triage") return ansvarligUid
    ? { label: "Faglig afklaring", forklaring: "Sagen har en ansvarlig og er under faglig afklaring." }
    : { label: "Skal fordeles", forklaring: "Sagen mangler en ansvarlig ejer." };
  const labels = { ny: "Ny", afventer_os: "Afventer os", afventer_kunden: "Afventer kunden", loest: "Løst", lukket: "Lukket" };
  return { label: labels[vaerdi] || "Status kræver gennemgang", forklaring: "Status er registreret på supportsagen." };
}

export function opretEjerSupportAdapter(transport = {}) {
  return Object.freeze({ status: EJER_SUPPORT_ADAPTER_STATUS, ...transport });
}

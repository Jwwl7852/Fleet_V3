/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/fakturacenter-kontrol.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/*
 * Fakturacenterets autoritative kontrolforloeb.
 *
 * Veyro-kontrol er bevidst adskilt fra fakturaens `status`, som beskriver
 * betalingsgodkendelse/bogfoering. En post kan derfor vaere arkiveret i
 * Veyros kontrolforloeb uden at vi paastaar, at den er betalt eller bogfoert.
 * Filen kopieres mekanisk til functions/delt, saa klient og server bruger
 * samme ordlister og validering.
 */

export const FAKTURAKONTROL_STATUS = Object.freeze({
  indbakke: "indbakke",
  ekstraKontrol: "ekstra-kontrol",
  arkiveret: "arkiveret",
});

export const FAKTURAKONTROL_HANDLING = Object.freeze({
  kontroller: "kontroller",
  ekstraGodkend: "ekstra-godkend",
  ekstraAfvis: "ekstra-afvis",
});

export const FAKTURAKONTROL_MODEL = Object.freeze({
  ingen: "ingen",
  alle: "alle",
  overBeloeb: "over-beloeb",
});

export const STANDARD_FAKTURAKONTROL_OPSAETNING = Object.freeze({
  model: FAKTURAKONTROL_MODEL.ingen,
  graenseNettoOere: null,
  kontrollantUids: [],
  revision: 0,
});

const modeller = new Set(Object.values(FAKTURAKONTROL_MODEL));
const handlinger = new Set(Object.values(FAKTURAKONTROL_HANDLING));
const destinationer = new Set(["fleet", "facility", "procure", "lager", "ingen"]);

export function kontrolRevision(faktura) {
  const revision = Number(faktura?.kontrolRevision ?? 0);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

export function normaliserFakturakontrolOpsaetning(opsaetning = {}) {
  const model = modeller.has(opsaetning.model)
    ? opsaetning.model
    : FAKTURAKONTROL_MODEL.ingen;
  const kontrollantUids = [...new Set(
    (Array.isArray(opsaetning.kontrollantUids) ? opsaetning.kontrollantUids : [])
      .map((uid) => String(uid || "").trim())
      .filter(Boolean),
  )].sort();
  const graense = Number(opsaetning.graenseNettoOere);
  const revision = Number(opsaetning.revision ?? 0);
  return {
    model,
    graenseNettoOere: model === FAKTURAKONTROL_MODEL.overBeloeb
      && Number.isSafeInteger(graense) && graense >= 0 ? graense : null,
    kontrollantUids,
    revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
  };
}

export function validerFakturakontrolOpsaetning(opsaetning = {}) {
  const normaliseret = normaliserFakturakontrolOpsaetning(opsaetning);
  const fejl = {};
  if (!modeller.has(opsaetning.model)) fejl.model = "Vælg en gyldig kontrolmodel.";
  if (normaliseret.model === FAKTURAKONTROL_MODEL.overBeloeb
    && normaliseret.graenseNettoOere == null) {
    fejl.graenseNettoOere = "Beløbsgrænsen skal være et positivt beløb i hele øre ekskl. moms.";
  }
  if (normaliseret.model !== FAKTURAKONTROL_MODEL.ingen
    && normaliseret.kontrollantUids.length === 0) {
    fejl.kontrollantUids = "Udpeg mindst én ekstra kontrollant, før ekstra kontrol aktiveres.";
  }
  if (normaliseret.kontrollantUids.some((uid) => uid.length > 128)) {
    fejl.kontrollantUids = "En kontrollantreference er ugyldig.";
  }
  return { ok: Object.keys(fejl).length === 0, fejl, opsaetning: normaliseret };
}

/** Beløbsgrænsen er ekskl. moms. Kreditnotaer vurderes på absolut størrelse. */
export function fakturaKraeverEkstraKontrol(faktura, opsaetning) {
  const indstilling = normaliserFakturakontrolOpsaetning(opsaetning);
  if (indstilling.model === FAKTURAKONTROL_MODEL.ingen) return false;
  if (indstilling.model === FAKTURAKONTROL_MODEL.alle) return true;
  const nettoOere = Number(faktura?.beloebOere);
  return Number.isSafeInteger(nettoOere)
    && Math.abs(nettoOere) > indstilling.graenseNettoOere;
}

function grundlagErAfklaret(faktura) {
  if (!destinationer.has(faktura?.destinationArt)) return false;
  if (faktura.destinationArt === "ingen") {
    return typeof faktura.destinationGrund === "string" && faktura.destinationGrund.trim().length > 0;
  }
  return typeof faktura.destinationId === "string" && faktura.destinationId.length > 0;
}

export function vurderFakturakontrol({ faktura, opsaetning, handling, uid, forventetRevision, begrundelse } = {}) {
  const status = faktura?.kontrolstatus || FAKTURAKONTROL_STATUS.indbakke;
  const revision = kontrolRevision(faktura);
  if (!handlinger.has(handling)) return { ok: false, kode: "ugyldig-handling", besked: "Vælg en gyldig kontrolhandling." };
  if (!uid) return { ok: false, kode: "mangler-bruger", besked: "Brugeren kan ikke identificeres." };
  if (!Number.isSafeInteger(forventetRevision) || forventetRevision < 0) {
    return { ok: false, kode: "ugyldig-revision", besked: "Fakturaens forventede revision er ugyldig." };
  }
  if (revision !== forventetRevision) {
    return { ok: false, kode: "revisionskonflikt", besked: "Fakturaen er ændret i en anden session." };
  }
  if (!Number.isSafeInteger(Number(faktura?.beloebOere))) {
    return { ok: false, kode: "mangler-beloeb", besked: "Fakturaens nettobeløb kan ikke verificeres." };
  }
  if (faktura?.status !== "modtaget") {
    return { ok: false, kode: "betalingsstatus", besked: "Kun en modtaget faktura kan gennemføre Veyro-kontrollen." };
  }

  if (handling === FAKTURAKONTROL_HANDLING.kontroller) {
    if (status !== FAKTURAKONTROL_STATUS.indbakke) {
      return { ok: false, kode: "forkert-status", besked: "Fakturaen ligger ikke i Indbakke." };
    }
    if (!grundlagErAfklaret(faktura)) {
      return { ok: false, kode: "mangler-grundlag", besked: "Destination og kontrolgrundlag skal være afklaret først." };
    }
    return { ok: true };
  }

  if (status !== FAKTURAKONTROL_STATUS.ekstraKontrol) {
    return { ok: false, kode: "forkert-status", besked: "Fakturaen afventer ikke ekstra kontrol." };
  }
  const indstilling = normaliserFakturakontrolOpsaetning(opsaetning);
  if (!indstilling.kontrollantUids.includes(uid)) {
    return { ok: false, kode: "ikke-udpeget", besked: "Du er ikke udpeget som ekstra kontrollant." };
  }
  if (faktura.kontrolleretAf === uid) {
    return { ok: false, kode: "egen-godkendelse", besked: "Ekstra kontrol skal udføres af en anden person." };
  }
  if (handling === FAKTURAKONTROL_HANDLING.ekstraAfvis
    && !String(begrundelse || "").trim()) {
    return { ok: false, kode: "mangler-begrundelse", besked: "Skriv hvorfor fakturaen sendes tilbage." };
  }
  return { ok: true };
}

export function anvendFakturakontrol({ faktura, opsaetning, handling, uid, nu, operationId, begrundelse } = {}) {
  const fra = faktura?.kontrolstatus || FAKTURAKONTROL_STATUS.indbakke;
  let til;
  if (handling === FAKTURAKONTROL_HANDLING.kontroller) {
    til = fakturaKraeverEkstraKontrol(faktura, opsaetning)
      ? FAKTURAKONTROL_STATUS.ekstraKontrol
      : FAKTURAKONTROL_STATUS.arkiveret;
  } else if (handling === FAKTURAKONTROL_HANDLING.ekstraGodkend) {
    til = FAKTURAKONTROL_STATUS.arkiveret;
  } else {
    til = FAKTURAKONTROL_STATUS.indbakke;
  }

  const revision = kontrolRevision(faktura) + 1;
  const historik = {
    handling,
    fra,
    til,
    uid,
    ms: nu,
    operationId,
    ...(String(begrundelse || "").trim() ? { begrundelse: String(begrundelse).trim() } : {}),
  };
  const naeste = {
    ...faktura,
    kontrolstatus: til,
    kontrolRevision: revision,
  };

  if (handling === FAKTURAKONTROL_HANDLING.kontroller) {
    naeste.kontrolleretAf = uid;
    naeste.kontrolleretMs = nu;
    delete naeste.ekstraKontrolleretAf;
    delete naeste.ekstraKontrolleretMs;
  } else if (handling === FAKTURAKONTROL_HANDLING.ekstraGodkend) {
    naeste.ekstraKontrolleretAf = uid;
    naeste.ekstraKontrolleretMs = nu;
  } else {
    delete naeste.kontrolleretAf;
    delete naeste.kontrolleretMs;
    delete naeste.ekstraKontrolleretAf;
    delete naeste.ekstraKontrolleretMs;
  }

  return { faktura: naeste, historik, status: til, revision };
}

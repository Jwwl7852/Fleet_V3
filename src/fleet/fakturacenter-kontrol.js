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

export const FAKTURAKONTROL_MODULER = Object.freeze(["fleet", "facility", "procure"]);

const STANDARD_MODULREGEL = Object.freeze({
  model: FAKTURAKONTROL_MODEL.ingen,
  graenseNettoOere: null,
  kontrollantUid: null,
});

export const STANDARD_FAKTURAKONTROL_OPSAETNING = Object.freeze({
  version: 2,
  moduler: Object.freeze(Object.fromEntries(
    FAKTURAKONTROL_MODULER.map((modul) => [modul, STANDARD_MODULREGEL]),
  )),
  revision: 0,
});

const modeller = new Set(Object.values(FAKTURAKONTROL_MODEL));
const handlinger = new Set(Object.values(FAKTURAKONTROL_HANDLING));
const destinationer = new Set(["fleet", "facility", "procure", "lager", "ingen"]);

export function kontrolRevision(faktura) {
  const revision = Number(faktura?.kontrolRevision ?? 0);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

function normaliserModulregel(regel = {}) {
  const model = modeller.has(regel.model) ? regel.model : FAKTURAKONTROL_MODEL.ingen;
  const legacyUid = Array.isArray(regel.kontrollantUids) ? regel.kontrollantUids[0] : null;
  const kontrollantUid = String(regel.kontrollantUid || legacyUid || "").trim() || null;
  const graense = Number(regel.graenseNettoOere);
  return {
    model,
    graenseNettoOere: model === FAKTURAKONTROL_MODEL.overBeloeb
      && Number.isSafeInteger(graense) && graense >= 0 ? graense : null,
    kontrollantUid,
  };
}

export function normaliserFakturakontrolOpsaetning(opsaetning = {}) {
  /* Version 1 havde én global regel. Den læses fortsat deterministisk som
     samme regel for alle tre moduler, men alle nye writes gemmes som v2. */
  const harModuler = opsaetning.moduler && typeof opsaetning.moduler === "object";
  const legacyRegel = normaliserModulregel(opsaetning);
  const moduler = Object.fromEntries(FAKTURAKONTROL_MODULER.map((modul) => [
    modul,
    normaliserModulregel(harModuler ? opsaetning.moduler[modul] : legacyRegel),
  ]));
  const revision = Number(opsaetning.revision ?? 0);
  return {
    version: 2,
    moduler,
    revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
  };
}

export function validerFakturakontrolOpsaetning(opsaetning = {}) {
  const normaliseret = normaliserFakturakontrolOpsaetning(opsaetning);
  const fejl = {};
  for (const modul of FAKTURAKONTROL_MODULER) {
    const rå = opsaetning.moduler?.[modul] || (!opsaetning.moduler ? opsaetning : {});
    const regel = normaliseret.moduler[modul];
    if (!modeller.has(rå.model)) fejl[`${modul}.model`] = `Vælg en gyldig kontrolmodel for ${modul}.`;
    if (regel.model === FAKTURAKONTROL_MODEL.overBeloeb && regel.graenseNettoOere == null) {
      fejl[`${modul}.graenseNettoOere`] = `Beløbsgrænsen for ${modul} skal være i hele øre ekskl. moms.`;
    }
    if (regel.model !== FAKTURAKONTROL_MODEL.ingen && !regel.kontrollantUid) {
      fejl[`${modul}.kontrollantUid`] = `Udpeg en ekstra kontrollant for ${modul}.`;
    }
    if (regel.kontrollantUid && regel.kontrollantUid.length > 128) {
      fejl[`${modul}.kontrollantUid`] = `Kontrollantreferencen for ${modul} er ugyldig.`;
    }
  }
  return { ok: Object.keys(fejl).length === 0, fejl, opsaetning: normaliseret };
}

function modulsummer(faktura = {}) {
  const summer = Object.fromEntries(FAKTURAKONTROL_MODULER.map((modul) => [modul, 0]));
  if (Array.isArray(faktura.fordelinger) && faktura.fordelinger.length) {
    for (const post of faktura.fordelinger) {
      const modul = String(post?.modul || "").toLowerCase();
      const nettoOere = Number(post?.nettoOere);
      if (modul in summer && Number.isSafeInteger(nettoOere)) summer[modul] += nettoOere;
    }
    return summer;
  }
  const modul = String(faktura.destinationArt || "").toLowerCase();
  const nettoOere = Number(faktura.beloebOere);
  if (modul in summer && Number.isSafeInteger(nettoOere)) summer[modul] = nettoOere;
  return summer;
}

/** Et trin beregnes på modulets summerede nettoandel ekskl. moms. */
export function fakturakontrolTrin(faktura, opsaetning) {
  const indstilling = normaliserFakturakontrolOpsaetning(opsaetning);
  const summer = modulsummer(faktura);
  return FAKTURAKONTROL_MODULER.flatMap((modul) => {
    const nettoOere = summer[modul];
    const regel = indstilling.moduler[modul];
    const kræves = nettoOere !== 0 && (regel.model === FAKTURAKONTROL_MODEL.alle
      || (regel.model === FAKTURAKONTROL_MODEL.overBeloeb
        && Math.abs(nettoOere) > regel.graenseNettoOere));
    return kræves ? [{ modul, nettoOere, kontrollantUid: regel.kontrollantUid }] : [];
  });
}

export function fakturaKraeverEkstraKontrol(faktura, opsaetning) {
  return fakturakontrolTrin(faktura, opsaetning).length > 0;
}

function eksisterendeKontroltrin(faktura, opsaetning) {
  if (faktura?.modulKontroller && Object.keys(faktura.modulKontroller).length) {
    return faktura.modulKontroller;
  }
  /* Allerede igangsatte v1-fakturaer kan afsluttes uden datamigration. */
  return Object.fromEntries(fakturakontrolTrin(faktura, opsaetning).map((trin) => [
    trin.modul, { ...trin, status: "afventer" },
  ]));
}

function grundlagErAfklaret(faktura) {
  if (!destinationer.has(faktura?.destinationArt)) return false;
  if (faktura.destinationArt === "ingen") {
    return typeof faktura.destinationGrund === "string" && faktura.destinationGrund.trim().length > 0;
  }
  return typeof faktura.destinationId === "string" && faktura.destinationId.length > 0;
}

export function vurderFakturakontrol({ faktura, opsaetning, handling, uid, modul, forventetRevision, begrundelse } = {}) {
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
  const modulKontroller = eksisterendeKontroltrin(faktura, opsaetning);
  const afventende = Object.values(modulKontroller)
    .filter((trin) => trin?.status === "afventer");
  const valgtModul = modul || (afventende.length === 1 ? afventende[0].modul : null);
  const trin = modulKontroller[valgtModul];
  if (!trin || trin.status !== "afventer") {
    return { ok: false, kode: "mangler-modul", besked: "Vælg det modul, der skal ekstra kontrolleres." };
  }
  if (faktura.kontrolleretAf === uid) {
    return { ok: false, kode: "egen-godkendelse", besked: "Ekstra kontrol skal udføres af en anden person." };
  }
  if (trin.kontrollantUid !== uid) {
    return { ok: false, kode: "ikke-udpeget", besked: "Du er ikke udpeget som ekstra kontrollant." };
  }
  if (handling === FAKTURAKONTROL_HANDLING.ekstraAfvis
    && !String(begrundelse || "").trim()) {
    return { ok: false, kode: "mangler-begrundelse", besked: "Skriv hvorfor fakturaen sendes tilbage." };
  }
  return { ok: true, modul: valgtModul };
}

export function anvendFakturakontrol({ faktura, opsaetning, handling, uid, modul, nu, operationId, begrundelse } = {}) {
  const fra = faktura?.kontrolstatus || FAKTURAKONTROL_STATUS.indbakke;
  let til;
  let valgtModul = modul;
  let modulKontroller = { ...eksisterendeKontroltrin(faktura, opsaetning) };
  if (handling === FAKTURAKONTROL_HANDLING.kontroller) {
    const trin = fakturakontrolTrin(faktura, opsaetning);
    modulKontroller = Object.fromEntries(trin.map((post) => [post.modul, {
      ...post, status: "afventer", oprettetMs: nu,
    }]));
    til = trin.length ? FAKTURAKONTROL_STATUS.ekstraKontrol : FAKTURAKONTROL_STATUS.arkiveret;
  } else if (handling === FAKTURAKONTROL_HANDLING.ekstraGodkend) {
    if (!valgtModul) {
      const afventende = Object.values(modulKontroller).filter((trin) => trin?.status === "afventer");
      valgtModul = afventende.length === 1 ? afventende[0].modul : null;
    }
    modulKontroller[valgtModul] = {
      ...modulKontroller[valgtModul], status: "godkendt", godkendtAf: uid, godkendtMs: nu,
    };
    til = Object.values(modulKontroller).every((trin) => trin.status === "godkendt")
      ? FAKTURAKONTROL_STATUS.arkiveret : FAKTURAKONTROL_STATUS.ekstraKontrol;
  } else {
    if (!valgtModul) {
      const afventende = Object.values(modulKontroller).filter((trin) => trin?.status === "afventer");
      valgtModul = afventende.length === 1 ? afventende[0].modul : null;
    }
    modulKontroller[valgtModul] = {
      ...modulKontroller[valgtModul], status: "afvist", afvistAf: uid, afvistMs: nu,
      begrundelse: String(begrundelse || "").trim(),
    };
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
    ...(valgtModul ? { modul: valgtModul } : {}),
    ...(String(begrundelse || "").trim() ? { begrundelse: String(begrundelse).trim() } : {}),
  };
  const naeste = {
    ...faktura,
    kontrolstatus: til,
    kontrolRevision: revision,
    modulKontroller,
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

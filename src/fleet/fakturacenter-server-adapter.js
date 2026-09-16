import {
  DUBLET_STATUS,
  FAKTURAART,
  FAKTURAVINDUE,
  INDBAKKE_SEKTION,
  KONTROL_STATUS,
  MATCH_OPRINDELSE,
} from "./fakturacenter-intake.js";
import { FAKTURAKONTROL_STATUS } from "./fakturacenter-kontrol.js";

const MODUL_LABEL = Object.freeze({
  fleet: "FLEET",
  facility: "FACILITY",
  procure: "PROCURE",
  lager: "WAREHOUSE",
});

function heltOere(vaerdi) {
  if (vaerdi === null || vaerdi === undefined || vaerdi === "") return null;
  const tal = Number(vaerdi);
  return Number.isSafeInteger(tal) ? tal : null;
}

function datoFraMs(ms) {
  return Number.isSafeInteger(Number(ms))
    ? new Date(Number(ms)).toISOString().slice(0, 10)
    : null;
}

function vaerdier(samling) {
  if (Array.isArray(samling)) return samling;
  return samling && typeof samling === "object" ? Object.values(samling) : [];
}

function modulLabel(art) {
  return MODUL_LABEL[String(art || "").toLowerCase()] || null;
}

function sektionFor(status) {
  if (status === FAKTURAKONTROL_STATUS.ekstraKontrol) return INDBAKKE_SEKTION.ekstraKontrol;
  if (status === FAKTURAKONTROL_STATUS.arkiveret) return INDBAKKE_SEKTION.arkiv;
  return INDBAKKE_SEKTION.indbakke;
}

function normaliserHistorik(historik) {
  return vaerdier(historik).map((post) => ({
    handling: String(post?.handling || "kontrolhandling"),
    brugerId: String(post?.uid || post?.brugerId || "server"),
    tidspunktMs: heltOere(post?.ms ?? post?.tidspunktMs),
    ...(post?.begrundelse ? { begrundelse: String(post.begrundelse) } : {}),
  })).sort((a, b) => (a.tidspunktMs || 0) - (b.tidspunktMs || 0));
}

function normaliserFordelinger(faktura, fakturaId) {
  return vaerdier(faktura?.fordelinger).flatMap((post, indeks) => {
    const modul = modulLabel(post?.modul || post?.destinationArt);
    const destinationId = String(post?.destinationId || "").trim();
    const nettoOere = heltOere(post?.nettoOere);
    if (!modul || !destinationId || nettoOere == null) return [];
    return [{
      fordelingId: String(post?.fordelingId || `${fakturaId}-fordeling-${indeks + 1}`),
      destinationId,
      modul,
      nettoOere,
      koststed: post?.koststed || null,
    }];
  });
}

function destinationFor(faktura) {
  const modul = modulLabel(faktura?.destinationArt);
  const destinationId = String(faktura?.destinationId || "").trim();
  if (!modul || !destinationId) return null;
  return {
    destinationId,
    modul,
    navn: String(faktura?.destinationNavn || `${modul} · ${destinationId}`),
    enhed: null,
    lokation: faktura?.destinationLokation || null,
    koststeder: [],
    fakturastatus: faktura?.destinationFakturastatus || null,
    leverandoer: { navn: faktura?.leverandoernavn || null },
    referencer: faktura?.reference ? [String(faktura.reference)] : [],
    forventetNettoOere: null,
  };
}

/**
 * Projekterer den autoritative `fakturaer`-post til den eksisterende
 * trepanelvisning. Adapteren opfinder hverken dokumentindhold, matchscore
 * eller lagringsstatus; manglende serverfelter forbliver eksplicit ukendte.
 */
export function serverFakturaTilScenarie(faktura = {}) {
  const fakturaId = String(faktura.id || faktura.fakturaId || "").trim();
  if (!fakturaId) return null;
  const nettoOere = heltOere(faktura.beloebOere);
  const momsOere = heltOere(faktura.momsOere);
  const totalOere = nettoOere != null && momsOere != null && Number.isSafeInteger(nettoOere + momsOere)
    ? nettoOere + momsOere
    : null;
  const serverKontrolstatus = Object.values(FAKTURAKONTROL_STATUS).includes(faktura.kontrolstatus)
    ? faktura.kontrolstatus
    : FAKTURAKONTROL_STATUS.indbakke;
  const destination = destinationFor(faktura);
  const leverandoernavn = String(
    faktura.leverandoernavn || faktura.leverandoerNavn || faktura.leverandoerId || "",
  ).trim() || null;
  const fakturanummer = String(faktura.fakturanummer || "").trim() || null;
  const modtagetMs = heltOere(faktura.modtagetMs ?? faktura.oprettetMs ?? faktura.fakturadatoMs);
  const fakturaart = ["credit-note", "kreditnota"].includes(faktura.fakturatype)
    ? FAKTURAART.kreditnota
    : FAKTURAART.faktura;
  const fordelinger = normaliserFordelinger(faktura, fakturaId);
  const historik = normaliserHistorik(faktura.kontrolHistorik);
  const original = {
    fakturaart,
    fakturanummer,
    leverandoerId: faktura.leverandoerId || null,
    leverandoernavn,
    leverandoerCvr: faktura.leverandoerCvr || null,
    fakturadato: datoFraMs(faktura.fakturadatoMs),
    forfaldsdato: datoFraMs(faktura.forfaldMs),
    nettoOere,
    momsOere,
    totalOere,
    valuta: faktura.valuta || "DKK",
    land: faktura.land || null,
    ordreOpgaveNumre: faktura.reference ? [String(faktura.reference)] : [],
    enhedsnumre: faktura.enhedsnummer ? [String(faktura.enhedsnummer)] : [],
    registreringsnumre: faktura.registreringsnummer ? [String(faktura.registreringsnummer)] : [],
    stelSerieNumre: [],
    enhedsnavne: [],
    kundereferencer: [],
    fakturalinjer: [],
  };

  return {
    id: fakturaId,
    nummer: fakturanummer || fakturaId,
    titel: leverandoernavn || "Leverandør ikke oplyst",
    beskrivelse: fakturanummer
      ? `Faktura ${fakturanummer} fra den tilsluttede datakilde.`
      : "Faktura fra den tilsluttede datakilde; fakturanummer er ikke oplyst.",
    sektion: sektionFor(serverKontrolstatus),
    serverKilde: true,
    intake: {
      kilde: faktura.kilde || "Tilsluttet datakilde",
      dokumenttype: faktura.dokumenttype || "Ikke oplyst",
      modtagetMs,
      original: {
        filnavn: faktura.filnavn || "Originalfil ikke registreret",
        sha256: faktura.sha256 || null,
      },
    },
    aflæsning: { original, rettelseshistorik: [] },
    match: {
      trin: destination ? "manuel" : "uafklaret",
      årsag: destination ? "serverregistreret-destination" : "destination-ikke-oplyst",
      oprindelse: destination ? MATCH_OPRINDELSE.manuel : MATCH_OPRINDELSE.ikkePlaceret,
      fundetEnhed: null,
      placering: destination,
      kandidater: destination ? [destination] : [],
    },
    faktura: {
      fakturaId,
      fakturaart,
      fakturanummer,
      leverandoerId: faktura.leverandoerId || null,
      leverandoernavn,
      leverandoerCvr: faktura.leverandoerCvr || null,
      nettoOere,
      momsOere,
      totalOere,
      valuta: faktura.valuta || "DKK",
      fordelinger,
      fordeling: fordelinger,
      kontrolstatus: serverKontrolstatus === FAKTURAKONTROL_STATUS.arkiveret
        ? KONTROL_STATUS.kontrolleret
        : KONTROL_STATUS.tilKontrol,
      serverKontrolstatus,
      kontrolRevision: Number.isSafeInteger(Number(faktura.kontrolRevision))
        ? Number(faktura.kontrolRevision)
        : 0,
      modulKontroller: faktura.modulKontroller && typeof faktura.modulKontroller === "object"
        ? structuredClone(faktura.modulKontroller) : {},
      matchOprindelse: destination ? MATCH_OPRINDELSE.manuel : MATCH_OPRINDELSE.ikkePlaceret,
      låst: serverKontrolstatus === FAKTURAKONTROL_STATUS.arkiveret,
      historik,
      dubletstatus: faktura.dubletstatus || DUBLET_STATUS.ingen,
      uløsteAdvarsler: [],
      betalingsstatus: faktura.status || null,
    },
  };
}

export function serverFakturaerTilScenarier(fakturaer = []) {
  return fakturaer.map(serverFakturaTilScenarie).filter(Boolean);
}

export const FAKTURACENTER_SERVER_ADAPTER = Object.freeze({
  kilde: "tenants/{tenantId}/fakturaer",
  dokumentFallback: false,
  understøttedeDestinationer: Object.keys(MODUL_LABEL),
  ukendtFakturavindue: FAKTURAVINDUE,
});

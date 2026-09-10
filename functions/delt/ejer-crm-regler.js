/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/ejer-crm-regler.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/* Ren CRM-politik delt mellem ejer-UI, tests og Cloud Functions. */
import { ukendteModuler } from "./moduler.js";

export const CRM_FASE = Object.freeze({
  ny: "Ny henvendelse",
  behov: "Behov afklaret",
  demo: "Demo/pilot",
  tilbud: "Tilbud sendt",
  forhandling: "Forhandling",
  vundet: "Vundet",
  tabt: "Tabt",
});

export const CRM_AKTIVITETSART = Object.freeze({
  opkald: "Opkald",
  moede: "Møde",
  mail: "Mail",
  demonstration: "Demonstration",
  pilot: "Pilot",
  opgave: "Opgave",
});

export const CRM_KILDE = Object.freeze({
  indgaaende: "Indgående henvendelse",
  netvaerk: "Netværk",
  anbefaling: "Anbefaling",
  opsalg: "Eksisterende kunde",
  udgaaende: "Udgående salg",
  anden: "Anden",
});

export const CRM_AKTIVITETSSTATUS = Object.freeze({
  aaben: "Åben",
  afsluttet: "Afsluttet",
});

const ISO_DATO = /^\d{4}-\d{2}-\d{2}$/;
const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RTDB_ID = /^[A-Za-z0-9_-]{1,160}$/;

const tekst = (vaerdi, maks) => {
  const s = typeof vaerdi === "string" ? vaerdi.trim() : "";
  return s ? s.slice(0, maks) : null;
};

const datoEllerNull = (vaerdi) => {
  const s = tekst(vaerdi, 10);
  return s && ISO_DATO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) ? s : null;
};

const heltalsOere = (vaerdi) => {
  const n = Number(vaerdi);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
};

export function validerCrmVirksomhed(input = {}) {
  const fejl = {};
  const navn = tekst(input.navn, 120);
  const cvr = tekst(input.cvr, 20);
  const kontaktEmail = tekst(input.kontaktEmail, 160);
  const fakturaEmail = tekst(input.fakturaEmail, 160);
  const ean = tekst(input.ean, 20);
  const ansvarligUid = tekst(input.ansvarligUid, 128);

  if (!navn) fejl.navn = "Virksomhedsnavn skal udfyldes.";
  if (cvr && !/^\d{8}$/.test(cvr)) fejl.cvr = "CVR skal være otte cifre.";
  if (kontaktEmail && !MAIL.test(kontaktEmail)) fejl.kontaktEmail = "Kontaktmail er ugyldig.";
  if (fakturaEmail && !MAIL.test(fakturaEmail)) fejl.fakturaEmail = "Fakturamail er ugyldig.";
  if (ean && !/^\d{13}$/.test(ean)) fejl.ean = "EAN/GLN skal være 13 cifre.";
  if (!ansvarligUid) fejl.ansvarligUid = "Ansvarlig ejer skal vælges.";
  if (input.tenantId && !/^[a-z0-9][a-z0-9-]{1,39}$/.test(String(input.tenantId))) {
    fejl.tenantId = "Tenant-id har ugyldigt format.";
  }

  return {
    fejl,
    post: {
      navn,
      cvr,
      adresse: tekst(input.adresse, 160),
      postnr: tekst(input.postnr, 12),
      by: tekst(input.by, 80),
      kontaktNavn: tekst(input.kontaktNavn, 120),
      kontaktEmail,
      fakturaEmail,
      afsendelseskanal: ["email", "ean", "manuel"].includes(input.afsendelseskanal)
        ? input.afsendelseskanal : "email",
      ean,
      ansvarligUid,
      noter: tekst(input.noter, 4000),
      tenantId: tekst(input.tenantId, 40),
      dineroKontaktId: tekst(input.dineroKontaktId, 120),
    },
  };
}

export function validerCrmMulighed(input = {}, virksomhedId = input.virksomhedId) {
  const fejl = {};
  const id = tekst(virksomhedId, 160);
  const titel = tekst(input.titel, 160);
  const ansvarligUid = tekst(input.ansvarligUid, 128);
  const fase = tekst(input.fase, 30) || "ny";
  const kilde = tekst(input.kilde, 30) || "anden";
  const kontaktEmail = tekst(input.kontaktEmail, 160);
  const maanedligVaerdiOere = heltalsOere(input.maanedligVaerdiOere);
  const engangsVaerdiOere = heltalsOere(input.engangsVaerdiOere);
  const moduler = [...new Set(Array.isArray(input.moduler) ? input.moduler : [])];

  if (!id || !RTDB_ID.test(id)) fejl.virksomhedId = "Virksomheden mangler.";
  if (!titel) fejl.titel = "Salgsmuligheden skal have en titel.";
  if (!ansvarligUid) fejl.ansvarligUid = "Ansvarlig ejer skal vælges.";
  if (!Object.hasOwn(CRM_FASE, fase)) fejl.fase = "Ukendt pipelinefase.";
  if (!Object.hasOwn(CRM_KILDE, kilde)) fejl.kilde = "Ukendt salgskilde.";
  if (kontaktEmail && !MAIL.test(kontaktEmail)) fejl.kontaktEmail = "Kontaktmail er ugyldig.";
  if (input.forventetLukDato && !datoEllerNull(input.forventetLukDato)) {
    fejl.forventetLukDato = "Forventet afslutning er ugyldig.";
  }
  if (input.naesteAktivitetDato && !datoEllerNull(input.naesteAktivitetDato)) {
    fejl.naesteAktivitetDato = "Datoen for næste aktivitet er ugyldig.";
  }
  if (input.pilotFra && !datoEllerNull(input.pilotFra)) fejl.pilotFra = "Pilotstart er ugyldig.";
  if (input.pilotTil && !datoEllerNull(input.pilotTil)) fejl.pilotTil = "Pilotslut er ugyldig.";
  if (maanedligVaerdiOere === null) fejl.maanedligVaerdiOere = "Månedsværdien skal være nul eller positiv.";
  if (engangsVaerdiOere === null) fejl.engangsVaerdiOere = "Engangsbeløbet skal være nul eller positivt.";
  const ukendte = ukendteModuler(moduler);
  if (ukendte.length) fejl.moduler = `Ukendte moduler: ${ukendte.join(", ")}.`;

  return {
    fejl,
    post: {
      virksomhedId: id,
      titel,
      kontaktNavn: tekst(input.kontaktNavn, 120),
      kontaktEmail,
      ansvarligUid,
      kilde,
      behov: tekst(input.behov, 4000),
      moduler,
      forventetLukDato: datoEllerNull(input.forventetLukDato),
      fase,
      naesteAktivitet: tekst(input.naesteAktivitet, 240),
      naesteAktivitetDato: datoEllerNull(input.naesteAktivitetDato),
      maanedligVaerdiOere,
      engangsVaerdiOere,
      tabtAarsag: fase === "tabt" ? tekst(input.tabtAarsag, 240) : null,
      konkurrent: fase === "tabt" ? tekst(input.konkurrent, 160) : null,
      pilotFra: datoEllerNull(input.pilotFra),
      pilotTil: datoEllerNull(input.pilotTil),
    },
  };
}

export function validerCrmAktivitet(input = {}, virksomhedId = input.virksomhedId) {
  const fejl = {};
  const id = tekst(virksomhedId, 160);
  const titel = tekst(input.titel, 200);
  const ansvarligUid = tekst(input.ansvarligUid, 128);
  const art = tekst(input.art, 30) || "opgave";
  const status = tekst(input.status, 20) || "aaben";

  if (!id || !RTDB_ID.test(id)) fejl.virksomhedId = "Virksomheden mangler.";
  if (!titel) fejl.titel = "Aktiviteten skal have en titel.";
  if (!ansvarligUid) fejl.ansvarligUid = "Ansvarlig ejer skal vælges.";
  if (!Object.hasOwn(CRM_AKTIVITETSART, art)) fejl.art = "Ukendt aktivitetstype.";
  if (!Object.hasOwn(CRM_AKTIVITETSSTATUS, status)) fejl.status = "Ukendt aktivitetsstatus.";
  if (input.fristDato && !datoEllerNull(input.fristDato)) fejl.fristDato = "Fristen er ugyldig.";
  if (input.mulighedId && !RTDB_ID.test(String(input.mulighedId))) fejl.mulighedId = "Salgsmuligheden er ugyldig.";

  return {
    fejl,
    post: {
      virksomhedId: id,
      mulighedId: tekst(input.mulighedId, 160),
      titel,
      art,
      ansvarligUid,
      fristDato: datoEllerNull(input.fristDato),
      notat: tekst(input.notat, 4000),
      status,
      resultat: status === "afsluttet" ? tekst(input.resultat, 1000) : null,
    },
  };
}

export const harValideringsfejl = (resultat) => Object.keys(resultat?.fejl || {}).length > 0;

export function crmVirksomhedsliste(data = {}) {
  return Object.entries(data || {}).map(([id, virksomhed]) => ({ id, ...virksomhed }));
}

export function crmMuligheder(virksomheder = {}) {
  return Object.entries(virksomheder || {}).flatMap(([virksomhedId, virksomhed]) =>
    Object.entries(virksomhed?.muligheder || {}).map(([id, mulighed]) => ({
      id, virksomhedId, virksomhedsnavn: virksomhed?.stamdata?.navn || virksomhedId, ...mulighed,
    })),
  );
}

export function crmAktiviteter(virksomheder = {}) {
  return Object.entries(virksomheder || {}).flatMap(([virksomhedId, virksomhed]) =>
    Object.entries(virksomhed?.aktiviteter || {}).map(([id, aktivitet]) => ({
      id, virksomhedId, virksomhedsnavn: virksomhed?.stamdata?.navn || virksomhedId, ...aktivitet,
    })),
  );
}

export const erAabenMulighed = (mulighed) => !["vundet", "tabt"].includes(mulighed?.fase);

export const erForfaldenAktivitet = (aktivitet, iDag) =>
  aktivitet?.status !== "afsluttet"
  && Boolean(aktivitet?.fristDato)
  && aktivitet.fristDato < iDag;


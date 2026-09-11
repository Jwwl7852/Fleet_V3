/* Fælles tilbudsmodel. Alle bindende beløb beregnes igen på serveren. */
import {
  ANTAL_SKALA, BPS_SKALA, linjeBeloebOere, rabatteretSatsOere, totalerAfLinjer,
} from "./beloeb.js";
import { MODUL } from "./moduler.js";

export const TILBUD_STATUS = Object.freeze({
  kladde: "Kladde", klar: "Klar", sendt: "Sendt", accepteret: "Accepteret",
  afvist: "Afvist", udloebet: "Udløbet",
});
export const FAKTURERING = Object.freeze({ maanedlig: "Månedligt abonnement", engang: "Engangsbeløb" });
export const TILBUDSTYPE = Object.freeze({ almindelig: "Almindeligt tilbud", pilot: "Pilotprojekt alene", pilot_med_drift: "Pilotprojekt + vejledende driftstilbud" });
export const TILBUD_LINJEART = Object.freeze({
  grundplatform: "Grundplatform", modul: "Modul", enhed: "Enhed/hardware",
  medarbejder: "Medarbejderbruger", chauffoer: "Chaufførbruger",
  implementering: "Implementering", konsulent_fjern: "Konsulent — fjernarbejde",
  konsulent_kunde: "Konsulent — hos kunden", specialudvikling: "Specialudvikling",
  andet: "Anden aftalt ydelse",
});

/**
 * Omsætter den eksisterende, versionerede prisliste til valgbare tilbudslinjer.
 * Der opfindes ingen priser: kun positive satser fra det valgte snapshot
 * kommer med. FAKTURACENTER findes ikke som et kommercielt modul-id i det
 * fælles katalog og kan derfor heller ikke utilsigtet faktureres herfra.
 */
export function ratebladFraPrisliste(prisliste = {}) {
  const prislisteId = tekst(prisliste.id, 160);
  const momssats = heltal(prisliste.momssats, 0, 100);
  if (!prislisteId || momssats === null) return [];
  const kilde = `prisliste:${prislisteId}`;
  const linjer = [];
  const tilfoej = (linje) => {
    if (!Number.isSafeInteger(linje.normalprisOere) || linje.normalprisOere <= 0) return;
    linjer.push({
      ...linje, antal: ANTAL_SKALA, aftaltPrisOere: null, linjerabatBps: 0,
      momssats: linje.momssats ?? momssats,
      rabatberettiget: linje.rabatberettiget !== false,
      priskilde: kilde,
    });
  };

  tilfoej({
    id: `${prislisteId}_grundplatform`, art: "grundplatform",
    navn: "Veyro grundplatform", enhed: "måned", fakturering: "maanedlig",
    normalprisOere: prisliste.platform?.basisOere,
  });
  for (const [modulId, satser] of Object.entries(prisliste.moduler || {})) {
    if (!MODUL[modulId] || MODUL[modulId].altid) continue;
    const modulnavn = MODUL[modulId].label;
    tilfoej({
      id: `${prislisteId}_${modulId}_basis`, art: "modul", modulId,
      navn: modulnavn, enhed: "måned", fakturering: "maanedlig",
      normalprisOere: satser?.basisOere,
    });
    tilfoej({
      id: `${prislisteId}_${modulId}_enhed`, art: "enhed", modulId,
      navn: `${modulnavn} · enhed`, enhed: "enhed/måned", fakturering: "maanedlig",
      normalprisOere: satser?.prKoeretoejOere,
    });
    tilfoej({
      id: `${prislisteId}_${modulId}_desktop`, art: "medarbejder", modulId,
      navn: `${modulnavn} · medarbejderbruger`, enhed: "bruger/måned",
      fakturering: "maanedlig", normalprisOere: satser?.prBrugerOere?.desktop,
    });
    tilfoej({
      id: `${prislisteId}_${modulId}_chauffoer`, art: "chauffoer", modulId,
      navn: `${modulnavn} · chaufførbruger`, enhed: "bruger/måned",
      fakturering: "maanedlig", normalprisOere: satser?.prBrugerOere?.chauffoer,
    });
  }
  for (const [linjeId, linje] of Object.entries(prisliste.tilbudslinjer || {})) {
    tilfoej({
      id: `${prislisteId}_ydelse_${linjeId}`,
      art: linje.art,
      navn: linje.navn,
      beskrivelse: linje.beskrivelse,
      modulId: linje.modulId,
      enhed: linje.enhed,
      fakturering: linje.fakturering,
      normalprisOere: linje.normalprisOere,
      momssats: linje.momssats,
      rabatberettiget: linje.rabatberettiget !== false,
    });
  }
  return linjer;
}

const ISO_DATO = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{1,160}$/;
const tekst = (v, maks) => typeof v === "string" && v.trim() ? v.trim().slice(0, maks) : null;
const heltal = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
};
const dato = (v) => {
  const s = tekst(v, 10);
  return s && ISO_DATO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) ? s : null;
};

/** Lægger hele kalendermåneder til og klemmer månedsslutningen korrekt. */
export function tilfoejKalendermaaneder(isoDato, maaneder) {
  const start = dato(isoDato); const antal = heltal(maaneder, 0, 120);
  if (!start || antal === null) return null;
  const [aar, maaned, dag] = start.split("-").map(Number);
  const maalMaaned = maaned - 1 + antal;
  const maalAar = aar + Math.floor(maalMaaned / 12);
  const normalMaaned = ((maalMaaned % 12) + 12) % 12;
  const sidsteDag = new Date(Date.UTC(maalAar, normalMaaned + 1, 0)).getUTCDate();
  return `${maalAar}-${String(normalMaaned + 1).padStart(2, "0")}-${String(Math.min(dag, sidsteDag)).padStart(2, "0")}`;
}

export function beregnTilbudslinje(input = {}, generelRabatBps = 0) {
  const listeprisOere = heltal(input.normalprisOere);
  const aftaltPrisOere = input.aftaltPrisOere === null || input.aftaltPrisOere === "" || input.aftaltPrisOere === undefined
    ? null : heltal(input.aftaltPrisOere);
  const linjerabatBps = heltal(input.linjerabatBps ?? 0, 0, BPS_SKALA);
  const generel = input.rabatberettiget === false ? 0 : heltal(generelRabatBps ?? 0, 0, BPS_SKALA);
  if ([listeprisOere, linjerabatBps, generel].includes(null) || heltal(input.antal, 1) === null) return null;
  const udgangspunktOere = aftaltPrisOere ?? listeprisOere;
  const efterLinjerabatOere = rabatteretSatsOere(udgangspunktOere, linjerabatBps);
  const satsOere = rabatteretSatsOere(efterLinjerabatOere, generel);
  return {
    ...input, normalprisOere: listeprisOere, aftaltPrisOere, linjerabatBps,
    generelRabatBps: generel, udgangspunktOere, efterLinjerabatOere, satsOere,
    linjetotalOere: linjeBeloebOere({ antal: input.antal, satsOere }),
  };
}

export function beregnTilbud(input = {}) {
  const generelRabatBps = heltal(input.generelRabatBps ?? 0, 0, BPS_SKALA) ?? 0;
  const linjer = (Array.isArray(input.linjer) ? input.linjer : [])
    .map((linje) => beregnTilbudslinje(linje, generelRabatBps)).filter(Boolean);
  const maanedligeLinjer = linjer.filter((l) => l.fakturering === "maanedlig");
  const engangsLinjer = linjer.filter((l) => l.fakturering === "engang");
  const maanedlig = totalerAfLinjer(maanedligeLinjer);
  const engang = totalerAfLinjer(engangsLinjer);
  const introRabatBps = heltal(input.introRabatBps ?? 0, 0, BPS_SKALA) ?? 0;
  const introMaaneder = heltal(input.introMaaneder ?? 0, 0, 120) ?? 0;
  const introLinjer = maanedligeLinjer.map((l) => ({
    ...l, satsOere: rabatteretSatsOere(l.satsOere, introRabatBps),
  }));
  const introMaanedlig = totalerAfLinjer(introLinjer);
  const introIAar = Math.min(12, introMaaneder);
  const foersteAarEksklMomsOere = engang.beloebOere
    + (introMaanedlig.beloebOere * introIAar)
    + (maanedlig.beloebOere * (12 - introIAar));
  return { linjer, maanedlig, introMaanedlig, engang, foersteAarEksklMomsOere };
}

export function validerTilbud(input = {}) {
  const fejl = {};
  const virksomhedId = tekst(input.virksomhedId, 160);
  const mulighedId = tekst(input.mulighedId, 160);
  const udstedelsesdato = dato(input.udstedelsesdato);
  const gyldigTil = dato(input.gyldigTil);
  const generelRabatBps = heltal(input.generelRabatBps ?? 0, 0, BPS_SKALA);
  const introRabatBps = heltal(input.introRabatBps ?? 0, 0, BPS_SKALA);
  const introMaaneder = heltal(input.introMaaneder ?? 0, 0, 120);
  const bindingMaaneder = heltal(input.bindingMaaneder ?? 3, 0, 120);
  const tilbudstype = Object.hasOwn(TILBUDSTYPE, input.tilbudstype) ? input.tilbudstype : "almindelig";
  const pilotStart = tilbudstype === "almindelig" ? null : dato(input.pilotStart);
  const pilotMaaneder = tilbudstype === "almindelig" ? 0 : heltal(input.pilotMaaneder, 1, 24);
  const pilotSlut = pilotStart && pilotMaaneder ? tilfoejKalendermaaneder(pilotStart, pilotMaaneder) : null;
  const pilotEvaluering = tilbudstype === "almindelig" ? null : dato(input.pilotEvaluering);
  if (!virksomhedId || !ID.test(virksomhedId)) fejl.virksomhedId = "Virksomheden mangler.";
  if (mulighedId && !ID.test(mulighedId)) fejl.mulighedId = "Salgsmuligheden er ugyldig.";
  if (!udstedelsesdato) fejl.udstedelsesdato = "Udstedelsesdatoen er ugyldig.";
  if (!gyldigTil) fejl.gyldigTil = "Udløbsdatoen er ugyldig.";
  if (udstedelsesdato && gyldigTil && gyldigTil < udstedelsesdato) fejl.gyldigTil = "Udløbsdatoen ligger før udstedelsen.";
  if (input.valuta !== "DKK") fejl.valuta = "Første version understøtter kun DKK.";
  if (generelRabatBps === null) fejl.generelRabatBps = "Generel rabat skal være 0–100 %.";
  if (introRabatBps === null) fejl.introRabatBps = "Introduktionsrabat skal være 0–100 %.";
  if (introMaaneder === null) fejl.introMaaneder = "Introduktionsperioden er ugyldig.";
  if (bindingMaaneder === null) fejl.bindingMaaneder = "Bindingsperioden er ugyldig.";
  if (tilbudstype !== "almindelig" && !pilotStart) fejl.pilotStart = "Pilotens startdato er ugyldig.";
  if (tilbudstype !== "almindelig" && pilotMaaneder === null) fejl.pilotMaaneder = "Pilotens varighed skal være 1–24 kalendermåneder.";
  if (tilbudstype !== "almindelig" && !pilotEvaluering) fejl.pilotEvaluering = "Vælg en evalueringsdato for piloten.";
  if (pilotEvaluering && pilotStart && (pilotEvaluering < pilotStart || pilotEvaluering > pilotSlut)) fejl.pilotEvaluering = "Evalueringen skal ligge i pilotperioden.";

  const linjer = (Array.isArray(input.linjer) ? input.linjer : []).map((linje, indeks) => {
    const art = tekst(linje.art, 40);
    const fakturering = tekst(linje.fakturering, 20);
    const antal = heltal(linje.antal, 1);
    const normalprisOere = heltal(linje.normalprisOere);
    const aftaltPrisOere = linje.aftaltPrisOere === null || linje.aftaltPrisOere === "" || linje.aftaltPrisOere === undefined
      ? null : heltal(linje.aftaltPrisOere);
    const linjerabatBps = heltal(linje.linjerabatBps ?? 0, 0, BPS_SKALA);
    const momssats = heltal(linje.momssats, 0, 100);
    const modulId = tekst(linje.modulId, 60);
    const prefix = `linjer.${indeks}`;
    if (!tekst(linje.navn, 160)) fejl[`${prefix}.navn`] = "Linjen skal have et navn.";
    if (!Object.hasOwn(TILBUD_LINJEART, art)) fejl[`${prefix}.art`] = "Ukendt linjeart.";
    if (!Object.hasOwn(FAKTURERING, fakturering)) fejl[`${prefix}.fakturering`] = "Ukendt faktureringsform.";
    if (antal === null) fejl[`${prefix}.antal`] = "Mængden skal være positiv.";
    if (normalprisOere === null) fejl[`${prefix}.normalprisOere`] = "Normalprisen er ugyldig.";
    if (linje.aftaltPrisOere !== null && linje.aftaltPrisOere !== "" && linje.aftaltPrisOere !== undefined && aftaltPrisOere === null) fejl[`${prefix}.aftaltPrisOere`] = "Aftalt pris er ugyldig.";
    if (linjerabatBps === null) fejl[`${prefix}.linjerabatBps`] = "Linjerabatten er ugyldig.";
    if (momssats === null) fejl[`${prefix}.momssats`] = "Momssatsen skal angives.";
    if (modulId && !MODUL[modulId]) fejl[`${prefix}.modulId`] = "Ukendt modul.";
    return {
      id: tekst(linje.id, 160) || `linje_${indeks + 1}`, art,
      navn: tekst(linje.navn, 160), beskrivelse: tekst(linje.beskrivelse, 500),
      modulId, enhed: tekst(linje.enhed, 30) || "stk.", fakturering, antal,
      normalprisOere, aftaltPrisOere, linjerabatBps, momssats,
      rabatberettiget: linje.rabatberettiget !== false,
      priskilde: tekst(linje.priskilde, 160),
    };
  });
  if (!linjer.length) fejl.linjer = "Tilbuddet skal have mindst én linje.";
  const post = {
    virksomhedId, mulighedId,
    kontaktNavn: tekst(input.kontaktNavn, 120), kontaktEmail: tekst(input.kontaktEmail, 160),
    udstedelsesdato, gyldigTil, valuta: "DKK", linjer,
    generelRabatBps, introRabatBps, introMaaneder, bindingMaaneder,
    tilbudstype, pilotStart, pilotMaaneder, pilotSlut, pilotEvaluering,
    betalingsbetingelser: tekst(input.betalingsbetingelser, 300) || "Efter aftale",
    indledning: tekst(input.indledning, 4000), behovstekst: tekst(input.behovstekst, 4000),
    loesningsbeskrivelse: tekst(input.loesningsbeskrivelse, 6000),
    forudsaetninger: tekst(input.forudsaetninger, 4000), fritekst: tekst(input.fritekst, 4000),
    pilotOmfang: tekst(input.pilotOmfang, 1000), pilotAktiviteter: tekst(input.pilotAktiviteter, 1000),
    pilotUdenfor: tekst(input.pilotUdenfor, 1000), pilotUafklaret: tekst(input.pilotUafklaret, 1000),
    prislisteId: tekst(input.prislisteId, 160),
  };
  return { fejl, post, beregning: Object.keys(fejl).length ? null : beregnTilbud(post) };
}

export const tilbudsnummer = (aar, sekvens) => `T-${aar}-${String(sekvens).padStart(4, "0")}`;
export const antalTilSkala = (tal) => Math.round(Number(tal || 0) * ANTAL_SKALA);

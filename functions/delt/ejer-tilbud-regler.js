/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/ejer-tilbud-regler.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
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
export const TILBUD_LINJEART = Object.freeze({
  grundplatform: "Grundplatform", modul: "Modul", enhed: "Enhed/hardware",
  medarbejder: "Medarbejderbruger", chauffoer: "Chaufførbruger",
  implementering: "Implementering", konsulent_fjern: "Konsulent — fjernarbejde",
  konsulent_kunde: "Konsulent — hos kunden", specialudvikling: "Specialudvikling",
  andet: "Anden aftalt ydelse",
});

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
    betalingsbetingelser: tekst(input.betalingsbetingelser, 300) || "Efter aftale",
    forudsaetninger: tekst(input.forudsaetninger, 4000), fritekst: tekst(input.fritekst, 4000),
    prislisteId: tekst(input.prislisteId, 160),
  };
  return { fejl, post, beregning: Object.keys(fejl).length ? null : beregnTilbud(post) };
}

export const tilbudsnummer = (aar, sekvens) => `T-${aar}-${String(sekvens).padStart(4, "0")}`;
export const antalTilSkala = (tal) => Math.round(Number(tal || 0) * ANTAL_SKALA);


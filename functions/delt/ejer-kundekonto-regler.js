/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/ejer-kundekonto-regler.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/* Fælles kontrakt for Veyro Systems' kommercielle kundekonto.
 *
 * Kontoen beskriver det aftalte. Kundens egne brugere, roller og driftsdata
 * forbliver i tenantdelen. Beløb og mængder valideres både i browseren og i
 * ejerens callable, og alle bindende beløb beregnes med tilbudsmotoren.
 */
import { beregnTilbud, ratebladFraPrisliste } from "./ejer-tilbud-regler.js";
import { ALLE_MODULER, MODUL, manglendeKrav } from "./moduler.js";

export const KUNDEKONTO_STATUS = Object.freeze({
  opsaetning_mangler: "Opsætning mangler",
  planlagt: "Planlagt",
  aktiv: "Aktiv",
});

export const MODULAKTIVERING = Object.freeze({
  aktiv: "Aktiv",
  planlagt: "Planlagt",
  inaktiv: "Ikke aktiv",
});

const ISO_DATO = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{1,160}$/;
const tekst = (v, maks = 500) => typeof v === "string" && v.trim() ? v.trim().slice(0, maks) : null;
const heltal = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
};
const dato = (v) => {
  const s = tekst(v, 10);
  return s && ISO_DATO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) ? s : null;
};
const antalFraSkala = (v) => Number.isSafeInteger(v) ? Math.round(v / 1000) : null;
const antalTilSkala = (v) => Number.isSafeInteger(Number(v)) ? Number(v) * 1000 : null;

function normaliserProfil(profil = {}) {
  return {
    navn: tekst(profil.navn, 120), cvr: tekst(profil.cvr, 20),
    adresse: tekst(profil.adresse, 160), postnr: tekst(profil.postnr, 12),
    by: tekst(profil.by, 80), kontaktNavn: tekst(profil.kontaktNavn, 120),
    kontaktEmail: tekst(profil.kontaktEmail, 160),
    fakturaEmail: tekst(profil.fakturaEmail, 160), reference: tekst(profil.reference, 120),
  };
}

function normaliserModuler(moduler = [], virkningsdato = null) {
  const set = new Map();
  for (const post of Array.isArray(moduler) ? moduler : []) {
    const id = tekst(typeof post === "string" ? post : post?.id, 60);
    if (!id || !ALLE_MODULER.includes(id) || MODUL[id]?.altid) continue;
    const status = Object.hasOwn(MODULAKTIVERING, post?.status) ? post.status : "aktiv";
    set.set(id, { id, status, startdato: dato(post?.startdato) || virkningsdato });
  }
  return [...set.values()];
}

function normaliserRateLinje(linje = {}, indeks = 0) {
  const fakturering = linje.fakturering === "engang" ? "engang" : linje.fakturering === "maanedlig" ? "maanedlig" : null;
  return {
    id: tekst(linje.id, 160) || `konto_linje_${indeks + 1}`,
    art: tekst(linje.art, 40), navn: tekst(linje.navn, 160),
    beskrivelse: tekst(linje.beskrivelse, 500), modulId: tekst(linje.modulId, 60),
    enhed: tekst(linje.enhed, 30) || "stk.", fakturering,
    antal: heltal(linje.antal, 1), normalprisOere: heltal(linje.normalprisOere),
    aftaltPrisOere: linje.aftaltPrisOere === "" || linje.aftaltPrisOere == null ? null : heltal(linje.aftaltPrisOere),
    linjerabatBps: heltal(linje.linjerabatBps ?? 0, 0, 10000),
    momssats: heltal(linje.momssats ?? 25, 0, 100),
    rabatberettiget: linje.rabatberettiget !== false,
    priskilde: tekst(linje.priskilde, 160),
  };
}

/** Normaliserer og validerer en manuel eller tilbudsafledt kontoændring. */
export function normaliserKundekonto(input = {}) {
  const fejl = {};
  const profil = normaliserProfil(input.profil);
  const virkningsdato = dato(input.abonnement?.virkningsdato);
  const moduler = normaliserModuler(input.moduler, virkningsdato);
  const faerdig = input.faerdig === true;
  const maengder = {
    medarbejderbrugere: heltal(input.maengder?.medarbejderbrugere, 0, 1000000),
    chauffoerbrugere: heltal(input.maengder?.chauffoerbrugere, 0, 1000000),
    enheder: heltal(input.maengder?.enheder, 0, 1000000),
  };
  const obd = {
    hardwareAntal: heltal(input.obd?.hardwareAntal, 0, 1000000),
    hardwarePrisOere: heltal(input.obd?.hardwarePrisOere, 0),
    dataabonnementAntal: heltal(input.obd?.dataabonnementAntal, 0, 1000000),
    dataabonnementPrisOere: heltal(input.obd?.dataabonnementPrisOere, 0),
    leveretAntal: heltal(input.obd?.leveretAntal, 0, 1000000),
    tilknyttetAntal: heltal(input.obd?.tilknyttetAntal, 0, 1000000),
  };
  const abonnement = {
    prislisteId: tekst(input.abonnement?.prislisteId, 160),
    generelRabatBps: heltal(input.abonnement?.generelRabatBps ?? 0, 0, 10000),
    introRabatBps: heltal(input.abonnement?.introRabatBps ?? 0, 0, 10000),
    introMaaneder: heltal(input.abonnement?.introMaaneder ?? 0, 0, 120),
    bindingMaaneder: heltal(input.abonnement?.bindingMaaneder ?? 0, 0, 120),
    interval: input.abonnement?.interval === "maaned" ? "maaned" : null,
    virkningsdato,
    linjer: (Array.isArray(input.abonnement?.linjer) ? input.abonnement.linjer : [])
      .map(normaliserRateLinje),
  };

  if (!profil.navn) fejl["profil.navn"] = "Virksomhedsnavn skal udfyldes.";
  if (profil.cvr && !/^\d{8}$/.test(profil.cvr)) fejl["profil.cvr"] = "CVR skal være otte cifre.";
  for (const felt of ["kontaktEmail", "fakturaEmail"]) {
    if (profil[felt] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profil[felt])) fejl[`profil.${felt}`] = "E-mailadressen er ugyldig.";
  }
  const mangler = manglendeKrav(moduler.filter((m) => m.status !== "inaktiv").map((m) => m.id));
  if (mangler.length) fejl.moduler = mangler.map(({ modul, kraever }) => `${MODUL[modul]?.label || modul} kræver ${MODUL[kraever]?.label || kraever}`).join(", ");
  for (const [felt, vaerdi] of Object.entries(input.maengder || {})) if (vaerdi !== "" && vaerdi != null && maengder[felt] === null) fejl[`maengder.${felt}`] = "Antallet skal være et helt, ikke-negativt tal.";
  for (const [felt, vaerdi] of Object.entries(input.obd || {})) if (vaerdi !== "" && vaerdi != null && obd[felt] === null) fejl[`obd.${felt}`] = "Værdien skal være et helt, ikke-negativt tal.";
  if (obd.leveretAntal != null && obd.hardwareAntal != null && obd.leveretAntal > obd.hardwareAntal) fejl["obd.leveretAntal"] = "Registreret leveret antal kan ikke overstige det aftalte hardwareantal.";
  if (obd.tilknyttetAntal != null && obd.hardwareAntal != null && obd.tilknyttetAntal > obd.hardwareAntal) fejl["obd.tilknyttetAntal"] = "Registreret tilknyttet antal kan ikke overstige det aftalte hardwareantal.";
  if (abonnement.generelRabatBps === null) fejl["abonnement.generelRabatBps"] = "Rabatten skal være 0–100 %.";
  if (abonnement.introRabatBps === null) fejl["abonnement.introRabatBps"] = "Introduktionsrabatten skal være 0–100 %.";
  abonnement.linjer.forEach((linje, indeks) => {
    if (!linje.navn || !linje.art || !linje.fakturering || linje.antal === null || linje.normalprisOere === null || linje.linjerabatBps === null || linje.momssats === null) fejl[`abonnement.linjer.${indeks}`] = "Prislinjen er ufuldstændig eller ugyldig.";
    if (linje.modulId && !ALLE_MODULER.includes(linje.modulId)) fejl[`abonnement.linjer.${indeks}.modulId`] = "Prislinjen peger på et ukendt modul.";
  });
  if (faerdig) {
    for (const [felt, vaerdi] of Object.entries(maengder)) if (vaerdi === null) fejl[`maengder.${felt}`] = "Aftalt antal skal udfyldes, før opsætningen kan aktiveres.";
    if (!abonnement.prislisteId) fejl["abonnement.prislisteId"] = "Vælg et versioneret rateblad.";
    if (!abonnement.virkningsdato) fejl["abonnement.virkningsdato"] = "Vælg en ikrafttrædelsesdato.";
    if (!abonnement.interval) fejl["abonnement.interval"] = "Vælg et understøttet faktureringsinterval.";
    if (!abonnement.linjer.length) fejl["abonnement.linjer"] = "Opsætningen mangler prislinjer.";
  }

  const beregning = Object.keys(fejl).some((n) => n.startsWith("abonnement.linjer") || n === "abonnement.generelRabatBps" || n === "abonnement.introRabatBps")
    ? null : beregnTilbud({
      linjer: abonnement.linjer,
      generelRabatBps: abonnement.generelRabatBps || 0,
      introRabatBps: abonnement.introRabatBps || 0,
      introMaaneder: abonnement.introMaaneder || 0,
    });
  return { fejl, post: { profil, moduler, maengder, obd, abonnement, faerdig }, beregning };
}

/** Aftalte felter fra et accepteret tilbud; beløbene bevares linje for linje. */
export function kundekontoFraTilbudssnapshot(snapshot = {}) {
  const linjer = snapshot.beregning?.linjer || snapshot.linjer || [];
  const moduler = [...new Set(linjer.map((l) => l.modulId).filter((id) => id && ALLE_MODULER.includes(id) && !MODUL[id]?.altid))]
    .map((id) => ({ id, status: "aktiv", startdato: null }));
  const maksAntal = (art, filter = () => true) => {
    const tal = linjer.filter((l) => l.art === art && filter(l)).map((l) => antalFraSkala(l.antal)).filter(Number.isInteger);
    return tal.length ? Math.max(...tal) : null;
  };
  const obdLinjer = linjer.filter((l) => /\bobd\b/i.test(l.navn || ""));
  const obdHardware = obdLinjer.find((l) => l.fakturering === "engang");
  const obdData = obdLinjer.find((l) => l.fakturering === "maanedlig");
  return {
    moduler,
    maengder: { medarbejderbrugere: maksAntal("medarbejder"), chauffoerbrugere: maksAntal("chauffoer"), enheder: maksAntal("enhed", (linje) => !/\bobd\b/i.test(linje.navn || "")) },
    obd: {
      hardwareAntal: obdHardware ? antalFraSkala(obdHardware.antal) : null,
      hardwarePrisOere: obdHardware?.satsOere ?? obdHardware?.aftaltPrisOere ?? obdHardware?.normalprisOere ?? null,
      dataabonnementAntal: obdData ? antalFraSkala(obdData.antal) : null,
      dataabonnementPrisOere: obdData?.satsOere ?? obdData?.aftaltPrisOere ?? obdData?.normalprisOere ?? null,
      leveretAntal: null, tilknyttetAntal: null,
    },
    abonnement: {
      prislisteId: snapshot.prislisteId || null,
      generelRabatBps: snapshot.generelRabatBps || 0,
      introRabatBps: snapshot.introRabatBps || 0,
      introMaaneder: snapshot.introMaaneder || 0,
      bindingMaaneder: snapshot.bindingMaaneder || 0,
      interval: "maaned", virkningsdato: null,
      linjer: linjer.map(normaliserRateLinje),
    },
  };
}

/** Bygger manuelle prislinjer af det valgte, uforanderlige rateblad. */
export function prislinjerTilKundekonto(prisliste, { moduler = [], maengder = {}, obd = {} } = {}) {
  const valgte = new Set(moduler.map((m) => typeof m === "string" ? m : m.id));
  return ratebladFraPrisliste(prisliste).filter((linje) => {
    if (!linje.modulId) return true;
    return valgte.has(linje.modulId);
  }).map((linje) => {
    let antal = 1;
    if (linje.art === "medarbejder") antal = maengder.medarbejderbrugere ?? 0;
    else if (linje.art === "chauffoer") antal = maengder.chauffoerbrugere ?? 0;
    else if (linje.art === "enhed") antal = /\bobd\b/i.test(linje.navn || "") ? (obd.hardwareAntal ?? 0) : (maengder.enheder ?? 0);
    return { ...linje, antal: antalTilSkala(Math.max(0, Number(antal) || 0)) || 1000 };
  });
}

export function kundekontoAendringer(foer = {}, efter = {}) {
  const ud = [];
  const navn = (id) => MODUL[id]?.label || id;
  const gamle = new Set((foer.moduler || []).filter((m) => m.status !== "inaktiv").map((m) => m.id));
  const nye = new Set((efter.moduler || []).filter((m) => m.status !== "inaktiv").map((m) => m.id));
  const til = [...nye].filter((id) => !gamle.has(id));
  const fra = [...gamle].filter((id) => !nye.has(id));
  if (til.length) ud.push(`Tilføjer ${til.map(navn).join(", ")}`);
  if (fra.length) ud.push(`Fjerner ${fra.map(navn).join(", ")}`);
  for (const felt of ["medarbejderbrugere", "chauffoerbrugere", "enheder"]) if (foer.maengder?.[felt] !== efter.maengder?.[felt]) ud.push(`${felt}: ${foer.maengder?.[felt] ?? "ukendt"} → ${efter.maengder?.[felt] ?? "ukendt"}`);
  if (foer.abonnement?.generelRabatBps !== efter.abonnement?.generelRabatBps) ud.push("Den generelle rabat ændres");
  if (foer.abonnement?.prislisteId !== efter.abonnement?.prislisteId) ud.push(`Rateblad: ${efter.abonnement?.prislisteId || "ikke valgt"}`);
  return ud;
}

export const gyldigtKundekontoId = (id) => typeof id === "string" && ID.test(id);

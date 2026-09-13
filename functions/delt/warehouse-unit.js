/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/warehouse-unit.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/*
 * Fælles WAREHOUSE-visning af bookbare, fysiske units.
 *
 * Den eksisterende `kasser/<id>`-post er identiteten. Filen opretter ikke en
 * ny unitmodel og ændrer ikke QR-nyttelasten: mærkatet bærer fortsat id'et
 * ordret. `enheder` er serienummerførte vareforekomster, mens `carriers` er
 * beholdere til beholdning. De tre begreber må ikke tælles som samme objekt.
 *
 * Reglerne her er rene, så de kan bruges af UI, tests og en senere fælles
 * serveradapter uden at få tre forskellige fortolkninger.
 */

import {
  ALLE_VARE_EJERFORHOLD, VARE_EJERFORHOLD, vareEjerforhold,
} from "./warehouse.js";
import { KASSE_ID_MOENSTER } from "./unitbooking.js";

export { ALLE_VARE_EJERFORHOLD, VARE_EJERFORHOLD, vareEjerforhold };

export const FYSISK_OBJEKT = Object.freeze({
  unit: "unit",
  carrier: "carrier",
  vareenhed: "vareenhed",
});

export const UNIT_BEVAEGELSE_ART = Object.freeze({
  modtagelse: { label: "Modtaget", kraeverTil: true },
  flytning: { label: "Flyttet", kraeverFra: true, kraeverTil: true },
  udlevering: { label: "Udleveret", kraeverFra: true },
  retur: { label: "Retur modtaget", kraeverTil: true },
});

export const ALLE_UNIT_BEVAEGELSE_ARTER = Object.keys(UNIT_BEVAEGELSE_ART);
export const UNIT_BEVAEGELSE_KILDER = ["unitbooking", "warehouse"];
// RTDB-nøgler må bl.a. ikke indeholde punktum. Hold mønsteret fælles med
// UNIT Booking og sikkerhedsreglerne, så en gyldig idempotensnøgle altid kan
// bruges direkte som append-only event-id.
export const UNIT_OPERATION_ID_MOENSTER = /^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/;

export function vareEjer(vare = {}, kunder = []) {
  const ejerforhold = vareEjerforhold(vare);
  if (ejerforhold === "egen") return { ejerforhold, label: "Egen virksomhed", kundeId: null };
  const kunde = kunder.find((k) => k.id === vare.kundeId);
  return { ejerforhold, label: kunde?.navn || vare.kundeId || "Kunde mangler", kundeId: vare.kundeId || null };
}

/**
 * En scanner kan sende linjeskift omkring koden. Der afkodes ingen alternativ
 * URI eller præfiks her: gamle mærkater med råt id skal fortsat være sandheden.
 */
export function normaliserUnitKode(kode) {
  if (typeof kode !== "string") return "";
  return kode.trim();
}

export function slaaUnitOp(units = [], kode) {
  const id = normaliserUnitKode(kode);
  if (!id) return { ok: false, art: "tom", besked: "Indtast eller scan en unit-kode." };
  const unit = units.find((u) => u.id === id);
  if (!unit) {
    return {
      ok: false,
      art: "ukendt",
      besked: `Koden ${id} findes ikke i virksomhedens unitregister. Der er ikke oprettet noget.`,
    };
  }
  return { ok: true, art: "fundet", unit };
}

export function valideUnitBevaegelse(post = {}, { units = [], pladser = [] } = {}) {
  const f = {};
  const art = UNIT_BEVAEGELSE_ART[post.art];
  if (!art) f.art = "Vælg en lagerhandling.";
  if (!post.unitId) f.unitId = "Scan eller vælg en unit.";
  else if (!KASSE_ID_MOENSTER.test(String(post.unitId))) f.unitId = "Ugyldigt unit-id.";
  else if (units.length && !units.includes(post.unitId)) f.unitId = "Ukendt unit.";

  if (!UNIT_OPERATION_ID_MOENSTER.test(String(post.operationId || ""))) {
    f.operationId = "Handlingen mangler en gyldig idempotensnøgle.";
  }

  if (art?.kraeverFra && !post.fraPladsId) f.fraPladsId = "Unitten har ingen registreret afgangslokation.";
  if (art?.kraeverTil && !post.tilPladsId) f.tilPladsId = "Vælg en destinationslokation.";
  if (post.fraPladsId && pladser.length && !pladser.includes(post.fraPladsId)) f.fraPladsId = "Ukendt afgangslokation.";
  if (post.tilPladsId && pladser.length && !pladser.includes(post.tilPladsId)) f.tilPladsId = "Ukendt destinationslokation.";
  if (post.fraPladsId && post.fraPladsId === post.tilPladsId) f.tilPladsId = "Vælg en anden lokation.";

  if (post.bookingId != null && typeof post.bookingId !== "string") f.bookingId = "Ugyldig bookingreference.";
  if (post.reference != null && (typeof post.reference !== "string" || post.reference.length > 60)) {
    f.reference = "Referencen må højst være 60 tegn.";
  }
  return f;
}

export function bygWarehouseUnitbevaegelse({
  operationId, unitId, art, fraPladsId = null, tilPladsId = null,
  bookingId = null, reference = null, kilde = "warehouse", tidspunktMs, udfoertAf,
} = {}) {
  const fejl = valideUnitBevaegelse({
    operationId, unitId, art, fraPladsId, tilPladsId, bookingId, reference,
  });
  if (!Number.isSafeInteger(tidspunktMs) || tidspunktMs <= 0) {
    fejl.tidspunktMs = "Serverens tidspunkt mangler.";
  }
  if (!String(udfoertAf || "").trim()) fejl.udfoertAf = "Den udførende bruger mangler.";
  if (!UNIT_BEVAEGELSE_KILDER.includes(kilde)) fejl.kilde = "Ukendt kilde.";
  if (Object.keys(fejl).length) return { ok: false, fejl, bevaegelse: null };
  return {
    ok: true,
    fejl: {},
    bevaegelse: {
      operationId, unitId, art,
      fraPladsId: fraPladsId || null,
      tilPladsId: tilPladsId || null,
      bookingId: bookingId || null,
      reference: reference || null,
      kilde,
      tidspunktMs,
      udfoertAf,
    },
  };
}

/** Reservation er en aftale og ændrer derfor aldrig den fysiske placering. */
export function anvendUnitBevaegelse(unit = {}, post = {}) {
  if (post.art === "udlevering") return { ...unit, pladsId: null, status: "udlaant" };
  if (["modtagelse", "retur", "flytning"].includes(post.art)) {
    return { ...unit, pladsId: post.tilPladsId || null, status: post.art === "retur" ? "ledig" : unit.status };
  }
  return { ...unit };
}

const BINDENDE_BOOKINGER = new Set(["booket", "klargjort", "udlaant"]);

export function bindendeBookingerForUnit(bookinger = [], unitId, undtagBookingId = null) {
  return bookinger.filter((b) =>
    b.kasseId === unitId &&
    b.id !== undtagBookingId &&
    BINDENDE_BOOKINGER.has(b.tilstand));
}

export function kanSelvstaendigUdlevere(unit, bookinger = []) {
  if (!unit) return { ok: false, besked: "Vælg en unit." };
  const reservationer = bindendeBookingerForUnit(bookinger, unit.id);
  if (reservationer.length) {
    return {
      ok: false,
      reservationer,
      besked: `Unitten har ${reservationer.length} aktiv reservation. Åbn reservationen i UNIT Booking før udlevering.`,
    };
  }
  if (!unit.pladsId) return { ok: false, besked: "Unitten er ikke registreret på lager." };
  return { ok: true, reservationer: [] };
}

export function senesteUnitBevaegelser(bevaegelser = [], unitId) {
  return bevaegelser
    .filter((b) => b.unitId === unitId)
    .sort((a, b) => (b.tidspunktMs || 0) - (a.tidspunktMs || 0));
}

/**
 * Samme operationId med samme payload er en genafspilning; anden payload er
 * en konflikt. Serveren skal bruge resultatet i en transaction.
 */
export function sammenlignOperation(gemt, foreslaaet = {}) {
  if (!gemt) return { art: "ny" };
  const felter = ["operationId", "unitId", "art", "fraPladsId", "tilPladsId", "bookingId", "reference", "kilde"];
  const samme = felter.every((felt) => (gemt[felt] ?? null) === (foreslaaet[felt] ?? null));
  return samme
    ? { art: "gentaget", eventId: gemt.eventId || gemt.id || null }
    : { art: "konflikt", besked: "Idempotensnøglen er allerede brugt til en anden handling." };
}

export function lagerBelægningPrOmraade(pladser = [], belaegning = {}) {
  const map = new Map();
  for (const plads of pladser) {
    const lager = plads.hal || "Uden lager";
    const zone = plads.zone || "Uden zone";
    const noegle = `${lager}\u0000${zone}`;
    const nu = map.get(noegle) || { lager, zone, pladser: 0, optaget: 0, spaerret: 0 };
    nu.pladser += 1;
    if (belaegning[plads.id]?.optaget) nu.optaget += 1;
    if (plads.status && plads.status !== "aktiv") nu.spaerret += 1;
    map.set(noegle, nu);
  }
  return [...map.values()]
    .map((r) => ({ ...r, belaegningPct: r.pladser ? Math.round((r.optaget / r.pladser) * 100) : 0 }))
    .sort((a, b) => a.lager.localeCompare(b.lager, "da") || a.zone.localeCompare(b.zone, "da"));
}

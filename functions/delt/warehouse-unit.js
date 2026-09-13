/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/warehouse-unit.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/*
 * Fælles kontrakt for bookbare, fysiske units i UNIT og Warehouse.
 *
 * `kasser/<id>` er den stabile identitet, og QR-nyttelasten er fortsat det
 * rå id. Denne fil er den fælles, rene domæneadapter som Warehouse ejer.
 */
import { KASSE_ID_MOENSTER } from "./unitbooking.js";

export const UNIT_BEVAEGELSE_ART = Object.freeze({
  modtagelse: { label: "Modtaget", kraeverTil: true },
  flytning: { label: "Flyttet", kraeverFra: true, kraeverTil: true },
  udlevering: { label: "Udleveret", kraeverFra: true },
  retur: { label: "Retur modtaget", kraeverTil: true },
});

export const ALLE_UNIT_BEVAEGELSE_ARTER = Object.keys(UNIT_BEVAEGELSE_ART);
export const UNIT_BEVAEGELSE_KILDER = ["unitbooking", "warehouse"];
// Nøglen bruges som RTDB-child; `.`, `#`, `$`, `[`, `]` og `/` må derfor
// aldrig accepteres, selv om de kan optræde i andre idempotensformater.
export const UNIT_OPERATION_ID_MOENSTER = /^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/;

export function normaliserUnitKode(kode) {
  return typeof kode === "string" ? kode.trim() : "";
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
  const fejl = valideUnitBevaegelse({ operationId, unitId, art, fraPladsId, tilPladsId, bookingId, reference });
  if (!Number.isSafeInteger(tidspunktMs) || tidspunktMs <= 0) fejl.tidspunktMs = "Serverens tidspunkt mangler.";
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
      kilde, tidspunktMs, udfoertAf,
    },
  };
}

const BINDENDE_BOOKINGER = new Set(["booket", "klargjort", "udlaant"]);

export function bindendeBookingerForUnit(bookinger = [], unitId, undtagBookingId = null) {
  return bookinger.filter((b) => b.kasseId === unitId && b.id !== undtagBookingId && BINDENDE_BOOKINGER.has(b.tilstand));
}

export function sammenlignOperation(gemt, foreslaaet = {}) {
  if (!gemt) return { art: "ny" };
  const felter = ["operationId", "unitId", "art", "fraPladsId", "tilPladsId", "bookingId", "reference", "kilde"];
  const samme = felter.every((felt) => (gemt[felt] ?? null) === (foreslaaet[felt] ?? null));
  return samme
    ? { art: "gentaget", eventId: gemt.eventId || gemt.id || null }
    : { art: "konflikt", besked: "Idempotensnøglen er allerede brugt til en anden handling." };
}

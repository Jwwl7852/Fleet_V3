/* scripts/v1-test-data/warehouse.mjs
 * V1-testselskabets Warehouse-data (3PL) — 6 varer, 3 carriers, beholdning
 * og enheder, alt tilknyttet kunden "vtLager" (se kunder.mjs). Nodeform som
 * src/fleet/demo-lager.js.
 *
 * ⚠ REOLPLADSERNE LIGGER I lager-pladser.mjs — DELT med Unitbooking.
 *
 * ⚠ NØGLEN PÅ BEHOLDNING ER <carrierId>__<vareId>__<batch>, som
 * beholdningsNoegle() bygger den — se demo-lager.js.
 */
export const V1T_VARER = [
  { id: "v-vt-skrue", kundeId: "vtLager", varenummer: "VT-SKRUE-01",
    navn: "Bolt sæt M12", enhed: "stk", sporing: "ingen", varegruppe: "Reservedele",
    laengdeMm: 80, breddeMm: 60, hoejdeMm: 40, vaegtG: 900, minimum: 200, aktiv: true },
  { id: "v-vt-palle", kundeId: "vtLager", varenummer: "VT-PAL-01",
    navn: "Europalle 1200×800", enhed: "palle", sporing: "ingen", varegruppe: "Emballage",
    laengdeMm: 1200, breddeMm: 800, hoejdeMm: 144, vaegtG: 25000, aktiv: true },
  /* Serie-sporet — se V1T_ENHEDER, som skal stemme med beholdningen. */
  { id: "v-vt-vaerktoej", kundeId: "vtLager", varenummer: "VT-TOOL-01",
    navn: "Akku boremaskine 18V", enhed: "stk", sporing: "serie", varegruppe: "Værktøj",
    laengdeMm: 320, breddeMm: 100, hoejdeMm: 260, vaegtG: 1800, minimum: 3, aktiv: true },
  { id: "v-vt-granulat", kundeId: "vtLager", varenummer: "VT-GRAN-01",
    navn: "Granulat, sæk 25 kg", enhed: "kg", sporing: "batch", varegruppe: "Råvarer",
    minimum: 300, aktiv: true },
  { id: "v-vt-kasse", kundeId: "vtLager", varenummer: "VT-KART-01",
    navn: "Papkasse A4, brun", enhed: "kolli", sporing: "ingen", varegruppe: "Emballage",
    laengdeMm: 310, breddeMm: 220, hoejdeMm: 200, vaegtG: 180, minimum: 100, aktiv: true },
  /* Uden mål — volumenkalkulatoren skal kunne sige "ved det ikke". */
  { id: "v-vt-diverse", kundeId: "vtLager", varenummer: "VT-DIV-01",
    navn: "Diverse projektvarer", enhed: "kolli", sporing: "ingen", varegruppe: "Diverse",
    aktiv: true },
];

export const V1T_CARRIERS = [
  { id: "CRR-VT-001", type: "pallekasse", ejerforhold: "ejet", status: "paaLager",
    pladsId: "vtPladsModtagelse", kundeId: "vtLager",
    laengdeMm: 1200, breddeMm: 800, hoejdeMm: 950 },
  { id: "CRR-VT-002", type: "gitterbur", ejerforhold: "ejet", status: "paaLager",
    pladsId: "vtPladsPluk", kundeId: "vtLager",
    laengdeMm: 1200, breddeMm: 800, hoejdeMm: 950 },
  /* Scannet ind, endnu ikke sat på plads — "modtag"-trinnet der venter på at
     blive afsluttet med en "flyt". */
  { id: "CRR-VT-1X01", type: "kartonkasse", ejerforhold: "engang", status: "paaLager",
    kundeId: "vtLager" },
];

const M = (n) => Math.round(n * 1000);

export const V1T_BEHOLDNING = [
  { id: "CRR-VT-001__v-vt-palle___", carrierId: "CRR-VT-001", vareId: "v-vt-palle",
    batch: "_", antal: M(40) },
  { id: "CRR-VT-001__v-vt-skrue___", carrierId: "CRR-VT-001", vareId: "v-vt-skrue",
    batch: "_", antal: M(500) },
  { id: "CRR-VT-002__v-vt-vaerktoej___", carrierId: "CRR-VT-002", vareId: "v-vt-vaerktoej",
    batch: "_", antal: M(2) },
  { id: "CRR-VT-002__v-vt-granulat__LOT-VT001", carrierId: "CRR-VT-002",
    vareId: "v-vt-granulat", batch: "LOT-VT001", antal: M(350.5) },
  /* I den uplacerede beholder — "receive"-scenariet: gods findes, hylde gør
     ikke endnu. */
  { id: "CRR-VT-1X01__v-vt-kasse___", carrierId: "CRR-VT-1X01", vareId: "v-vt-kasse",
    batch: "_", antal: M(120) },
];

/* Skal stemme 1:1 med beholdningen for v-vt-vaerktoej (2 stk i CRR-VT-002). */
export const V1T_ENHEDER = [
  { id: "VTSN-001", vareId: "v-vt-vaerktoej", kundeId: "vtLager", carrierId: "CRR-VT-002",
    tilstand: "paaLager" },
  { id: "VTSN-002", vareId: "v-vt-vaerktoej", kundeId: "vtLager", carrierId: "CRR-VT-002",
    tilstand: "paaLager" },
];

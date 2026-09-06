/* Tydeligt syntetiske execution-fixtures. Ingen data er hentet udefra. */

import {
  BETINGELSESOPERATOR, FOTOKATEGORI, MODTAGERMETODE, SPOERGSMAALTYPE,
  UDFOERELSESSKABELONSTATUS, opretMaterialetype,
} from "./index.js";

export const DEMO_MATERIALER = Object.freeze([
  ["mat-bobleplast", "Fiktiv bobleplast", "DEMO-MAT-01", "rulle"],
  ["mat-papir", "Fiktivt syrefrit papir", "DEMO-MAT-02", "ark"],
  ["mat-tape", "Fiktiv tape", "DEMO-MAT-03", "rulle"],
  ["mat-hjoerne", "Fiktive hjørnebeskyttere", "DEMO-MAT-04", "stk."],
  ["mat-kasse", "Fiktiv trækasse", "DEMO-MAT-05", "kasse"],
  ["mat-taeppe", "Fiktivt flyttetæppe", "DEMO-MAT-06", "stk."],
].map(([id, navn, reference, enhed]) => opretMaterialetype({ id, navn, reference, enhed, aktiv: true })));

const dokument = (stopId, paakraevet = true) => ({
  id: `dok-${stopId}`, dokumentRef: `demo-dokument-${stopId}`, dokumentnavn: "Fiktiv leveringskvittering",
  dokumentversion: 2, stopId,
  underskrift: { paakraevet, forventetUnderskriver: "Modtager", kopiKanSendes: true, modtagermetode: MODTAGERMETODE.CHAUFFOER_INDTASTER_MAIL },
});

export const DEMO_UDFOERELSESSKABELONER = Object.freeze([
  {
    id: "udf-demo-levering", tenantRef: "tenant-fiktiv-ui-demo", navn: "Fiktiv levering med kvittering", version: 1,
    status: UDFOERELSESSKABELONSTATUS.AKTIV, oprettetMs: Date.UTC(2032, 0, 1), aendretMs: Date.UTC(2032, 0, 1),
    stopprofiler: [{
      id: "profil-levering", stopId: "stop-levering", stoptype: "LEVERING", dokumenter: [dokument("stop-levering")],
      fotos: [
        { id: "foto-foer", navn: "Før udførelse", kategori: FOTOKATEGORI.FOER, paakraevet: true, minimumAntal: 1, maksimumAntal: 3, kommentarPaakraevet: false, ekstraTilladt: true },
        { id: "foto-skade", navn: "Synlig skade", kategori: FOTOKATEGORI.SYNLIG_SKADE, paakraevet: false, minimumAntal: 0, maksimumAntal: 5, kommentarPaakraevet: true, ekstraTilladt: true },
        { id: "foto-efter", navn: "Efter udførelse", kategori: FOTOKATEGORI.EFTER, paakraevet: true, minimumAntal: 1, maksimumAntal: 3, kommentarPaakraevet: false, ekstraTilladt: true },
      ],
      spoergsmaal: [
        { id: "sp-leveret", tekst: "Er leveringen placeret som aftalt?", type: SPOERGSMAALTYPE.JA_NEJ, paakraevet: true, hjaelpetekst: "Vælg ja eller nej.", svarmuligheder: [], raekkefoelge: 1, skabelonversion: 1 },
        { id: "sp-skade", tekst: "Beskriv den synlige skade", type: SPOERGSMAALTYPE.LANG_TEKST, paakraevet: true, hjaelpetekst: "Kun syntetisk forhåndsvisning.", svarmuligheder: [], raekkefoelge: 2, skabelonversion: 1, betingelse: { spoergsmaalId: "sp-leveret", operator: BETINGELSESOPERATOR.ER, vaerdi: false } },
        { id: "sp-materialer", tekst: "Har du brugt materialer på opgaven?", type: SPOERGSMAALTYPE.JA_NEJ, paakraevet: true, hjaelpetekst: "Et ja viser materialeregistreringen.", svarmuligheder: [], raekkefoelge: 3, skabelonversion: 1 },
        { id: "sp-materialelinjer", tekst: "Registrér anvendte materialer", type: SPOERGSMAALTYPE.MATERIALEFORBRUG, paakraevet: true, hjaelpetekst: "Vælg materiale og antal.", svarmuligheder: [], raekkefoelge: 4, skabelonversion: 1, betingelse: { spoergsmaalId: "sp-materialer", operator: BETINGELSESOPERATOR.ER, vaerdi: true } },
      ],
      materialeIder: DEMO_MATERIALER.map((post) => post.id), ekstraMaterialeTilladt: true,
    }],
  },
  {
    id: "udf-demo-afhentning", tenantRef: "tenant-fiktiv-ui-demo", navn: "Fiktiv afhentningskontrol", version: 3,
    status: UDFOERELSESSKABELONSTATUS.AKTIV, oprettetMs: Date.UTC(2031, 5, 1), aendretMs: Date.UTC(2032, 3, 1),
    stopprofiler: [{
      id: "profil-afhentning", stopId: "stop-afhentning", stoptype: "AFHENTNING", dokumenter: [dokument("stop-afhentning", false)],
      fotos: [{ id: "foto-emballage", navn: "Emballage", kategori: FOTOKATEGORI.EMBALLAGE, paakraevet: true, minimumAntal: 1, maksimumAntal: 4, kommentarPaakraevet: false, ekstraTilladt: true }],
      spoergsmaal: [{ id: "sp-antal", tekst: "Hvor mange enheder er afhentet?", type: SPOERGSMAALTYPE.TAL, paakraevet: true, hjaelpetekst: "Angiv et syntetisk antal.", svarmuligheder: [], raekkefoelge: 1, skabelonversion: 3 }],
      materialeIder: [], ekstraMaterialeTilladt: false,
    }],
  },
]);

export function opretDemoUdfoerelsesdata() {
  return { materialer: JSON.parse(JSON.stringify(DEMO_MATERIALER)), skabeloner: JSON.parse(JSON.stringify(DEMO_UDFOERELSESSKABELONER)) };
}

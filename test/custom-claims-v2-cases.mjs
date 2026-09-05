/* Den samme inputmatrix bruges af klientdecoder, Functions-kopien og RTDB-
 * emulatoren. Tilføj ikke en negativ case kun ét sted: paritet er pointen. */
import {
  ALLE_PERMS,
  PERM,
  PERM_KODE,
  ROLLE_PERMS,
  kompaktPermStreng,
  permStreng,
} from "../src/fleet/permissions.js";

const tenant = "claims-v2-a";
const rolle = "chauffoer";
const perm = PERM.kunderLaes;
const kode = PERM_KODE[perm];
const andenPerm = PERM.bookingLaes;
const andenKode = PERM_KODE[andenPerm];

const claim = (perms, ekstra = {}) => ({ tenant, rolle, perms, ...ekstra });

export const GYLDIGE_CLAIM_CASES = Object.freeze([
  { navn: "v2-kanonisk", claims: claim(kompaktPermStreng([perm]), { pv: 2 }), forventet: [perm] },
  { navn: "v2-alle", claims: claim(kompaktPermStreng(ALLE_PERMS), { pv: 2 }), forventet: ALLE_PERMS },
  { navn: "legacy-katalogordnet", claims: claim(permStreng([perm])), forventet: [perm] },
  {
    navn: "legacy-gammel-standardrolle",
    claims: claim(permStreng(ROLLE_PERMS.chauffoer)),
    forventet: ROLLE_PERMS.chauffoer,
  },
]);

export const UGYLDIGE_CLAIM_CASES = Object.freeze([
  { navn: "ukendt-pv", claims: claim(`|${kode}|`, { pv: 3 }) },
  { navn: "pv-som-streng", claims: claim(`|${kode}|`, { pv: "2" }) },
  { navn: "pv-som-boolean", claims: claim(`|${kode}|`, { pv: true }) },
  { navn: "pv-null", claims: claim(permStreng([perm]), { pv: null }) },
  { navn: "v2-med-legacy", claims: claim(permStreng([perm]), { pv: 2 }) },
  { navn: "legacy-med-v2", claims: claim(`|${kode}|`) },
  { navn: "v2-ukendt-kode", claims: claim("|zz|", { pv: 2 }) },
  { navn: "v2-kendt-og-ukendt", claims: claim(`|${kode}|zz|`, { pv: 2 }) },
  { navn: "v2-dublet", claims: claim(`|${kode}|${kode}|`, { pv: 2 }) },
  { navn: "v2-tomt-element", claims: claim(`||${kode}||`, { pv: 2 }) },
  { navn: "v2-manglende-delimitere", claims: claim(kode, { pv: 2 }) },
  { navn: "v2-ekstra-startdelimiter", claims: claim(`||${kode}|`, { pv: 2 }) },
  { navn: "v2-ekstra-slutdelimiter", claims: claim(`|${kode}||`, { pv: 2 }) },
  { navn: "v2-forkert-rækkefølge", claims: claim(`|${kode}|${andenKode}|`, { pv: 2 }) },
  { navn: "v2-blandet-format", claims: claim(`|${kode}|${andenPerm}|`, { pv: 2 }) },
  { navn: "v2-null-perms", claims: claim(null, { pv: 2 }) },
  { navn: "v2-array-perms", claims: claim([kode], { pv: 2 }) },
  { navn: "v2-objekt-perms", claims: claim({ kode }, { pv: 2 }) },
  { navn: "v2-tal-perms", claims: claim(12, { pv: 2 }) },
  { navn: "legacy-ukendt-permission", claims: claim("|ukendt.permission|") },
  { navn: "legacy-kendt-og-ukendt", claims: claim(`|${perm}|ukendt.permission|`) },
  { navn: "legacy-dublet", claims: claim(`|${perm}|${perm}|`) },
  { navn: "legacy-tomt-element", claims: claim(`||${perm}||`) },
  { navn: "legacy-manglende-delimitere", claims: claim(perm) },
  { navn: "legacy-array-perms", claims: claim([perm]) },
  { navn: "legacy-null-perms", claims: claim(null) },
  { navn: "legacy-objekt-perms", claims: claim({ perm }) },
  { navn: "legacy-ikke-historisk-rækkefølge", claims: claim(`|${perm}|${andenPerm}|`) },
]);

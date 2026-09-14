export const OFFENTLIGE_LOGIN_MODULER = Object.freeze([
  "fleet", "facility", "planning", "procure", "fakturacenter",
  "workforce", "warehouse", "unit-booking",
]);

const CONTEXT_ID = /^[a-z0-9][a-z0-9_-]{5,63}$/;
const MAKS_KONFIGURATION_BYTES = 32 * 1024;

export function normaliserLoginOrigin(værdi) {
  if (typeof værdi !== "string" || !værdi || værdi.length > 300) return null;
  try {
    const url = new URL(værdi);
    const lokal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    if (url.protocol !== "https:" && !(url.protocol === "http:" && lokal)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function parseLoginKontekster(råKonfiguration) {
  if (typeof råKonfiguration !== "string" || Buffer.byteLength(råKonfiguration, "utf8") > MAKS_KONFIGURATION_BYTES) return new Map();
  let data;
  try { data = JSON.parse(råKonfiguration); } catch { return new Map(); }
  if (!data || Array.isArray(data) || typeof data !== "object") return new Map();
  const resultat = new Map();
  for (const [råOrigin, værdi] of Object.entries(data)) {
    const origin = normaliserLoginOrigin(råOrigin);
    if (!origin || !værdi || !CONTEXT_ID.test(værdi.contextId || "") || !Array.isArray(værdi.moduler)) continue;
    const moduler = [...new Set(værdi.moduler)];
    if (!moduler.length || moduler.some((modul) => !OFFENTLIGE_LOGIN_MODULER.includes(modul))) continue;
    resultat.set(origin, Object.freeze({ version: 1, contextId: værdi.contextId, moduler: Object.freeze(moduler) }));
  }
  return resultat;
}

export function findOffentligLoginKontekst({ origin, råKonfiguration }) {
  const normaliseret = normaliserLoginOrigin(origin);
  if (!normaliseret) return null;
  return parseLoginKontekster(råKonfiguration).get(normaliseret) || null;
}

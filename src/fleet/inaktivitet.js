export const INAKTIVITET_TIMEOUT_MS = 45 * 60 * 1000;
export const INAKTIVITET_VARSEL_MS = 43 * 60 * 1000;
export const INAKTIVITET_AKTIVITET_THROTTLE_MS = 1000;
export const INAKTIVITET_LOGOUT_BESKED_NOGLE = "veyro:session:logout-besked:v1";

export function inaktivitetsstatus(
  senesteAktivitetMs,
  nuMs,
  { varselMs = INAKTIVITET_VARSEL_MS, timeoutMs = INAKTIVITET_TIMEOUT_MS } = {},
) {
  const seneste = Number(senesteAktivitetMs);
  const nu = Number(nuMs);
  const forløbet = Number.isFinite(seneste) && Number.isFinite(nu)
    ? Math.max(0, nu - seneste)
    : 0;
  const resterendeMs = Math.max(0, timeoutMs - forløbet);
  if (forløbet >= timeoutMs) return { fase: "udløbet", forløbetMs: forløbet, resterendeMs: 0 };
  if (forløbet >= varselMs) return { fase: "varsel", forløbetMs: forløbet, resterendeMs };
  return { fase: "aktiv", forløbetMs: forløbet, resterendeMs };
}

export function inaktivitetsScope(bruger) {
  if (!bruger?.uid) return null;
  const sikkerhedskontekst = bruger.udbyder
    ? "ejer"
    : bruger.tenant
      ? `tenant-${bruger.tenant}`
      : bruger.devTester
        ? "devtester"
        : "uden-kontekst";
  const authTid = bruger.sessionAuthTime || "aktuel-session";
  return `${bruger.uid}:${sikkerhedskontekst}:${authTid}`;
}

export function aktivitetsNøgle(scope) {
  return scope ? `veyro:session:aktivitet:v1:${encodeURIComponent(scope)}` : null;
}

export function læsAktivitet(værdi) {
  const parsed = Number(værdi);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function nedtællingSekunder(resterendeMs) {
  return Math.max(0, Math.ceil(Number(resterendeMs || 0) / 1000));
}

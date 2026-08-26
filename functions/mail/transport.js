/* functions/mail/transport.js
 * Den ENE delte server-side transportvej for udgaaende mail. Skive 3D.
 *
 * INGEN PROVIDER-KODE HER. Denne fil er den faelles kontrakt en afsendelse
 * skal overholde, uanset hvilket domaene der sender (sag-mail i dag,
 * Procure-ordrer i 4D) og uanset hvilken udbyder der i sidste ende vaelges.
 * Selve netvaerkskaldet til udbyderen ligger i functions/mail/adapters/ -- en
 * adapter er en lille, udskiftelig fil med aldrig mere end netop den
 * udbyders eget API-kald og fejloversaettelse.
 *
 * Provider-hemmeligheden bor i en Cloud Functions-secret/miljoevariabel
 * som adapteren selv laeser -- ALDRIG i en VITE_*-klientvariabel, og denne
 * fil ser den aldrig. Se docs/security-compliance/08_EMAIL_SECURITY_GATE.md
 * paragraf 2.
 *
 * En adapter er { send({til, emne, tekst}) -> Promise<{providerId}> }.
 * Kaster den, bliver det til "fejlet" her -- aldrig en unhandled exception
 * der faar en Cloud Function til at se ud som om afsendelsen lykkedes.
 * "accepteret" betyder kun at UDBYDEREN tog imod mailen -- se
 * MAIL_STATUS-noten i mailtransport.js.
 */

export async function sendMail(adapter, { til, emne, tekst }) {
  if (!adapter || typeof adapter.send !== "function") {
    return { status: "fejlet", fejlAarsag: "Ingen mail-adapter konfigureret." };
  }
  try {
    const res = await adapter.send({ til, emne, tekst });
    return { status: "accepteret", providerId: res?.providerId || null };
  } catch (e) {
    return { status: "fejlet", fejlAarsag: kortFejl(e) };
  }
}

/* Kort, upersonlig fejltekst -- aldrig en fuld exception-stak eller en
   kopi af mailens indhold ind i det der senere kan havne i auditloggen. */
function kortFejl(e) {
  const s = String(e?.message || e || "Ukendt fejl fra udbyderen.");
  return s.slice(0, 250);
}

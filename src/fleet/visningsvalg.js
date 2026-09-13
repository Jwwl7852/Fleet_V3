/* Fælles, lokal lagring af rene visningsvalg.
 *
 * Nøglen indeholder miljø, bruger, sikkerhedskontekst og skærm. Derfor kan
 * en anden bruger eller tenant ikke arve menu, zoom eller panelbredder fra
 * den forrige session. Det her er aldrig en adgangsbeslutning og indeholder
 * ingen forretningsdata.
 */
const PRAEFIKS = "veyro:visning:v1";

const del = (vaerdi, fallback) => encodeURIComponent(String(vaerdi || fallback));

export function visningsnoegle({ miljoe = "ukendt", brugerId, kontekst, skaerm, egenskab }) {
  return [PRAEFIKS, del(miljoe, "ukendt"), del(brugerId, "anonym"), del(kontekst, "ingen"), del(skaerm, "faelles"), del(egenskab, "valg")].join(":");
}

export function laesVisningsvalg(lager, noegle, standard) {
  if (!lager || !noegle) return standard;
  try {
    const vaerdi = JSON.parse(lager.getItem(noegle));
    return vaerdi === null || vaerdi === undefined ? standard : vaerdi;
  } catch {
    return standard;
  }
}

export function gemVisningsvalg(lager, noegle, vaerdi) {
  if (!lager || !noegle) return false;
  try {
    lager.setItem(noegle, JSON.stringify(vaerdi));
    return true;
  } catch {
    return false;
  }
}

export function nulstilVisningsvalg(lager, noegle) {
  if (!lager || !noegle) return false;
  try {
    lager.removeItem(noegle);
    return true;
  } catch {
    return false;
  }
}

export function begraensZoom(zoom) {
  const tal = Number(zoom);
  if (!Number.isFinite(tal)) return 100;
  return Math.min(130, Math.max(75, Math.round(tal / 5) * 5));
}

export function begraensPanel(andel, minimum = 32, maksimum = 78) {
  const tal = Number(andel);
  return Math.min(maksimum, Math.max(minimum, Number.isFinite(tal) ? tal : 64));
}

export function erIndreRaekkehandling(maal, raekke) {
  if (!maal || maal === raekke || typeof maal.closest !== "function") return false;
  const kontrol = maal.closest("a,button,input,select,textarea,label,[role='button'],[role='menuitem']");
  return Boolean(kontrol && kontrol !== raekke && raekke?.contains?.(kontrol));
}

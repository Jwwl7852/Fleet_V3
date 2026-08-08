/* src/fleet/personale.js
 * Medarbejderen som entitet. Beslutning 18.
 *
 * INGEN IMPORTS — som permissions.js og audit-regler.js. Den Cloud Function
 * der provisionerer en tenant og udsteder claims, skal bruge samme katalog.
 *
 * ---------------------------------------------------------------------------
 * uid ER HVEM DER GJORDE NOGET. personId ER HVEM DET HANDLER OM.
 *
 * Nøglen i personale/ er et personId, ikke et uid. En person findes før sit
 * login og efter det: kontoen lukkes ved fratrædelse, men en reservation fra
 * tre år siden skal stadig kunne opløses til et navn. En chauffør har måske
 * aldrig et login; en vikar har det sjældent.
 *
 *   indberetninger.oprettetAf og auditloggen  → uid
 *   reservationer, fravaer, opgaver, etaper,
 *   kompetencer                                → personId
 *
 * Bytter man om, holder ejerskabstjekket i reglerne op med at virke:
 * data.child('oprettetAf').val() === auth.uid sammenligner med et uid, og et
 * personId matcher aldrig. Reglen står også i CLAUDE.md.
 * ---------------------------------------------------------------------------
 */

/**
 * Funktioner. En person kan have FLERE — en mekaniker der også kører.
 *
 * Gemmes som et MAP, ikke et array: funktioner/{ chauffoer: true } kan
 * indekseres og forespørges ("hvem er mekanikere"), et array kan ikke.
 * Bemærk at roller/<id>/perms er det modsatte — et array — fordi
 * permission-navne indeholder punktum og ikke kan være RTDB-nøgler.
 * Forskellen er teknisk, ikke smag.
 *
 * DER ER INGEN DIVISION på en medarbejder — beslutning 19. Feltet fandtes, og
 * Lars med C+D stod som `faelles`. Det er væk: en medarbejder er defineret ved
 * sine KOMPETENCER, ikke ved en afdeling, og hun oprettes én gang og virker i
 * alle moduler tenanten har adgang til. At Lars må køre både lastbil og bus
 * står i kompetencer/ som C/E og D — dér kan det efterprøves, og dér kan det
 * udløbe. Reglerne afviser feltet med .validate: false.
 */
export const FUNKTION = {
  chauffoer: "chauffoer",
  buschauffoer: "buschauffoer",
  mekaniker: "mekaniker",
  lager: "lager",
  terminal: "terminal",
  disponent: "disponent",
  administration: "administration",
};

export const FUNKTION_LABEL = {
  chauffoer: "Chauffør",
  buschauffoer: "Buschauffør",
  mekaniker: "Mekaniker",
  lager: "Lagermedarbejder",
  terminal: "Terminalmedarbejder",
  disponent: "Disponent",
  administration: "Administration",
};

export const ALLE_FUNKTIONER = Object.values(FUNKTION);

/* En fratrådt medarbejder HARDSLETTES ALDRIG. Der hænger reservationer,
   indberetninger og bookinger på personId'et — samme princip som
   regnskabsdata. Reglerne håndhæver det med newData.exists(). */
export const PERSONALE_STATUS = {
  aktiv: { label: "Aktiv", pill: "ok", disponerbar: true },
  orlov: { label: "Orlov", pill: "warn", disponerbar: false },
  fratraadt: { label: "Fratrådt", pill: "bad", disponerbar: false },
};

export const ANSAETTELSESFORM = {
  fastansat: "Fastansat",
  vikar: "Vikar",
  ekstern: "Ekstern",
};

export const kanDisponeres = (person) =>
  Boolean(PERSONALE_STATUS[person?.status]?.disponerbar);

export const harFunktion = (person, funktion) =>
  Boolean(person?.funktioner?.[funktion]);

/** Funktionerne på en person, i katalogets rækkefølge frem for objektets. */
export const funktionerAf = (person) =>
  ALLE_FUNKTIONER.filter((f) => harFunktion(person, f));

/* ---- Kompetencetjek ------------------------------------------------- */

/**
 * tjekKompetencer(kompetencer, krav, paaMs) → { ok, mangler, udloebne }
 *
 * kompetencer: personens poster fra kompetencer/ — [{ type, udloeberMs }]
 * krav:        fra kraevedeKompetencer() i flaade.js
 *
 * EN UDLØBET KOMPETENCE BLOKERER. Den advarer ikke.
 *
 * Det er samme regel som i reservationsmodellen: "ingen konflikter fundet"
 * skal betyde noget. En advarsel man kan klikke videre fra, er ikke en
 * kontrol — og en chauffør uden gyldigt ADR-bevis må ikke køre farligt gods,
 * uanset hvor travlt disponenten har.
 *
 * Bemærk at `mangler` og `udloebne` holdes adskilt. "Han har aldrig haft
 * C+E" og "hans C+E udløb i går" kræver hver sin handling — den ene et andet
 * køretøj, den anden en fornyelse — og en samlet liste ville skjule det.
 *
 * HÅNDHÆVELSEN hører i den Cloud Function der opretter etapen, ikke i
 * skærmen. Ligger den i skærmen, kan en direkte skrivning omgå den.
 */
export function tjekKompetencer(kompetencer = [], krav = [], paaMs = Date.now()) {
  const mine = new Map();
  for (const k of kompetencer.filter(Boolean)) {
    /* Har man to poster af samme type, tæller den der udløber sidst. */
    const nuvaerende = mine.get(k.type);
    if (!nuvaerende || (k.udloeberMs || 0) > (nuvaerende.udloeberMs || 0)) mine.set(k.type, k);
  }

  const mangler = [];
  const udloebne = [];
  for (const t of krav) {
    const k = mine.get(t);
    if (!k) mangler.push(t);
    else if ((k.udloeberMs || 0) <= paaMs) udloebne.push(t);
  }

  return { ok: !mangler.length && !udloebne.length, mangler, udloebne };
}

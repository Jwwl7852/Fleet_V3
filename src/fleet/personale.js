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
 * DIVISION er en anden akse. Lars med C+D er `division: "faelles"` og kører
 * både gods og bus; det er beslutning 15 og har intet med funktioner at gøre.
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

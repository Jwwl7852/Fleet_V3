/* src/fleet/mailtransport.js
 * Delt udgaaende mail -- POLITIK, IKKE TRANSPORT. Skive 3D, Gate A.
 *
 * INGEN PROVIDER-KODE HER, OG INGEN FIREBASE-IMPORT. Denne fil er den
 * ENE faelles kontrakt en afsendelse skal overholde, uanset hvilket domaene
 * der sender (sag-mail i dag, Procure-ordrer i 4D) og uanset hvilken
 * udbyder der i sidste ende ringes op. Selve netvaerkskaldet til udbyderen
 * ligger i functions/mail/ -- den findes ikke her, for den findes ikke
 * client-side, og denne fil skal kunne bruges af baade skaermen (samme
 * sanering og laengdegraenser som brugeren allerede har set) og serveren.
 * Samme disciplin som permissions.js og audit-regler.js.
 */

export const MAIL_STATUS = {
  anmodet: "anmodet",
  accepteret: "accepteret",
  fejlet: "fejlet",
};

export const MAIL_STATUS_LABEL = {
  anmodet: "Anmodet",
  accepteret: "Sendt til udbyder",
  fejlet: "Fejlet",
};

export const MAIL_STATUS_TONE = {
  anmodet: "warn",
  accepteret: "ok",
  fejlet: "bad",
};

/* "accepteret" ER IKKE "leveret". Vi ved kun at udbyderen har taget imod
 * mailen, ikke at modtagerens server har accepteret den, og slet ikke at
 * modtageren har laest den. At kalde det "sendt" eller "leveret" ville love
 * noget vi ikke kan bevise. UI'et maa derfor aldrig oversaette "accepteret"
 * til "leveret".
 */

const MAKS_EMNE = 250;
const MAKS_TEKST = 10000;

/* CR og LF, de to tegn en SMTP-header faktisk brydes af. En header-
 * injektion virker ved at smugle et linjeskift ind i et felt der bliver til
 * en header-linje; fjernes de, er der ikke noget at injicere med. */
const LINJESKIFT = /[\r\n]+/g;

/**
 * saniterHeaderFelt(s, maks) -> string
 *
 * Fjerner linjeskift fra et felt der ender i en mail-HEADER, emnelinjen i
 * dag, en fremtidig reply-to. Uden det kunne en fritekst med et indlejret
 * linjeskift injicere en ekstra header og fx tilfoeje en skjult Bcc eller
 * aendre afsenderfeltet. Broedteksten (tekst) har IKKE brug for denne
 * funktion; et linjeskift der er en del af selve beskeden, er ikke en
 * header.
 */
export function saniterHeaderFelt(s, maks = MAKS_EMNE) {
  const t = typeof s === "string" ? s : "";
  return t.replace(LINJESKIFT, " ").trim().slice(0, maks);
}

/**
 * valideMailFelt(s, maks) -> string | null
 *
 * Trimmer og tjekker at feltet hverken er tomt eller for langt. null
 * betyder "ugyldigt", kalderen afgoer fejlbeskeden. Samme skala som
 * kortStreng() i functions/index.js, men eksporteret saa skaermen kan vise
 * praecis samme graense brugeren rammer server-side.
 */
export function valideMailFelt(s, maks) {
  const t = typeof s === "string" ? s.trim() : "";
  return t.length > 0 && t.length <= maks ? t : null;
}

export const valideEmne = (s) => valideMailFelt(s, MAKS_EMNE);
export const valideTekst = (s) => valideMailFelt(s, MAKS_TEKST);
export const MAKS_EMNE_LAENGDE = MAKS_EMNE;
export const MAKS_TEKST_LAENGDE = MAKS_TEKST;

/**
 * erGyldigtSendRequestId(s) -> boolean
 *
 * Idempotensnoeglen ER noeglen, ikke et felt -- samme moenster som
 * statushaendelsers klientId (rutestatus.js, beslutning 103, se
 * CLAUDE.md): en gensendelse skal ramme den SAMME RTDB-post, saa et
 * dobbeltklik, en browser-retry eller en funktions-retry finder den
 * allerede-anmodede/-sendte post i stedet for at oprette en ny. Klienten
 * genererer vaerdien selv, den skal bare vaere stabil paa tvaers af forsoeg
 * for samme afsendelse, og en almindelig tilfaeldig streng er fint.
 *
 * RTDB-noegler maa ikke indeholde punktum, hash, dollar, kantparenteser
 * eller skraastreg -- samme begraensning som ethvert andet feltnavn i
 * denne database.
 */
export function erGyldigtSendRequestId(s) {
  return typeof s === "string" && s.length > 0 && s.length <= 60
    && !/[.#$[\]/\x00-\x1f]/.test(s);
}

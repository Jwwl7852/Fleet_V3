/* src/fleet/omkostninger.js
 * Hvad turen KOSTER os — ikke hvad kunden betaler.
 *
 * ---------------------------------------------------------------------------
 * ⚠ DEN HER FIL ER IKKE PRISER, OG DET ER HELE POINTEN.
 *
 * `satser/standard/<ydelseId>` er hvad KUNDEN betaler (PRISER.md). Det her er
 * hvad det koster vognmanden at køre turen: km-omkostningen på bilen, færgen,
 * broen, agentens parkering, vejafgiften.
 *
 * Beslutning 11 findes præcis for den forskel — *driftsomkostning pr. km* er
 * ikke *kalkulationspris pr. km*. Storebælt koster 887 kr og faktureres måske
 * til 950. Lå de to i samme node, ville en sum af "satser" blande indtægt og
 * udgift, og ingen ville kunne se det på tallet.
 *
 * Satsarket stod som en `const` i `Bookingopsaetning.jsx` indtil PRISER.md
 * etape 5. Skærmen kunne altså vise et satsark ingen kunne rette.
 *
 * ---------------------------------------------------------------------------
 * ⚠ TRE ARTER, ÉN NODE — OG NØGLERNE ER IKKE ENS
 *
 *   bil      `omkostninger/bil-<koeretoejId>`   km-omkostning pr. bil
 *   passage  `omkostninger/<postId>`            færge, bro, tunnel, vejafgift
 *   agent    `omkostninger/<agentId>`           parkering hos en agent
 *
 * Bilens nøgle bærer KØRETØJETS id, fordi satsen hører til den bil — og fordi
 * navnet så kun står ét sted, i `koeretoejer`. Satsarket i JSX-filen skrev
 * navn og registrering af fra `demo-flaade.js` i hånden, og filens egen
 * kommentar advarede om at de to skulle holdes ens.
 *
 * Passagernes id'er er UÆNDREDE, og det er ikke dovenskab: etapernes
 * `passager`-kort peger på dem (`{ "faerge:femern": 1 }`). Et nyt navn her
 * ville gøre hver eneste etape til en tur uden færge, uden at nogen havde
 * rørt etapen.
 *
 * INGEN IMPORTS. Som permissions.js og beloeb.js — så den kan prøves og
 * senere kopieres til serveren.
 * ---------------------------------------------------------------------------
 */

export const OMKOSTNINGSART = {
  bil:     { art: "bil",     label: "Bilomkostning", enhed: "km" },
  passage: { art: "passage", label: "Passage",       enhed: null },
  agent:   { art: "agent",   label: "Agent",         enhed: "døgn" },
};

export const ALLE_OMKOSTNINGSARTER = Object.keys(OMKOSTNINGSART);

/** Præfikset der binder en omkostning til et køretøj. */
export const BIL_PRAEFIKS = "bil-";

export const bilNoegle = (koeretoejId) => `${BIL_PRAEFIKS}${koeretoejId}`;

/**
 * Køretøjet en bil-omkostning hører til — eller `null`.
 *
 * ⚠ ET OPSLAG, IKKE EN GENTAGELSE. Køretøjs-id'et står i nøglen og ikke som
 * et felt ved siden af: to steder ville kunne blive uenige, og så ville en
 * km-sats høre til en anden bil end den den stod på.
 */
export const koeretoejFraNoegle = (noegle) =>
  (typeof noegle === "string" && noegle.startsWith(BIL_PRAEFIKS)
    ? noegle.slice(BIL_PRAEFIKS.length) || null
    : null);

const ID_MOENSTER = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,59}$/;

/**
 * ⚠ HVERKEN PUNKTUM ELLER SKRÅSTREG. Id'et er en databasenøgle, og RTDB
 * tillader ikke `. # $ [ ] /`. KOLON er derimod tilladt, og det er derfor
 * `faerge:femern` kan blive stående som den er.
 */
export function valideOmkostning(post = {}, { koeretoejer = [] } = {}) {
  const f = {};

  const id = (post.id || "").trim();
  if (!id) f.id = "Id skal udfyldes.";
  else if (!ID_MOENSTER.test(id)) {
    f.id = "Bogstaver, tal, kolon, bindestreg og understreg — ikke punktum.";
  }

  if (!ALLE_OMKOSTNINGSARTER.includes(post.art)) f.art = "Vælg en art.";

  /* ⚠ EN BILOMKOSTNING SKAL PEGE PÅ ET KØRETØJ DER FINDES. Ellers står der en
     km-sats for en bil ingen kan finde, og estimatet på den næste tur bruger
     den uden at nogen opdager det. */
  if (post.art === "bil") {
    const kt = koeretoejFraNoegle(id);
    if (!kt) f.id = `En bilomkostning nøgles med ${BIL_PRAEFIKS}<enhedens id>.`;
    else if (koeretoejer.length && !koeretoejer.includes(kt)) {
      f.id = "Ukendt enhed.";
    }
    /* Navnet står på køretøjet. Skrives det også her, driver de to fra
       hinanden — og det var netop advarslen i den gamle JSX-fil. */
    if (post.navn) f.navn = "Navnet står på enheden, ikke på satsen.";
  } else if (!post.navn?.trim()) {
    f.navn = "Skriv et navn.";
  }

  /* ⚠ HER STOD EN VÆRDIKONTROL AF `division`. Feltet er FORBUDT siden
     beslutning 70, så kontrollen er vendt om: en post der bærer det, ville
     blive afvist af reglen — og formularen skal sige det, ikke serveren. */
  if (post.division !== undefined) {
    f.division = "Division findes ikke længere — se beslutning 70.";
  }
  /* ⚠ EN BIL HAR INGEN DIVISION (beslutning 19). Et køretøj er defineret ved
     sin art, ikke ved en afdeling, og reglerne afviser feltet på
     `koeretoejer`. En km-sats må ikke indføre det ad bagvejen. */
  if (post.art === "bil" && post.division) {
    f.division = "En bil har ingen division — se beslutning 19.";
  }

  for (const k of Object.keys(f)) if (!f[k]) delete f[k];
  return f;
}

const liste = (v) => (Array.isArray(v) ? v : Object.values(v || {}));

/**
 * Fra noden til det satsark `beregnBooking()` forventer.
 *
 * ⚠ PRISMOTOREN ER IKKE LAVET OM. `beregnBooking()` og `beregnForloeb()` er
 * prøvet mod satsarkets form — biler, poster, agenter — og den form er
 * uændret. Det er KILDEN der er flyttet fra en `const` i en skærmfil til en
 * node. Ændrede vi begge dele på én gang, ville en fejl i regnestykket ligne
 * en fejl i flytningen.
 *
 * ⚠ BILENS SATSER HEDDER `kmPrisSatser` I ARKET, men `satser` i noden. Ét
 * navn i databasen, fordi de tre arter ellers skulle valideres hver for sig —
 * og oversættelsen sker her, ét sted.
 */
export function omkostningsark(raekker = [], { koeretoejer = [], lagre = [] } = {}) {
  const ark = { biler: {}, poster: {}, agenter: {}, lagre: {} };
  const ktMap = Object.fromEntries(koeretoejer.map((k) => [k.id, k]));

  /* ⚠ LAGRENE KOM ALDRIG MED I ARKET, OG DET VAR IKKE HARMLØST.
     `beregnForloeb()` slår op i `satsark.lagre[lagerId]` — og den nøgle
     fandtes ikke, så HVERT lagerophold ramte undefined og blev sprunget over
     i tavshed. Et ophold på fem døgn gav 0 øre og `estimeret: false`: et
     estimat der udgav sig for at være præcist, med hele lageromkostningen
     væk. Se noten ved beregnForloeb().

     ⚠ OG LAGRENE ER EN EGEN NODE, ikke en fjerde `art` i `omkostninger`.
     Enumet dér er lukket (`bil|passage|agent`), og et lager bærer desuden
     `kapacitet`, som ikke er en sats. De to kunne slås sammen — men det er en
     beslutning om modellen, ikke en oversættelse, og den hører i PRISER.md. */
  for (const l of lagre) {
    if (!l?.id) continue;
    ark.lagre[l.id] = {
      navn: l.navn || l.id,
      kapacitet: Number.isFinite(l.kapacitet) ? l.kapacitet : null,
      satser: liste(l.satser),
      haandteringSatser: liste(l.haandteringSatser),
    };
  }

  for (const r of raekker) {
    const satser = liste(r.satser);
    if (r.art === "bil") {
      const ktId = koeretoejFraNoegle(r.id);
      const kt = ktMap[ktId];
      /* ⚠ EN SATS UDEN SIT KØRETØJ UDELADES. Bilen er solgt eller aldrig
         oprettet, og et navn vi selv fandt på, ville stå på en linje i et
         estimat. Satsen bliver stående i basen — den forklarer gamle
         beregninger — men den kan ikke bruges til nye. */
      if (!kt) continue;
      ark.biler[ktId] = {
        navn: kt.navn || kt.kaldenavn || ktId,
        registrering: kt.registrering || null,
        kmPrisSatser: satser,
      };
    } else if (r.art === "passage") {
      ark.poster[r.id] = {
        navn: r.navn, kategori: r.kategori || null,
        altidPaaBooking: r.altidPaaBooking === true,
        satser,
      };
    } else if (r.art === "agent") {
      ark.agenter[r.id] = {
        navn: r.navn, by: r.by || null, note: r.note || null,
        satser,
      };
    }
  }
  return ark;
}

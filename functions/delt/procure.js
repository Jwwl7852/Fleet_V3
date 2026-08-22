/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/procure.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/* src/fleet/procure.js
 * Procures proces: behov → bestilling → godkendelse → faktura → afstemning.
 *
 * ⚠ HVAD DER VAR HER FØR, OG HVAD DER IKKE VAR. `indkoeb`-noden er LINJER der
 * allerede er købt — en registrering BAGUD. Plancherne viser processen FØR
 * købet, og trin 1–3 fandtes ikke som noget som helst. Se beslutning 78.
 *
 * ⚠ FILEN ER REN OG KENDER INGEN DATABASE. Samme grund som `beregnKpi()`:
 * hele regnestykket kan prøves uden en emulator, og Cloud Functionen henter
 * posterne og kalder herind. Ligger reglen i funktionen, kan den kun prøves
 * ved at køre den.
 *
 * ⚠ OG DET ER HER FORMEN HÅNDHÆVES. `indkoebsbehov` og `indkoebsordrer` er
 * `.write: false`, så `.validate`-blokken i regelfilen kan ikke nås af en
 * klient. Den beskriver stadig hvad serveren skal overholde — men en
 * regelprøve dér ville være grøn fordi vejen er lukket, ikke fordi posten var
 * rigtig. Det er samme forhold som `opgaveMangler()` har til `opgaver`.
 */

/**
 * Hvor et behov kan komme fra.
 *
 * ⚠ ET KATALOG, IKKE EN FRI STRENG. Indbakken grupperes på kilden, og en
 * femte stavemåde ville lave en gruppe mere som ingen har besluttet og ingen
 * skærm tegner en overskrift til. Reglen håndhæver de samme fire.
 *
 * ⚠ `kontantkoeb` ER EN KILDE, IKKE EN TILSTAND. Et kontantkøb er et behov
 * nogen har dækket selv — det skal stadig registreres, men det skal ikke
 * gennem en bestilling. Lå det som en status, kunne et behov skifte til det
 * undervejs, og så ville pengene være brugt to gange.
 */
export const BEHOVKILDE = {
  snedkeri: "Snedkeri",
  lager: "Lager",
  kontor: "Kontor",
  kontantkoeb: "Kontant køb",
};
export const ALLE_BEHOVKILDER = Object.keys(BEHOVKILDE);

/**
 * Behovets tilstande.
 *
 * ⚠ `iKladde` ER IKKE `bestilt`. Et behov der ligger i en bestillingskladde,
 * er taget hånd om men ikke købt — og kladden kan trækkes tilbage. Slog vi de
 * to sammen, ville indbakken se tom ud for arbejde der aldrig blev sendt.
 */
export const BEHOVSTATUS = {
  nyt: { label: "Nyt behov", tone: "info" },
  klarTilBestilling: { label: "Klar til bestilling", tone: "info" },
  iKladde: { label: "I kladde", tone: "warn" },
  bestilt: { label: "Bestilt", tone: "ok" },
  afvist: { label: "Afvist", tone: "bad" },
};
export const ALLE_BEHOVSTATUS = Object.keys(BEHOVSTATUS);

export const PRIORITET = { lav: "Lav", mellem: "Mellem", hoej: "Høj" };

/**
 * Ordrens tilstande.
 *
 * ⚠ `godkendt` OG `afvist` ER EGNE TILSTANDE, ikke et flag ved siden af.
 * Godkendelsen er trin 3, og en ordre der er sendt uden at være godkendt,
 * skal kunne ses på tilstanden alene — ikke ved at læse to felter og lægge
 * dem sammen i hovedet.
 */
export const ORDRESTATUS = {
  kladde: { label: "Kladde", tone: "info" },
  afventerGodkendelse: { label: "Afventer godkendelse", tone: "warn" },
  godkendt: { label: "Godkendt", tone: "ok" },
  afvist: { label: "Afvist", tone: "bad" },
  sendt: { label: "Sendt", tone: "ok" },
  modtaget: { label: "Modtaget", tone: "ok" },
  annulleret: { label: "Annulleret", tone: "bad" },
};
export const ALLE_ORDRESTATUS = Object.keys(ORDRESTATUS);

/** Ordrenummerets serie og format — se `naesteNummer()` i booking-state.js. */
export const ORDRESERIE = "indkoebsordre";
export const ORDRE_PRAEFIKS = "BST";
export const ORDRENUMMER = /^BST-[0-9]{4}-[0-9]{5}$/;

const tekst = (v, maks) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= maks;

/**
 * valideBehov(post) → { ok, fejl }
 *
 * `fejl` er nøglet på FELTNAVNET, så formularen kan sætte beskeden det rigtige
 * sted. ⚠ Nøglen skal være feltets navn og ikke en fri etiket — `vis()` slår
 * op på den, og en nøgle der ikke matcher et felt, giver en fejl ingen kan se.
 */
export function valideBehov(post = {}) {
  const f = {};

  if (!tekst(post.vare, 200)) {
    f.vare = "Skriv hvad du mangler.";
  }
  if (!ALLE_BEHOVKILDER.includes(post.kilde)) {
    f.kilde = "Vælg hvor behovet kommer fra.";
  }
  if (!ALLE_BEHOVSTATUS.includes(post.status)) {
    f.status = "Ukendt tilstand.";
  }
  if (!Number.isFinite(post.oprettetMs) || post.oprettetMs <= 0) {
    f.oprettetMs = "Behovet mangler et tidspunkt.";
  }
  if (!tekst(post.oprettetAf, 128)) {
    /* ⚠ uid, IKKE personId. Det er hvem der GJORDE det — se CLAUDE.md. */
    f.oprettetAf = "Behovet mangler hvem der oprettede det.";
  }

  /**
   * ⚠ ANTALLET ER VALGFRIT, OG DET ER EN BESLUTNING.
   *
   * Den der melder ind, ved ofte hvad han mangler og ikke hvor meget der er
   * i en pakke. Et krævet felt ville blive udfyldt med et gæt af den der ikke
   * ved det — og gættet ville gå med i en bestilling. Mangler det, sætter den
   * der bestiller det, og indbakken viser at det er ubesvaret.
   *
   * Men er det SAT, skal det være et tal større end nul: "0 stk." er ikke et
   * behov, og en negativ mængde er en returnering, som er noget andet.
   */
  if (post.antal !== undefined && post.antal !== null) {
    if (!Number.isFinite(post.antal) || post.antal <= 0) {
      f.antal = "Antallet skal være større end nul.";
    }
  }
  if (post.prioritet !== undefined && post.prioritet !== null
      && !Object.keys(PRIORITET).includes(post.prioritet)) {
    f.prioritet = "Ukendt prioritet.";
  }
  if (post.note !== undefined && post.note !== null && String(post.note).length > 250) {
    f.note = "Noten er for lang (højst 250 tegn).";
  }

  /* ⚠ INGEN division. Aksen er fjernet i beslutning 70, og reglen afviser
     feltet — så en formular der satte det, ville få skrivningen nægtet. */
  if (post.division !== undefined) {
    f.division = "Division findes ikke længere — se beslutning 70.";
  }

  return { ok: Object.keys(f).length === 0, fejl: f };
}

/**
 * valideOrdre(post) → { ok, fejl }
 *
 * ⚠ LINJERNE VALIDERES MED. En ordre uden linjer er ikke en ordre, og en
 * linje med en float-pris fakturerer forkert. Lå linjekontrollen et andet
 * sted, kunne en ordre blive gemt med en linje der ikke må gemmes.
 */
export function valideOrdre(post = {}) {
  const f = {};

  if (!ORDRENUMMER.test(String(post.nummer || ""))) {
    f.nummer = "Nummeret skal have formen BST-ÅÅÅÅ-NNNNN.";
  }
  if (!tekst(post.leverandoerId, 128)) {
    f.leverandoerId = "Vælg en leverandør.";
  }
  if (!ALLE_ORDRESTATUS.includes(post.status)) {
    f.status = "Ukendt tilstand.";
  }
  if (!Number.isFinite(post.oprettetMs) || post.oprettetMs <= 0) {
    f.oprettetMs = "Ordren mangler et tidspunkt.";
  }
  if (!tekst(post.oprettetAf, 128)) {
    f.oprettetAf = "Ordren mangler hvem der oprettede den.";
  }

  const linjer = linjeListe(post);
  if (!linjer.length) {
    f.linjer = "En ordre skal have mindst én linje.";
  }
  for (const l of linjer) {
    if (!tekst(l.vare, 200)) { f.linjer = "En linje mangler en vare."; break; }
    if (!Number.isFinite(l.antal) || l.antal <= 0) {
      f.linjer = `"${l.vare}" har intet gyldigt antal.`; break;
    }
    /* ⚠ HELE ØRE SOM INTEGER, ekskl. moms. 18,50 kr er 1850, aldrig 18.5 —
       en float fakturerer forkert, og fejlen ses først på en faktura. */
    if (!Number.isInteger(l.prisPrEnhedOere) || l.prisPrEnhedOere < 0) {
      f.linjer = `"${l.vare}" har ikke en pris i hele øre.`; break;
    }
  }

  if (post.division !== undefined) {
    f.division = "Division findes ikke længere — se beslutning 70.";
  }

  return { ok: Object.keys(f).length === 0, fejl: f };
}

/**
 * linjeListe(ordre) → [{ …linje, id }]
 *
 * ⚠ LINJERNE ER NØGLET PÅ DERES EGET id — de er ikke en array. RTDB har ingen
 * arrays, og `.length` på et nøglet objekt er `undefined`: `undefined > 0` er
 * falsk, og en ordre med tre linjer ville se tom ud. Det er præcis den fælde
 * beslutning 76 fandt i `kanSkifteEtape()`, hvor tre forslag gav "der skal
 * være mindst ét forslag".
 *
 * Den her funktion er det ene sted formen oversættes — som `forslagListe()`.
 */
export function linjeListe(ordre) {
  const l = ordre?.linjer;
  if (!l) return [];
  if (Array.isArray(l)) return l.map((x, i) => ({ ...x, id: x?.id ?? String(i) }));
  return Object.entries(l).map(([id, v]) => ({ ...v, id }));
}

/**
 * ordreSumOere(ordre) → hele øre, ekskl. moms.
 *
 * ⚠ REGNET HOS FORBRUGEREN, IKKE GEMT. Et gemt totalbeløb driver fra sine
 * linjer første gang nogen retter et antal — det er fejlen i `bemanding.ledig`
 * (beslutning 71), og den koster mere her, hvor tallet er penge.
 */
export function ordreSumOere(ordre) {
  return linjeListe(ordre).reduce((s, l) => {
    if (!Number.isFinite(l.antal) || !Number.isInteger(l.prisPrEnhedOere)) return s;
    return s + l.antal * l.prisPrEnhedOere;
  }, 0);
}

/**
 * behovTilLinje(behov) → linjen en bestilling skal bære.
 *
 * BYGGER, SKRIVER IKKE — samme mønster som `reservationFraOpgave()`.
 *
 * ⚠ OG DEN GÆTTER IKKE ET ANTAL. Mangler behovet et, kastes der frem for at
 * sætte 1: en bestilling på "1 stk." fordi ingen skrev noget, er et tal nogen
 * kommer til at stole på. Samme holdning som `reservationFraOpgave()` har til
 * en opgave uden estimat, og som momssatsen der ikke gættes.
 */
export function behovTilLinje(behov, { prisPrEnhedOere }) {
  if (!behov?.vare) throw new Error("behovTilLinje: behovet har ingen vare.");
  if (!Number.isFinite(behov.antal) || behov.antal <= 0) {
    throw new Error(
      `behovTilLinje: "${behov.vare}" har intet antal. `
      + "Sæt et antal på behovet før det lægges i en bestilling — et gættet "
      + "antal bliver bestilt."
    );
  }
  if (!Number.isInteger(prisPrEnhedOere) || prisPrEnhedOere < 0) {
    throw new Error("behovTilLinje: prisen skal være hele øre som integer.");
  }
  return {
    vare: behov.vare,
    antal: behov.antal,
    prisPrEnhedOere,
    ...(behov.enhed ? { enhed: behov.enhed } : {}),
    ...(behov.varenummer ? { varenummer: behov.varenummer } : {}),
    /* Sporet går begge veje: behovet får sit ordreId, linjen sit behovId. */
    behovId: behov.id,
  };
}

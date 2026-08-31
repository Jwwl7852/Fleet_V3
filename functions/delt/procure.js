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
 *
 * ⚠ ÉN IMPORT, sprog.js — SKIVE 4D. Reglen er "lukning under import, ikke
 * importfrihed" (se warehouse.js/prioritet.js i scripts/kopier-delt.mjs):
 * `sprog.js` er selv importfri, og `ordreMailIndhold()` skal kende PRÆCIS de
 * samme tre sprog som leverandørens egen standardfelt.
 */
import { erGyldigtSprog, STANDARD_SPROG } from "./sprog.js";

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

/* ══════════════════════════════════════════════════════════════════════════
   LEVERANDØRFORSLAG — beslutning 78, etape 3
   ══════════════════════════════════════════════════════════════════════════

   Planchen skriver "Automatisk forslag" ved hver linje. Forslaget er et
   OPSLAG i det vi allerede ved, ikke en anbefaling: hvem har leveret præcis
   den vare før, og hvad kostede den.

   ⚠ ET FORSLAG UDEN GRUNDLAG ER ET GÆT, OG DET SKAL SIGE FRA.
   `foreslaaLeverandoer()` svarer `null` når ingen har leveret varen — ikke
   den billigste leverandør i kartoteket, ikke den man handlede med sidst.
   Planchen har en tilstand for det: **"Leverandør mangler"** med en
   "Opret kreditor"-knap. Den tilstand findes fordi svaret findes.

   ⚠ OG PRISEN FØLGER MED FORSLAGET. Et forslag der navngiver en leverandør
   uden at sige hvad varen kostede sidst, flytter bare spørgsmålet: den der
   bestiller, skal alligevel slå det op. To halve svar er ikke ét helt.
*/

/**
 * foreslaaLeverandoer(vare, indkoebslinjer, { varenummer, nu }) → forslag | null
 *
 * Forslaget er den leverandør der har leveret varen SENEST, med den pris.
 *
 * ⚠ SENEST, IKKE BILLIGST. En pris fra 2019 er ikke et tilbud — den er et
 * historisk tal, og en bestilling lagt på den bliver afvist af leverandøren
 * eller faktureret til noget andet. Den seneste pris er den eneste der kan
 * bruges til at anslå et beløb i dag.
 *
 * ⚠ OG VARENUMMERET VINDER OVER NAVNET. "Motorolie 10W-40" og
 * "Motorolie 10W40, 5 l" er den samme vare skrevet af to mennesker; et
 * varenummer er det ene sted de kan mødes. Findes det ikke, falder den
 * tilbage på et normaliseret navn — og siger hvad den matchede på, så den der
 * bestiller kan se om opslaget var stærkt eller svagt.
 */
export function foreslaaLeverandoer(vare, indkoebslinjer = [], { varenummer } = {}) {
  const normal = (x) => String(x || "").toLowerCase().replace(/[\s,.\-]+/g, " ").trim();
  const vn = String(varenummer || "").trim().toLowerCase();
  const navn = normal(vare);
  if (!navn && !vn) return null;

  const traef = indkoebslinjer.filter((l) => {
    if (vn && String(l.varenummer || "").trim().toLowerCase() === vn) return true;
    return !vn && normal(l.vare) === navn;
  });
  if (!traef.length) return null;

  /* Seneste leverance. `dato` er ms på en indkøbslinje. */
  const seneste = traef.reduce((a, b) => ((b.dato || 0) > (a.dato || 0) ? b : a));
  if (!seneste.leverandoerId) return null;

  return {
    leverandoerId: seneste.leverandoerId,
    prisPrEnhedOere: Number.isInteger(seneste.prisPrEnhedOere)
      ? seneste.prisPrEnhedOere : null,
    enhed: seneste.enhed || null,
    sidstKoebtMs: seneste.dato || null,
    /* ⚠ HVAD DER BLEV MATCHET PÅ. Et varenummertræf er stærkt; et navnetræf
       kan være to forskellige varer med samme ord. Den der bestiller, skal
       kunne se forskellen frem for at stole lige meget på begge. */
    grundlag: vn ? "varenummer" : "navn",
    antalTidligere: traef.length,
  };
}

/**
 * kladdelinjer(behov, indkoebslinjer) → [{ behov, forslag }]
 *
 * ⚠ ET BEHOV UDEN FORSLAG FALDER IKKE UD AF LISTEN. Det står med
 * `forslag: null`, og skærmen viser "Leverandør mangler". Skjulte vi det,
 * ville en mangel forsvinde præcis fordi den er en mangel — og den der
 * bestiller, ville tro at alt var dækket.
 */
export function kladdelinjer(behov = [], indkoebslinjer = []) {
  return behov.map((b) => ({
    behov: b,
    forslag: foreslaaLeverandoer(b.vare, indkoebslinjer, { varenummer: b.varenummer }),
  }));
}

/**
 * grupperPaaLeverandoer(linjer) → [{ leverandoerId, linjer }]
 *
 * ⚠ ÉN ORDRE PR. LEVERANDØR. Man sender ikke én bestilling til tre firmaer,
 * og et bestillingsnummer der dækkede flere, kunne ikke bruges som reference
 * på nogen af fakturaerne. Planchen viser præcis det: tre udkast, tre numre.
 *
 * De uden forslag samles under `null` — de kan ikke bestilles endnu, og de
 * skal kunne ses samlet.
 */
export function grupperPaaLeverandoer(linjer = []) {
  const kort = new Map();
  for (const l of linjer) {
    const id = l.forslag?.leverandoerId ?? null;
    if (!kort.has(id)) kort.set(id, []);
    kort.get(id).push(l);
  }
  return [...kort.entries()].map(([leverandoerId, ls]) => ({ leverandoerId, linjer: ls }));
}

/* ══════════════════════════════════════════════════════════════════════════
   E-MAILUDKAST — beslutning 78, etape 3
   ══════════════════════════════════════════════════════════════════════════

   ⚠ ET UDKAST, IKKE EN AFSENDELSE. Kunden valgte det: mail UD af systemet er
   beslutning 20's fase 1, og der er hverken afsendelsesvej, afsenderadresse
   pr. tenant eller et spor af hvad der blev sendt til hvem. En knap der så ud
   som "send", men lagde en mail i en kø der ikke findes, ville være værre end
   ingen knap.

   Udkastet bygges, vises og kan kopieres. Ordren markeres SENDT når et
   menneske har sendt den — og det er en tilstand nogen sætter, ikke noget
   systemet påstår.
*/

/** Beløb i hele øre → "1.250,00 kr." Kun til udkastets tekst. */
function kr(oere) {
  if (!Number.isInteger(oere)) return "—";
  return `${(oere / 100).toLocaleString("da-DK", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })} kr.`;
}

/**
 * mailudkast(ordre, { leverandoer }) → { emne, brodtekst, tilEmail }
 *
 * ⚠ BESTILLINGSNUMMERET STÅR I EMNET, og teksten beder om at få det med på
 * fakturaen. Det er hele grunden til at nummeret findes: uden det på
 * fakturaen kan matchet i trin 5 kun gættes ud fra beløb og leverandør — og
 * to bestillinger til samme firma i samme uge ser så ens ud.
 *
 * ⚠ OG TEKSTEN INDEHOLDER INGEN PRISER UDEN GRUNDLAG. En linje uden pris
 * skriver "—", ikke 0: en bestilling der beder om noget til nul kroner, er
 * en aftale ingen har indgået.
 */
export function mailudkast(ordre, { leverandoer } = {}) {
  const linjer = linjeListe(ordre);
  const sum = ordreSumOere(ordre);
  const nummer = ordre?.nummer || "(uden nummer)";
  const navn = leverandoer?.navn || "leverandøren";

  const punkter = linjer.map((l) => {
    const antal = Number.isFinite(l.antal) ? l.antal : "?";
    const enhed = l.enhed ? ` ${l.enhed}` : "";
    const pris = Number.isInteger(l.prisPrEnhedOere)
      ? ` — ${kr(l.prisPrEnhedOere)} pr. ${l.enhed || "stk"}` : " — pris ikke oplyst";
    return `  • ${antal}${enhed} × ${l.vare}${pris}`;
  });

  return {
    tilEmail: leverandoer?.ordreEmail || leverandoer?.kontaktEmail || null,
    emne: `Ordre ${nummer}${linjer.length === 1 ? ` – ${linjer[0].vare}` : ""}`,
    brodtekst: [
      `Til ${navn}`,
      "",
      `Vi bestiller hermed følgende under ordrenummer ${nummer}:`,
      "",
      ...punkter,
      "",
      `I alt (ekskl. moms): ${sum > 0 ? kr(sum) : "—"}`,
      "",
      /* ⚠ DEN VIGTIGSTE LINJE I MAILEN. Uden nummeret på fakturaen kan
         matchet i trin 5 kun gættes. */
      `Angiv venligst bestillingsnummer ${nummer} på fakturaen.`,
      "",
      "Med venlig hilsen",
    ].join("\n"),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   ORDREMAILINDHOLD — SKIVE 4D. Den rigtige afsendelse.

   ⚠ IKKE mailudkast() MED ET SPROGPARAMETER. `mailudkast()` er stadig
   udkastet i Bestillinger.jsx — dansk, til kopiering, uden om systemet — og
   dets tekst rører denne funktion ikke; at grene den ene ud i tre sprog ville
   lade en fremtidig ændring af udkastets ordlyd utilsigtet ændre den mail
   der rent faktisk sendes, eller omvendt. To forskellige forbrugere, hver sin
   funktion — samme skel som byggLeverandoer() og valideLeverandoer() ikke
   deler kode med Indkøbslinjens valideIndkoeb().

   ⚠ SAMME TO REGLER SOM mailudkast(): bestillingsnummeret ligger i emnet
   (matchet i trin 5 kan kun gættes uden det), og en linje uden pris skriver
   teksten for "ikke oplyst" — aldrig 0, som ville være et løfte om en gratis
   vare.
   ══════════════════════════════════════════════════════════════════════════ */

const ORDREMAIL_TEKST = {
  da: {
    til: "Til", bestiller: "Vi bestiller hermed følgende under ordrenummer",
    ialt: "I alt (ekskl. moms)", prisIkkeOplyst: "pris ikke oplyst",
    angiv: "Angiv venligst bestillingsnummer", paaFakturaen: "på fakturaen.",
    hilsen: "Med venlig hilsen", leverandoeren: "leverandøren",
  },
  sv: {
    til: "Till", bestiller: "Vi beställer härmed följande under beställningsnummer",
    ialt: "Totalt (exkl. moms)", prisIkkeOplyst: "pris ej angivet",
    angiv: "Ange gärna beställningsnumret", paaFakturaen: "på fakturan.",
    hilsen: "Med vänlig hälsning", leverandoeren: "leverantören",
  },
  en: {
    til: "To", bestiller: "We hereby place the following order under order number",
    ialt: "Total (excl. VAT)", prisIkkeOplyst: "price not stated",
    angiv: "Please state order number", paaFakturaen: "on the invoice.",
    hilsen: "Kind regards", leverandoeren: "the supplier",
  },
};

/**
 * ordreMailIndhold(ordre, { leverandoer, sprog }) → { tilEmail, emne, brodtekst }
 *
 * ⚠ REN FUNKTION — BYGGER, SENDER IKKE. `ordreMailSend` kalder den med et
 * SERVER-VERIFICERET ordre og leverandør, aldrig med noget klienten selv
 * påstod. Samme mønster som `mailudkast()`, kun med sprog som ekstra akse.
 *
 * ⚠ ET UGYLDIGT SPROG FALDER TILBAGE TIL STANDARD_SPROG, DET KASTER IKKE.
 * Kalderen (ordreMailSend) har allerede afvist en ugyldig klient-override før
 * dette kaldes — faldet her er et sidste værn, ikke den primære kontrol, og
 * en render-funktion der kaster på et skævt input, er en dårlig sidste linje.
 */
export function ordreMailIndhold(ordre, { leverandoer, sprog } = {}) {
  const t = ORDREMAIL_TEKST[erGyldigtSprog(sprog) ? sprog : STANDARD_SPROG];
  const linjer = linjeListe(ordre);
  const sum = ordreSumOere(ordre);
  const nummer = ordre?.nummer || "(uden nummer)";
  const navn = leverandoer?.navn || t.leverandoeren;

  const punkter = linjer.map((l) => {
    const antal = Number.isFinite(l.antal) ? l.antal : "?";
    const enhed = l.enhed ? ` ${l.enhed}` : "";
    const pris = Number.isInteger(l.prisPrEnhedOere)
      ? ` — ${kr(l.prisPrEnhedOere)} pr. ${l.enhed || "stk"}` : ` — ${t.prisIkkeOplyst}`;
    return `  • ${antal}${enhed} × ${l.vare}${pris}`;
  });

  return {
    tilEmail: leverandoer?.ordreEmail || leverandoer?.kontaktEmail || null,
    emne: `Ordre ${nummer}${linjer.length === 1 ? ` – ${linjer[0].vare}` : ""}`,
    brodtekst: [
      `${t.til} ${navn}`,
      "",
      `${t.bestiller} ${nummer}:`,
      "",
      ...punkter,
      "",
      `${t.ialt}: ${sum > 0 ? kr(sum) : "—"}`,
      "",
      `${t.angiv} ${nummer} ${t.paaFakturaen}`,
      "",
      t.hilsen,
    ].join("\n"),
  };
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

/* ══════════════════════════════════════════════════════════════════════════
   GODKENDELSE — beslutning 78, etape 4 (planche 2)
   ══════════════════════════════════════════════════════════════════════════

   Planchen har to regler, hver med sin kontakt: **godkendelse over beløb** og
   **kræv fakturagodkendelse**. Og et kort ved siden af der siger at begge
   **kan slås fra** — en lille virksomhed hvor samme person både bestiller og
   godkender, får intet ud af et ekstra trin.

   ⚠ AT KUNNE SLÅS FRA ER EN FUNKTION, IKKE EN MANGEL. Kunden bad om det
   udtrykkeligt, og det er forskellen på en regel og en spærring: reglen er
   virksomhedens egen politik, ikke systemets. Derfor kan den redigeres — men
   ikke af hvem som helst, se `godkendelsesregelskriv`.
*/

/**
 * Standarden når noden ikke findes.
 *
 * ⚠ EN TENANT UDEN NODEN SKAL OPFØRE SIG PRÆCIS SOM I DAG, og i dag er der
 * ingen godkendelse. Faldt vi tilbage på "godkendelse påkrævet", ville hver
 * eksisterende kunde få en kø han ikke havde bedt om, første gang funktionen
 * blev udrullet. Samme greb som `permsForTenant()`: standarden er dét der
 * gjaldt før noden fandtes.
 *
 * ⚠ OG DEN ER EN KONSTANT, IKKE ET SKØN. Formen står her, så `kraeverGodkendelse()`
 * kan læse den uden at kende en database — som `beregnKpi()`.
 */
export const STANDARD_GODKENDELSESREGLER = {
  overBeloeb: { aktiv: false, graenseOere: null, godkenderUid: null },
  fakturagodkendelse: { aktiv: false, godkenderUid: null },
};

/**
 * valideGodkendelsesregler(regler) → { ok, fejl }
 *
 * ⚠ EN AKTIV REGEL UDEN GRÆNSE ER UGYLDIG — den må ikke falde tilbage på et
 * tal. Nul ville betyde at ALT skal godkendes; uendelig ville betyde at intet
 * skal. De to er hinandens modsætning, og begge ser ud som "reglen er slået
 * til". At slå reglen FRA er kontakten, ikke et tomt felt.
 *
 * ⚠ OG EN AKTIV REGEL UDEN GODKENDER ER EN KØ INGEN TØMMER. Ordren ville stå
 * i `afventerGodkendelse` uden at nogen var udpeget — synligt for alle,
 * ansvar for ingen.
 */
export function valideGodkendelsesregler(regler = {}) {
  const f = {};
  const ob = regler.overBeloeb;
  const fg = regler.fakturagodkendelse;

  if (!ob || typeof ob !== "object") {
    f.overBeloeb = "Reglen for beløbsgrænse mangler.";
  } else if (typeof ob.aktiv !== "boolean") {
    f.overBeloeb = "Reglen skal være slået til eller fra.";
  } else if (ob.aktiv) {
    /* ⚠ HELE ØRE SOM INTEGER, som alle beløb. 5.000 kr er 500000. */
    if (!Number.isInteger(ob.graenseOere) || ob.graenseOere < 0) {
      f.graenseOere = "Sæt en beløbsgrænse i hele kroner.";
    } else if (ob.graenseOere > 10000000000) {
      f.graenseOere = "Beløbsgrænsen er urimeligt høj.";
    }
    if (!tekst(ob.godkenderUid, 128)) {
      /* ⚠ uid, IKKE personId. Godkenderen GØR noget — han skal have et login,
         og en chauffør har måske slet intet. Se CLAUDE.md. */
      f.godkenderUid = "Vælg hvem der skal godkende.";
    }
  }

  if (!fg || typeof fg !== "object") {
    f.fakturagodkendelse = "Reglen for fakturagodkendelse mangler.";
  } else if (typeof fg.aktiv !== "boolean") {
    f.fakturagodkendelse = "Reglen skal være slået til eller fra.";
  } else if (fg.aktiv && !tekst(fg.godkenderUid, 128)) {
    f.fakturaGodkenderUid = "Vælg hvem der skal godkende fakturaer.";
  }

  return { ok: Object.keys(f).length === 0, fejl: f };
}

/**
 * kraeverGodkendelse(ordre, regler) → { kraever, grund, graenseOere, godkenderUid }
 *
 * ⚠ REGNET ÉT STED, AF BEGGE SIDER. Skærmen viser hvad der vil ske; `ordrestatus`
 * afgør det. Lå regnestykket i skærmen, kunne en ordre sendes direkte til
 * `godkendt` af et kald der gik uden om den — og "godkendes automatisk" ville
 * betyde "ingen kiggede, og ingen skulle".
 *
 * ⚠ OG DEN SAMMENLIGNER MED >, IKKE >=. Planchen skriver *"Kræver godkendelse,
 * når et indkøb overstiger det angivne beløb"* og *"Indkøb under 5.000 kr.
 * godkendes automatisk"*. Præcis 5.000 kr. er altså IKKE over grænsen. De to
 * sætninger er uenige om det nøjagtige beløb — den ene siger "under", den
 * anden "overstiger" — og forskellen er ét indkøb ud af hundrede. Vi følger
 * knappens egen tekst: *overstiger*.
 */
export function kraeverGodkendelse(ordre, regler) {
  const r = regler?.overBeloeb || STANDARD_GODKENDELSESREGLER.overBeloeb;
  const sum = ordreSumOere(ordre);

  if (!r.aktiv) {
    return { kraever: false, grund: "reglenErFra", graenseOere: null, godkenderUid: null };
  }
  /* ⚠ EN AKTIV REGEL UDEN GRÆNSE KRÆVER GODKENDELSE. Den er ugyldig, og et
     ugyldigt loft må ikke lade noget slippe igennem — fejler LUKKET, som
     permission-strengen gør. */
  if (!Number.isInteger(r.graenseOere)) {
    return { kraever: true, grund: "ugyldigRegel", graenseOere: null, godkenderUid: r.godkenderUid || null };
  }
  return {
    kraever: sum > r.graenseOere,
    grund: sum > r.graenseOere ? "overBeloeb" : "underGraensen",
    graenseOere: r.graenseOere,
    godkenderUid: r.godkenderUid || null,
  };
}

/**
 * Ordrens overgange.
 *
 * ⚠ EN TABEL, IKKE EN RÆKKE IF-SÆTNINGER. Skærmen tegner knapperne af den, og
 * `ordrestatus` afviser med den — en knap uden en overgang er en pæn knap; en
 * overgang uden en knap er en vej ingen kan finde. Samme mønster som
 * `OPGAVE_OVERGANGE` og `tilgaengeligeEtapeHandlinger()`.
 *
 * ⚠ `sendt` ER IKKE LÆNGERE EN OVERGANG ET MENNESKE VÆLGER I DENNE TABEL —
 * SKIVE 4D. Indtil da var den: systemet sendte ingen mail (beslutning 81),
 * og "Markér som sendt" var derfor en PÅSTAND et menneske indestod for. Nu
 * findes en rigtig afsendelse (`ordreMailSend`), og "sendt" er blevet en
 * FØLGE af at den lykkedes — nøjagtig den samme flytning som bookingens
 * tilstand tog i beslutning 40: der er ingen `kanSkifte()` på et afledt felt.
 * Stod overgangen stadig her, kunne enhver med `indkoeb.skriv` klikke ordren
 * i "sendt" med `sendtMs` sat og INGEN mail bag — umuligt at skelne fra en
 * ordre `ordreMailSend` faktisk fik afsendt. `ordreMailSend` bygger derfor
 * sine egne felter direkte med `ordreOpdatering(ordre, "sendt", …)`, uden om
 * denne tabel og uden om `kanSkifteIndkoebsordre()` — den kalder selv sit
 * eget forudsætningstjek (`status === "godkendt"`) og sin egen permission
 * (`indkoeb.skriv`, samme som stod her). Se functions/index.js.
 *
 * ⚠ OG DER ER INGEN VEJ TILBAGE FRA `modtaget`. Varen står på hylden; skal
 * noget sendes retur, er det en kreditnota — en anden post, ikke en tilbagerulning.
 */
export const ORDRE_OVERGANGE = {
  kladde: [
    { til: "afventerGodkendelse", label: "Send til godkendelse", perm: "indkoeb.skriv" },
    { til: "annulleret", label: "Annullér", perm: "indkoeb.skriv", kraeverBegrundelse: true },
  ],
  afventerGodkendelse: [
    { til: "godkendt", label: "Godkend", perm: "indkoeb.godkend" },
    /* ⚠ EN AFVISNING KRÆVER EN GRUND. Uden den er den en tavshed, og den
       samme bestilling bliver lagt igen i næste uge — nøjagtig som et afvist
       behov (beslutning 80). */
    { til: "afvist", label: "Afvis", perm: "indkoeb.godkend", kraeverBegrundelse: true },
  ],
  godkendt: [
    /* ⚠ "SEND ORDRE" STÅR IKKE HER, MED VILJE — se noten ovenfor. */
    { til: "annulleret", label: "Annullér", perm: "indkoeb.skriv", kraeverBegrundelse: true },
  ],
  sendt: [
    { til: "modtaget", label: "Markér som modtaget", perm: "indkoeb.skriv" },
    { til: "annulleret", label: "Annullér", perm: "indkoeb.skriv", kraeverBegrundelse: true },
  ],
  afvist: [],
  modtaget: [],
  annulleret: [],
};

/**
 * kanSkifteIndkoebsordre(ordre, til, { perms, regler, uid }) → { ok, aarsag }
 *
 * ⚠ HEDDER IKKE `kanSkifteOrdre`. Det navn er optaget af warehouse'ens
 * plukordrer, og `functions/index.js` importerer begge. To funktioner med
 * samme navn i én fil er ikke et navnesammenstød man opdager — den ene vinder
 * i tavshed.
 *
 * Svarer, afgør ikke. Skærmen tegner knapperne efter den; serveren afviser med
 * den samme sætning skærmen viste.
 */
export function kanSkifteIndkoebsordre(ordre, til, { perms = "", regler, uid } = {}) {
  if (!ordre || !ORDRE_OVERGANGE[ordre.status]) {
    return { ok: false, aarsag: "Ordren findes ikke, eller dens tilstand er ukendt." };
  }
  const muligt = ORDRE_OVERGANGE[ordre.status];
  if (!muligt.length) {
    return {
      ok: false,
      aarsag: `En ordre der er ${(ORDRESTATUS[ordre.status]?.label || ordre.status).toLowerCase()}, er afsluttet.`,
    };
  }
  const overgang = muligt.find((o) => o.til === til);
  if (!overgang) {
    const navne = muligt.map((o) => ORDRESTATUS[o.til]?.label || o.til).join(", ");
    return {
      ok: false,
      aarsag: `Herfra kan ordren kun blive: ${navne}.`,
    };
  }
  if (!String(perms).includes(`|${overgang.perm}|`)) {
    return { ok: false, aarsag: `Det kræver ${overgang.perm}.` };
  }

  /**
   * ⚠ DEN UDPEGEDE GODKENDER ER DEN DER GODKENDER.
   *
   * Reglen navngiver ÉN person. Krævede vi derudover at det ikke måtte være
   * den der bestilte, kunne en ordre lagt af godkenderen selv ALDRIG
   * godkendes — en blindgyde i data, ikke en kontrol. Planchen svarer selv på
   * det: kortet *"Kan slås fra"* siger at funktionen bør slås fra netop når
   * samme person bestiller og godkender.
   *
   * Så vi tillader det — og MARKERER det. `selvgodkendt` sættes af serveren,
   * og skærmen skriver "godkendt af den der bestilte". En fire-øjne-regel der
   * ikke kan opfyldes, er værre end en selvgodkendelse man kan se.
   */
  if (til === "godkendt" || til === "afvist") {
    const udpeget = regler?.overBeloeb?.godkenderUid;
    if (udpeget && uid && udpeget !== uid) {
      return {
        ok: false,
        aarsag: "Kun den udpegede godkender kan afgøre den her ordre.",
      };
    }
  }

  return { ok: true, aarsag: null, kraeverBegrundelse: Boolean(overgang.kraeverBegrundelse) };
}

/**
 * tilgaengeligeOrdreHandlinger(ordre, { perms, regler, uid }) → [{ til, label, ok, aarsag }]
 *
 * ⚠ DE UMULIGE FALDER IKKE UD — de står med deres grund. En knap der forsvinder,
 * efterlader spørgsmålet "hvorfor kan jeg ikke det her?"; en grå knap med en
 * forklaring svarer på det. Samme greb som `tilgaengeligeEtapeHandlinger()`.
 */
export function tilgaengeligeOrdreHandlinger(ordre, kontekst = {}) {
  return (ORDRE_OVERGANGE[ordre?.status] || []).map((o) => {
    const svar = kanSkifteIndkoebsordre(ordre, o.til, kontekst);
    return {
      til: o.til,
      label: o.label,
      kraeverBegrundelse: Boolean(o.kraeverBegrundelse),
      ok: svar.ok,
      aarsag: svar.aarsag,
    };
  });
}

/**
 * ordreOpdatering(ordre, til, { uid, nu, begrundelse, regler }) → felterne der skal skrives
 *
 * BYGGER, SKRIVER IKKE — samme mønster som `flytOpdatering()` og
 * `reservationFraOpgave()`. Regnestykket ligger her, hvor det kan prøves uden
 * en emulator.
 *
 * ⚠ "SEND TIL GODKENDELSE" ENDER MÅSKE PÅ `godkendt`. Er reglen slået fra,
 * eller er beløbet under grænsen, er der ingen at vente på — og en kø med en
 * post ingen skal røre, lærer folk at ignorere køen.
 *
 * ⚠ MEN DEN AUTOMATISKE GODKENDELSE FÅR INGEN `godkendtAf`. Et uid dér ville
 * påstå at en person kiggede. `godkendtAutomatisk: true` siger hvad der skete,
 * og flaget er vigtigere end tidspunktet — uden det kan man ikke se forskel på
 * et indkøb nogen sagde god for, og et der bare var lille nok.
 */
export function ordreOpdatering(ordre, til, { uid, nu, begrundelse, regler } = {}) {
  const ud = {};

  if (til === "afventerGodkendelse") {
    const krav = kraeverGodkendelse(ordre, regler);
    if (!krav.kraever) {
      ud.status = "godkendt";
      ud.godkendtMs = nu;
      ud.godkendtAutomatisk = true;
      return ud;
    }
    ud.status = "afventerGodkendelse";
    return ud;
  }

  ud.status = til;
  if (til === "godkendt") {
    ud.godkendtAf = uid;
    ud.godkendtMs = nu;
    ud.godkendtAutomatisk = false;
    /* ⚠ SELVGODKENDELSE MARKERES. Se noten i kanSkifteIndkoebsordre(). */
    if (ordre?.oprettetAf && ordre.oprettetAf === uid) ud.selvgodkendt = true;
  }
  if (til === "afvist") {
    ud.afvistAf = uid;
    ud.afvistMs = nu;
  }
  if (til === "sendt") ud.sendtMs = nu;
  if (til === "modtaget") ud.modtagetMs = nu;
  if (begrundelse) ud.begrundelse = begrundelse;

  return ud;
}

/**
 * ventendeOrdrer(ordrer, regler) → [{ ordre, sumOere, grund }]
 *
 * Køen på planchen: kun de der faktisk venter på et menneske, med grunden til
 * at de gør det. Sorteret ældst først — den der har ventet længst, er den der
 * spærrer noget.
 */
export function ventendeOrdrer(ordrer = [], regler) {
  return ordrer
    .filter((o) => o.status === "afventerGodkendelse")
    .map((o) => ({ ordre: o, sumOere: ordreSumOere(o), grund: kraeverGodkendelse(o, regler).grund }))
    .sort((a, b) => (a.ordre.oprettetMs || 0) - (b.ordre.oprettetMs || 0));
}

/** Grunden til at en ordre venter, som en sætning man kan læse i en tabel. */
export const GODKENDELSESGRUND = {
  overBeloeb: { label: "Over beløb", tone: "warn" },
  /* ⚠ EN UGYLDIG REGEL SKAL SES, IKKE SKJULES. Den spærrer alt, og hvis det
     bare stod "Over beløb", ville man lede efter beløbet frem for efter
     reglen. */
  ugyldigRegel: { label: "Reglen mangler en grænse", tone: "bad" },
};

/* ══════════════════════════════════════════════════════════════════════════
   FAKTURAMATCH OG KONTANTKØB — beslutning 78, etape 5 (planche 1)
   ══════════════════════════════════════════════════════════════════════════

   Planchen viser tre ting ved siden af hinanden: de modtagne fakturaer, et
   forslag til hvilken BESTILLING hver enkelt hører til — med en score i
   procent — og et felt til at registrere et kontant køb.

   ⚠ SCOREN ER EN PÅSTAND OM SIKKERHED, OG DEN SKAL KUNNE EFTERPRØVES.
   "92 %" må ikke være en fornemmelse. Den regnes af navngivne signaler, og
   `matchForslag()` returnerer HVILKE der slog til — så den der bekræfter,
   kan se om de 92 % kommer af et bestillingsnummer eller af at beløbet
   tilfældigvis lignede.

   ⚠ OG KUN ET BESTILLINGSNUMMER GIVER FULD SCORE. Alt andet er en slutning:
   samme leverandør, nogenlunde samme beløb, nogenlunde samme uge. Det er
   grunden til at `mailudkast()` beder om nummeret på fakturaen (beslutning
   81) — uden det kan matchet kun gættes, og to bestillinger til samme firma i
   samme uge ser så ens ud.

   ⚠ SCOREN GEMMES IKKE. Den regnes hos forbrugeren af de poster den handler
   om. Et gemt tal driver fra sit grundlag første gang nogen retter et beløb —
   det er `bemanding.ledig` (beslutning 71), og her ville det være et
   sikkerhedstal der så præcist ud og ikke var det. Det der GEMMES, er
   AFGØRELSEN: hvilken ordre, hvem der bekræftede, hvornår.
*/

/**
 * ⚠ BEGGE BELØB SKAL VÆRE EKSKL. MOMS. Fakturaens `beloebOere` er ekskl.,
 * momsen er sit eget felt — og ordrens linjer er ekskl. Sammenlignede vi
 * fakturaens INKL.-tal med ordrens EKSKL.-tal, ville hver eneste
 * beløbssammenligning være 25 % forkert, systematisk, og se ud som om
 * leverandøren havde overfaktureret.
 *
 * ⚠ DET ER IKKE HYPOTETISK: planchens egen detaljerude skriver fakturaen som
 * *"23.031 kr. inkl. moms"* og den matchede ordre som *"23.031 kr. ekskl.
 * moms"*. Det er det SAMME tal med to forskellige mærkater — de kan ikke
 * begge være rigtige, og en af dem er 25 % ved siden af.
 */
export const MATCHSIGNAL = {
  nummer: { label: "Bestillingsnummer på fakturaen", vaegt: 100 },
  leverandoer: { label: "Samme leverandør", vaegt: 45 },
  beloeb: { label: "Samme beløb (ekskl. moms)", vaegt: 35 },
  beloebNaer: { label: "Beløb tæt på", vaegt: 18 },
  dato: { label: "Tæt på hinanden i tid", vaegt: 20 },
};

/** Hvor tæt to beløb må være for at tælle som "tæt på". 2 % af ordren. */
export const BELOEB_TOLERANCE_BPS = 200;

/** Hvor længe efter en bestilling en faktura stadig er sandsynlig. */
export const MATCH_VINDUE_DAGE = 90;

/**
 * ⚠ ET FORSLAG UNDER DET HER VISES IKKE. En liste med et 12 %-forslag
 * inviterer til at nogen bekræfter det for at komme videre — og en dårlig
 * match er værre end ingen, fordi den ser afsluttet ud.
 */
export const MATCH_MINDSTE_SCORE = 40;

/**
 * Hele kroner ud af hele øre, til en sammenligning der tåler afrunding.
 *
 * ⚠ EKSPORTERET — genbrugt af braendstofmatch.js's tilsvarende tolerance på
 * literantal (skaleret til centiliter-heltal først, se dens hoved). Samme
 * begrundelse som stiForDokument(): ÉT sted regner "tæt nok", ikke to
 * kopier der kan drive fra hinanden.
 */
export const naerNok = (a, b, bps) => {
  if (!Number.isInteger(a) || !Number.isInteger(b)) return false;
  if (a === b) return true;
  const stoerst = Math.max(Math.abs(a), Math.abs(b));
  if (!stoerst) return false;
  return (Math.abs(a - b) * 10000) / stoerst <= bps;
};

/** Ordrenummeret som det kan stå på en faktura — med eller uden bindestreger. */
const nummerform = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * matchForslag(faktura, ordrer) → [{ ordre, score, signaler, sumOere }]
 *
 * Sorteret bedst først, og kun dem over `MATCH_MINDSTE_SCORE`.
 *
 * ⚠ EN ORDRE DER ALLEREDE ER MATCHET, FORESLÅS IKKE. To fakturaer på samme
 * bestilling er enten en dublet eller en delfakturering, og begge dele skal
 * et menneske tage stilling til — ikke et forslag der ser rutinemæssigt ud.
 *
 * ⚠ OG EN KLADDE FORESLÅS HELLER IKKE. En bestilling der aldrig blev sendt,
 * kan ikke have udløst en faktura; stod den på listen, ville et tilfældigt
 * beløbssammenfald kunne "afslutte" en kladde ingen har bestilt.
 */
export function matchForslag(faktura, ordrer = [], { matchede = [] } = {}) {
  if (!faktura) return [];
  const brugte = new Set(matchede.filter(Boolean));
  const fakturaTekst = nummerform(`${faktura.fakturanummer || ""} ${faktura.reference || ""} ${faktura.note || ""}`);

  const ud = [];
  for (const o of ordrer) {
    if (brugte.has(o.id)) continue;
    if (o.status === "kladde" || o.status === "annulleret" || o.status === "afvist") continue;

    const signaler = [];
    /* ⚠ NUMMERET ER AFGØRENDE, IKKE ET SIGNAL BLANDT FLERE. Står ordrens
       nummer på fakturaen, er der ikke noget at gætte om. */
    if (o.nummer && fakturaTekst.includes(nummerform(o.nummer))) {
      signaler.push("nummer");
    }
    if (faktura.leverandoerId && faktura.leverandoerId === o.leverandoerId) {
      signaler.push("leverandoer");
    }

    const sum = ordreSumOere(o);
    if (Number.isInteger(faktura.beloebOere) && sum > 0) {
      if (faktura.beloebOere === sum) signaler.push("beloeb");
      else if (naerNok(faktura.beloebOere, sum, BELOEB_TOLERANCE_BPS)) signaler.push("beloebNaer");
    }

    const dage = Number.isFinite(faktura.fakturadatoMs) && Number.isFinite(o.oprettetMs)
      ? (faktura.fakturadatoMs - o.oprettetMs) / 86400000
      : null;
    /* Fakturaen kommer EFTER bestillingen. En faktura dateret før ordren er
       ikke "tæt på" — den er et andet køb. */
    if (dage !== null && dage >= -1 && dage <= MATCH_VINDUE_DAGE) signaler.push("dato");

    if (!signaler.length) continue;

    /**
     * ⚠ EN ANDEN LEVERANDØRS ORDRE FORESLÅS IKKE — uanset hvad beløbet er.
     *
     * Circle K sender ikke en regning for Dækteams bestilling. Uden det her
     * led kunne beløb + dato alene give 55 %, og et forslag på over halvdelen
     * ser rigtigt nok ud til at nogen bekræfter det for at komme videre. Det
     * blev målt på et opdigtet sæt, hvor en ordre til lv-hydra blev foreslået
     * til en faktura fra lv-daek, fordi de to tilfældigvis kostede det samme.
     *
     * Undtagelsen er nummeret: står vores bestillingsnummer på fakturaen, er
     * en forkert leverandoerId på den ene af de to en FEJL vi skal se, ikke
     * en grund til at skjule sammenhængen.
     */
    if (!signaler.includes("nummer") && !signaler.includes("leverandoer")) continue;

    /**
     * ⚠ ET NUMMERTRÆF GIVER 100, ALT ANDET HØJST 95.
     *
     * Uden nummeret er matchet en SLUTNING — samme leverandør, nogenlunde
     * samme beløb, nogenlunde samme uge. En slutning må ikke kunne se ud som
     * en kendsgerning; loftet er dét der holder de to fra hinanden på
     * skærmen, hvor tallet står ved siden af en knap der hedder "Bekræft".
     */
    const raa = signaler.reduce((s, k) => s + MATCHSIGNAL[k].vaegt, 0);
    const score = signaler.includes("nummer") ? 100 : Math.min(95, raa);
    if (score < MATCH_MINDSTE_SCORE) continue;

    ud.push({ ordre: o, score, signaler, sumOere: sum });
  }

  return ud.sort((a, b) => b.score - a.score || (b.ordre.oprettetMs || 0) - (a.ordre.oprettetMs || 0));
}

/**
 * Fakturaens tilstande på matchsiden — IKKE dens godkendelsesstatus.
 *
 * ⚠ TO SPØRGSMÅL, IKKE ÉT. "Hvilken bestilling hører den til" og "må den
 * betales" er uafhængige: en faktura kan være matchet og afvist, eller
 * godkendt uden nogensinde at have haft en bestilling (et kontantkøb bagud).
 * Slog vi dem sammen i ét `status`-felt, kunne man ikke skrive den ene uden
 * at påstå noget om den anden.
 */
export const MATCHTILSTAND = {
  matchet: { label: "Matchet", tone: "ok" },
  manglerMatch: { label: "Manglende match", tone: "warn" },
  ikkeMatchbar: { label: "Ikke matchbar", tone: "info" },
};

/** matchtilstand(faktura) → nøglen i MATCHTILSTAND. */
export function matchtilstand(faktura) {
  /* ⚠ ARTEN SKAL MED. Feltet er faelles nu (beslutning 86): en faktura
     placeret paa en Fleet-sag har ogsaa et `destinationId`, og uden at
     spoerge om arten ville Procure kalde den "matchet" — mod en ordre der
     ikke findes. */
  if (faktura?.destinationArt === "procure" && faktura?.destinationId) return "matchet";
  if (faktura?.ikkeMatchbar) return "ikkeMatchbar";
  return "manglerMatch";
}

/**
 * kanMatche(faktura, ordre) → { ok, aarsag }
 *
 * Svarer, afgør ikke — skærmen viser, `fakturamatch` håndhæver med den samme.
 */
export function kanMatche(faktura, ordre) {
  if (!faktura) return { ok: false, aarsag: "Ingen faktura valgt." };
  if (!ordre) return { ok: false, aarsag: "Vælg en bestilling." };
  if (faktura.destinationId === ordre.id) {
    return { ok: false, aarsag: "Fakturaen er allerede matchet med den bestilling." };
  }
  /* ⚠ EN BOGFØRT FAKTURA MATCHES IKKE OM. Posten er sendt til regnskabet, og
     et match der ændrer sig bagefter, gør en afstemning der stemte, til en
     der ikke gør — uden at nogen kan se hvorfor. */
  if (faktura.status === "bogfoert") {
    return { ok: false, aarsag: "Fakturaen er bogført. Matchet kan ikke ændres bagefter." };
  }
  if (ordre.status === "kladde") {
    return {
      ok: false,
      aarsag: "Bestillingen er en kladde — den er aldrig sendt, så den kan ikke have udløst en faktura.",
    };
  }
  if (ordre.status === "annulleret" || ordre.status === "afvist") {
    return {
      ok: false,
      aarsag: `Bestillingen er ${(ORDRESTATUS[ordre.status]?.label || ordre.status).toLowerCase()}.`,
    };
  }
  return { ok: true, aarsag: null };
}

/**
 * afvigelse mellem faktura og ordre, i hele øre. Positiv = fakturaen er højere.
 *
 * ⚠ BEGGE EKSKL. MOMS. Se noten ved MATCHSIGNAL. Og `null` når det ene tal
 * mangler — `0` ville betyde "de er ens", hvilket er noget helt andet end
 * "vi ved det ikke". `100 - null` er 100; det er den fælde CLAUDE.md kalder
 * at regne videre på et null.
 */
export function matchAfvigelseOere(faktura, ordre) {
  const sum = ordreSumOere(ordre);
  if (!Number.isInteger(faktura?.beloebOere) || !ordre || sum <= 0) return null;
  return faktura.beloebOere - sum;
}

/* ══════════════════════════════════════════════════════════════════════════
   KONTANTKØB
   ══════════════════════════════════════════════════════════════════════════

   ⚠ ET KONTANTKØB ER IKKE EN NY NODE. Det er en `indkoeb`-linje.

   `indkoeb` ER "det vi har købt" — en registrering bagud. Et kontant køb er
   nøjagtig dét, bare betalt på en anden måde. En node ved siden af ville være
   den samme kendsgerning to steder: leverandørernes nøgletal, varelageret,
   Overblik og hvert eneste beløb i modulet ville skulle huske at lægge de to
   sammen — og de ville ikke. Det er `bemanding.ledig` og de to demo-sæt om
   igen, denne gang med penge.

   ⚠ BETALINGSFORMEN ER ET FELT, IKKE EN STATUS. `fakturastatus` svarer på
   "har vi fået regningen"; `betalingsform` svarer på "hvordan betalte vi".
   Lagde vi "kontant" ind i `fakturastatus`, ville et kontantkøb for evigt
   stå som en linje der mangler sin faktura — og fremgå af hver optælling af
   det vi skylder.

   ⚠ OG DET ER ET UDLÆG, indtil nogen siger andet. `udlaegAf` er hvem der
   lagde ud — et `uid`, fordi det er hvem der GJORDE noget.
*/

export const BETALINGSFORM = {
  faktura: { label: "Faktura", tone: "info" },
  kontant: { label: "Kontant / udlæg", tone: "warn" },
};
export const ALLE_BETALINGSFORMER = Object.keys(BETALINGSFORM);

/**
 * valideKontantkoeb(post) → { ok, fejl }
 *
 * ⚠ KVITTERINGEN ER IKKE ET KRAV I KODEN, OG DET ER EN BESLUTNING. Der er
 * ingen fillagring endnu (kundens valg), så et krævet felt ville være
 * uopfyldeligt — og et krav man ikke kan opfylde, bliver til et felt man
 * skriver "ja" i. Manglen TÆLLES i stedet, som `kpi.opgaver.udenTidsregistrering`
 * gør det (beslutning 50): synlig frem for spærret.
 */
export function valideKontantkoeb(post = {}) {
  const f = {};

  if (!tekst(post.vare, 120)) f.vare = "Skriv hvad der blev købt.";
  if (!tekst(post.leverandoerId, 60)) f.leverandoerId = "Vælg hvor det blev købt.";
  if (!Number.isFinite(post.antal) || post.antal <= 0) {
    f.antal = "Antallet skal være større end nul.";
  }
  /* ⚠ HELE ØRE, EKSKL. MOMS — som alle beløb. En kvittering viser INKL., og
     det er præcis derfor feltet hedder noget andet end det der står på
     bonnen: den der taster, skal se forskellen. */
  if (!Number.isInteger(post.prisPrEnhedOere) || post.prisPrEnhedOere < 0) {
    f.prisPrEnhedOere = "Beløbet skal være i hele kroner, ekskl. moms.";
  }
  if (post.momsOere !== undefined && post.momsOere !== null
      && (!Number.isInteger(post.momsOere) || post.momsOere < 0)) {
    f.momsOere = "Momsen skal være i hele kroner.";
  }
  if (!tekst(post.udlaegAf, 128)) f.udlaegAf = "Vælg hvem der lagde ud.";
  if (!Number.isFinite(post.dato) || post.dato <= 0) f.dato = "Sæt datoen for købet.";
  if (post.betalingsform !== "kontant") {
    f.betalingsform = "Et kontantkøb skal bære betalingsform \"kontant\".";
  }
  if (post.note !== undefined && post.note !== null && String(post.note).length > 250) {
    f.note = "Noten er for lang (højst 250 tegn).";
  }
  if (post.division !== undefined) {
    f.division = "Division findes ikke længere — se beslutning 70.";
  }

  return { ok: Object.keys(f).length === 0, fejl: f };
}

/**
 * kontantkoebLinje(post, { uid, nu }) → linjen `indkoeb` skal bære.
 *
 * BYGGER, SKRIVER IKKE — samme mønster som `behovTilLinje()`.
 *
 * ⚠ `fakturastatus` SÆTTES IKKE TIL "mangler". Der KOMMER ingen faktura;
 * "mangler" ville lade købet stå i hver optælling af det vi venter på, og en
 * liste over manglende bilag ville aldrig kunne tømmes.
 */
export function kontantkoebLinje(post, { uid, nu } = {}) {
  const svar = valideKontantkoeb({ ...post, udlaegAf: post.udlaegAf || uid, betalingsform: "kontant" });
  if (!svar.ok) {
    throw new Error(`kontantkoebLinje: ${Object.values(svar.fejl)[0]}`);
  }
  return {
    vare: post.vare,
    antal: post.antal,
    prisPrEnhedOere: post.prisPrEnhedOere,
    leverandoerId: post.leverandoerId,
    dato: post.dato,
    betalingsform: "kontant",
    udlaegAf: post.udlaegAf || uid,
    /* ⚠ HVEM DER REGISTREREDE, ER IKKE HVEM DER LAGDE UD. En kontorassistent
       taster en kollegas bon; `oprettetAf` er hende, `udlaegAf` er ham, og
       pengene skal til ham. Samme skel som uid mod personId. */
    oprettetAf: uid,
    oprettetMs: nu,
    ...(post.enhed ? { enhed: post.enhed } : {}),
    ...(post.varenummer ? { varenummer: post.varenummer } : {}),
    ...(post.kategori ? { kategori: post.kategori } : {}),
    ...(Number.isInteger(post.momsOere) ? { momsOere: post.momsOere } : {}),
    ...(post.koeretoejId ? { koeretoejId: post.koeretoejId } : {}),
    ...(post.note ? { formaal: String(post.note).slice(0, 200) } : {}),
  };
}

/**
 * kontantUdenBilag(linjer) → de kontantkøb der mangler deres kvittering.
 *
 * ⚠ TÆLLES, IKKE SPÆRRES. Der er ingen fillagring endnu, så et krav ville
 * være uopfyldeligt — men et hul ingen kan se, bliver ikke lukket. Fjern
 * ikke tællingen når fillagringen kommer; så bliver den først rigtig.
 */
export function kontantUdenBilag(linjer = []) {
  return linjer.filter((l) => l.betalingsform === "kontant" && !l.bilagId);
}

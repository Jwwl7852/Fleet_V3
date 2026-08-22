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
    tilEmail: leverandoer?.kontaktEmail || null,
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
 * ⚠ `sendt` SÆTTES AF ET MENNESKE. Systemet sender ingen mail (beslutning 81),
 * så en automatisk overgang dertil ville være en påstand. Derfor er
 * *"Markér som sendt"* en handling og ikke en følge.
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
    { til: "sendt", label: "Markér som sendt", perm: "indkoeb.skriv" },
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

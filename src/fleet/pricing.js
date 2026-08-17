/* src/fleet/pricing.js
 * Prismotoren. ÉN beregning, fire forbrugere:
 *   Bookingopsætning → eksempelkortet
 *   Booking          → "Estimeret beløb"
 *   Disponering      → økonomi pr. disponeret opgave
 *   Økonomi          → estimat vs. faktisk
 *
 * To regler der skal holdes:
 *  1. Satser overskrives ALDRIG. De får gyldigFra og lægges i en historik.
 *     Ellers ændrer en rettelse i dag prisen på en booking fra sidste kvartal.
 *  2. Hver booking gemmer et snapshot af de satser den blev beregnet med.
 *     Snapshottet er sandheden — ikke det aktuelle satsark.
 *
 * Alle beløb i hele ØRE.
 */
import { kr } from "./format.js";
import { rabatteretSatsOere, BPS_SKALA } from "./beloeb.js";

/* ---- Satsopslag -------------------------------------------------- */

/**
 * Finder den sats der var gyldig på et givet tidspunkt.
 * satser: [{ gyldigFra: ms, beloebOere, metode, valuta, aktiv }]
 */
export function satsPaa(satser = [], paaMs = Date.now()) {
  return (
    satser
      .filter((s) => s.aktiv !== false && s.gyldigFra <= paaMs)
      .sort((a, b) => b.gyldigFra - a.gyldigFra)[0] || null
  );
}

/** Beregningsmetoder. Metoden bestemmer hvad antal betyder. */
export const METODER = {
  fastPrBooking: { label: "Pr. booking (fast pris)", enhed: null },
  prPassage:     { label: "Pr. passage",             enhed: "passager" },
  prPassageEnVej:{ label: "Pr. passage (én vej)",    enhed: "passager" },
  prDoegn:       { label: "Pr. døgn",                enhed: "døgn" },
  prKm:          { label: "Pr. km",                  enhed: "km" },
  prLagerdoegn:  { label: "Pr. lagerdøgn (efter friperiode)", enhed: "døgn" },

  /* ⚠ DE TRE HER KOM MED WAREHOUSE, og de er METODER frem for ydelser af en
     grund: "håndtering ind" og "håndtering ud" er to ydelser med hver sin
     pris, men de regnes ens — pr. hændelse. Blandede vi de to begreber
     sammen, ville kataloget have en linje pr. kombination i stedet for en
     pr. ting. */
  prHaandtering: { label: "Pr. håndtering",          enhed: "håndtering" },
  /* Opbevaring. ⚠ PÅBEGYNDTE DØGN, som prLagerdoegn — se lagerdoegn(). Et
     lager fakturerer det døgn godset ankom, også hvis det kom kl. 23. */
  prPalledoegn:  { label: "Pr. palleplads pr. døgn", enhed: "palledøgn" },
  prKubikdoegn:  { label: "Pr. m³ pr. døgn",         enhed: "m³-døgn" },
};

export const ALLE_METODER = Object.keys(METODER);

/* ══════════════════════════════════════════════════════════════════════════
   YDELSESKATALOGET — hvad der overhovedet kan prissættes
   ══════════════════════════════════════════════════════════════════════════

   ⚠ KATALOGET ER PLATFORMENS, PRISEN ER KUNDENS.
   Her står HVAD der kan sælges; hvad det koster, står i standardpriserne og i
   kundens afvigelse. Blandede vi de to, ville en vognmand der slettede en
   pris, også slette ydelsen — og en faktura fra sidste kvartal kunne ikke
   længere forklare hvad linjen var.

   ⚠ KATEGORIEN SIGER HVILKET MODUL ydelsen hører til. En vognmand uden
   Warehouse skal ikke sætte pris på en palleplads.
   ══════════════════════════════════════════════════════════════════════════ */

export const YDELSESKATEGORI = {
  koersel:     { kategori: "koersel",     label: "Kørsel",      modul: "booking" },
  passage:     { kategori: "passage",     label: "Passage",     modul: "booking" },
  agent:       { kategori: "agent",       label: "Agent",       modul: "booking" },
  ophold:      { kategori: "ophold",      label: "Ophold",      modul: "booking" },
  lager:       { kategori: "lager",       label: "Opbevaring",  modul: "warehouse" },
  haandtering: { kategori: "haandtering", label: "Håndtering",  modul: "warehouse" },
};

export const ALLE_YDELSESKATEGORIER = Object.keys(YDELSESKATEGORI);

/**
 * De ydelser Warehouse leverer.
 *
 * ⚠ DE STÅR HER OG IKKE I warehouse.js, fordi kataloget er ÉT. En vognmand
 * skal kunne se alle sine priser på én skærm, og et katalog pr. modul ville
 * betyde at prisskærmen skulle kende hvert eneste modul for at kunne tegne
 * sig.
 *
 * ⚠ ID-ET ER EN DATABASENØGLE. Derfor bindestreg og ikke punktum: RTDB
 * tillader hverken . # $ [ ] eller / i en nøgle, og standardprisen ligger på
 * `satser/standard/<ydelseId>/satser/<id>`. Med et punktum fejler skrivningen
 * med "invalid path" — et helt andet sted end der hvor navnet blev valgt.
 * Den fælde står allerede beskrevet ved BATCH_MOENSTER i warehouse.js; jeg
 * gik i den alligevel, og en probe mod den udrullede base fandt den.
 *
 * ⚠ HÅNDTERING IND OG UD ER TO YDELSER. De regnes ens (pr. hændelse), men de
 * koster ikke det samme: at tage imod en palle og at sende den ud er to
 * arbejdsgange. Én fælles "håndtering" ville gøre det umuligt at prissætte
 * dem forskelligt — og det er præcis dét der bedes om.
 */
export const LAGERYDELSER = {
  "lager-handlingInd": {
    navn: "Håndtering ind", kategori: "haandtering", metode: "prHaandtering",
    arter: ["modtag"],
  },
  "lager-handlingUd": {
    navn: "Håndtering ud", kategori: "haandtering", metode: "prHaandtering",
    arter: ["afsend"],
  },
  "lager-flytning": {
    navn: "Flytning", kategori: "haandtering", metode: "prHaandtering",
    arter: ["putaway", "flyt"],
  },
  "lager-pluk": {
    navn: "Pluk", kategori: "haandtering", metode: "prHaandtering",
    arter: ["pluk"],
  },
  "lager-retur": {
    navn: "Returhåndtering", kategori: "haandtering", metode: "prHaandtering",
    arter: ["retur"],
  },
  /* ⚠ DE TO OPBEVARINGSYDELSER HAR INGEN arter. De regnes ikke af bevægelser,
     men af hvad der STÅR på lageret pr. døgn — og den måling kan ikke laves
     bagud. Se WAREHOUSE.md. */
  "lager-palleplads": {
    navn: "Palleplads pr. døgn", kategori: "lager", metode: "prPalledoegn",
    arter: null,
  },
  "lager-kubik": {
    navn: "m³ pr. døgn", kategori: "lager", metode: "prKubikdoegn",
    arter: null,
  },
};

export const ALLE_LAGERYDELSER = Object.keys(LAGERYDELSER);

/**
 * ⚠ OPTÆLLING OG JUSTERING ER IKKE EN YDELSE.
 *
 * De er vores kontrol af vores eget arbejde, ikke noget kunden har bedt om.
 * Kunne de afregnes, ville en optælling være en indtægt — og så blev der talt
 * af de forkerte grunde. Listen står eksplicit, så en ny bevægelsesart ikke
 * lydløst bliver fakturerbar.
 */
export const IKKE_FAKTURERBARE_ARTER = ["optael", "justering"];

/** Ydelsen der dækker en bevægelsesart — eller null. */
export function ydelseForArt(art) {
  if (!art || IKKE_FAKTURERBARE_ARTER.includes(art)) return null;
  for (const [id, y] of Object.entries(LAGERYDELSER)) {
    if (y.arter?.includes(art)) return id;
  }
  return null;
}

function linjebeloeb(sats, antal) {
  if (!sats) return 0;
  const m = sats.metode;
  if (m === "fastPrBooking") return sats.beloebOere;
  if (m === "prPassageEnVej") return sats.beloebOere;   // tælles ikke dobbelt ved retur
  /* Friperioden ligger PÅ satsen, ikke i beregningen. Ændrer lageret sine
     fridage, er det en ny sats med gyldigFra — ikke en rettelse af en
     konstant et sted i koden. */
  if (m === "prLagerdoegn") {
    return sats.beloebOere * Math.max(0, (antal || 0) - (sats.friDage || 0));
  }
  return sats.beloebOere * Math.max(0, antal || 0);
}

/* ---- Beregning ---------------------------------------------------- */

/**
 * beregnBooking(booking, satsark, { paaMs })
 *
 * booking: {
 *   bilId, kmEstimeret, doegnParkering,
 *   passager: { "faerge:femern": 1, "bro:storebaelt": 1, ... },
 *   agentId, retur: false
 * }
 * satsark: {
 *   biler:  { [bilId]: { navn, registrering, kmPrisSatser: [...] } },
 *   poster: { [postId]: { navn, kategori, satser: [...] } },
 *   agenter:{ [agentId]: { navn, by, satser: [...] } }
 * }
 *
 * → { linjer, totalOere, snapshot }
 *   snapshot gemmes PÅ bookingen, så prisen kan genskabes bagefter.
 */
export function beregnBooking(booking, satsark, { paaMs = Date.now() } = {}) {
  const linjer = [];
  const snapshot = { beregnetMs: paaMs, satser: {} };

  const brug = (id, sats, navn, antal, beloeb) => {
    if (!sats || !beloeb) return;
    snapshot.satser[id] = { ...sats };
    linjer.push({ id, navn, antal, beloebOere: beloeb });
  };

  /* 1. Km-omkostning for den valgte bil (inkl. chauffør) */
  const bil = satsark.biler?.[booking.bilId];
  if (bil) {
    const s = satsPaa(bil.kmPrisSatser, paaMs);
    const km = booking.kmEstimeret || 0;
    brug(`bil:${booking.bilId}`, s, `Km-omkostning – ${bil.navn}`, km, linjebeloeb({ ...s, metode: "prKm" }, km));
  }

  /* 2. Faste poster: færger, broer, tunneller, vejafgifter, parkering.
        Antallet kommer fra ruten — ikke fra en fast antagelse om hvilke
        passager en international tur indeholder. */
  for (const [postId, post] of Object.entries(satsark.poster || {})) {
    const antal = booking.passager?.[postId] ?? (post.altidPaaBooking ? 1 : 0);
    if (!antal && !post.altidPaaBooking) continue;
    const s = satsPaa(post.satser, paaMs);
    brug(`post:${postId}`, s, post.navn, antal, linjebeloeb(s, antal));
  }

  /* 3. Agentparkering — kun hvis der er valgt en agent */
  const agent = satsark.agenter?.[booking.agentId];
  if (agent) {
    const s = satsPaa(agent.satser, paaMs);
    const doegn = booking.doegnParkering || 1;
    brug(`agent:${booking.agentId}`, s, `Agentparkering: ${agent.navn} (${agent.by})`,
         doegn, linjebeloeb({ ...s, metode: "prDoegn" }, doegn));
  }

  const totalOere = linjer.reduce((sum, l) => sum + l.beloebOere, 0);
  return { linjer, totalOere, snapshot };
}

/* ---- Forløb med flere etaper (beslutning 16) ----------------------- */

/** Påbegyndte døgn. Rundes OP: et lager fakturerer et påbegyndt døgn. */
export const lagerdoegn = (fraMs, tilMs) =>
  Math.max(0, Math.ceil((tilMs - fraMs) / 86400000));

/**
 * Hvornår forlader godset lageret? Rangorden — og den er hele rettelsen af
 * prototypens systematiske undervurdering:
 *
 *   1. faktisk afgang     næste etape er udført
 *   2. planlagt afgang    næste etape er reserveret
 *   3. FRISTEN (senestMs) etapen er stadig åben
 *
 * Punkt 3 er det vigtige. Prototypen regnede planner-estimatet UDEN
 * lagerdage og den endelige faktura MED, så estimatet var systematisk for
 * lavt. Ved at bruge fristen fejler estimatet nu for HØJT — den rigtige
 * retning for et omkostningsestimat.
 *
 * Der er ingen fjerde mulighed. Mangler alle tre, er det en modelfejl, og
 * så kaster vi frem for at returnere nul lagerdage — nul er lige præcis den
 * fejl vi er ved at lukke.
 */
export function lagerUd(ophold) {
  if (ophold.udMs) return { ms: ophold.udMs, grundlag: "faktisk", estimeret: false };
  if (ophold.udPlanlagtMs) return { ms: ophold.udPlanlagtMs, grundlag: "planlagt", estimeret: true };
  if (ophold.senestMs) return { ms: ophold.senestMs, grundlag: "frist", estimeret: true };
  throw new Error(
    "lagerUd: lagerophold uden udMs, udPlanlagtMs eller senestMs. " +
    "Et ophold uden ende kan ikke prissættes, og nul lagerdage er ikke svaret."
  );
}

/**
 * beregnForloeb(forloeb, satsark, { paaMs })
 *
 * forloeb: {
 *   etaper: [ <samme form som booking i beregnBooking()> ],
 *   lagerophold: [{ lagerId, efterEtape, indMs, udMs?, udPlanlagtMs?, senestMs, maengde }]
 * }
 * satsark.lagre: { [lagerId]: { navn, kapacitet, satser: [...], haandteringSatser: [...] } }
 *
 * → { etaper, lagerlinjer, totalOere, estimeret, snapshot }
 *
 * estimeret er sandt hvis mindst én lagerlinje hviler på et estimat. Så ved
 * forbrugeren at tallet kan flytte sig, og kan skrive det — i stedet for at
 * vise et estimat som var det en faktura.
 */
export function beregnForloeb(forloeb, satsark, { paaMs = Date.now() } = {}) {
  const snapshot = { beregnetMs: paaMs, satser: {} };

  const etaper = (forloeb.etaper || []).map((e) => {
    const r = beregnBooking(e, satsark, { paaMs });
    Object.assign(snapshot.satser, r.snapshot.satser);
    return { etapeId: e.id ?? null, nr: e.nr ?? null, ...r };
  });

  const lagerlinjer = [];
  for (const ophold of forloeb.lagerophold || []) {
    const lager = satsark.lagre?.[ophold.lagerId];
    if (!lager) continue;

    const ud = lagerUd(ophold);
    const doegn = lagerdoegn(ophold.indMs, ud.ms);

    const haandtering = satsPaa(lager.haandteringSatser, paaMs);
    if (haandtering) {
      const id = `lager:${ophold.lagerId}:haandtering`;
      snapshot.satser[id] = { ...haandtering };
      lagerlinjer.push({
        id, navn: `Lagerhåndtering ind/ud – ${lager.navn}`,
        antal: 1, beloebOere: linjebeloeb(haandtering, 1), estimeret: false,
      });
    }

    /* Lagerdagslinjen udelades ALDRIG. Der findes ingen kodesti hvor et
       estimat regnes uden den. */
    const doegnsats = satsPaa(lager.satser, paaMs);
    if (doegnsats) {
      const id = `lager:${ophold.lagerId}:doegn`;
      snapshot.satser[id] = { ...doegnsats };
      const fri = doegnsats.friDage || 0;
      lagerlinjer.push({
        id,
        navn: `Lagerdage – ${lager.navn}`,
        antal: doegn,
        friDage: fri,
        fakturerbareDage: Math.max(0, doegn - fri),
        beloebOere: linjebeloeb(doegnsats, doegn),
        estimeret: ud.estimeret,
        grundlag: ud.grundlag,
        udMs: ud.ms,
      });
    }
  }

  const totalOere =
    etaper.reduce((s, e) => s + e.totalOere, 0) +
    lagerlinjer.reduce((s, l) => s + l.beloebOere, 0);

  return {
    etaper,
    lagerlinjer,
    totalOere,
    estimeret: lagerlinjer.some((l) => l.estimeret),
    snapshot,
  };
}

/**
 * Genberegning af en gemt booking. Bruger snapshottet, ikke det aktuelle
 * satsark — så en faktura fra sidste kvartal kan altid forklares.
 */
export function beregnFraSnapshot(booking) {
  if (!booking.prisSnapshot) return null;
  return booking.prisLinjer.reduce((sum, l) => sum + l.beloebOere, 0);
}

/** Overstyring på den enkelte booking. Gemmes som linje, ikke ved at
 *  ændre satsen — så det fremgår hvem der afveg fra standardprisen. */
export function medOverstyring(resultat, { id, navn, beloebOere, af, begrundelse }) {
  const linjer = resultat.linjer.map((l) =>
    l.id === id ? { ...l, beloebOere, overstyret: { af, begrundelse, oprindelig: l.beloebOere } } : l
  );
  return { ...resultat, linjer, totalOere: linjer.reduce((s, l) => s + l.beloebOere, 0) };
}

export const formatLinje = (l) => `${l.navn}: ${kr(l.beloebOere, 2)}`;

/* ══════════════════════════════════════════════════════════════════════════
   STANDARDPRISEN
   ══════════════════════════════════════════════════════════════════════════

   ⚠ DEN LIGGER I `satser`, IKKE I EN NY NODE.

   `satser/standard/<ydelseId>/satser/<id> = { gyldigFra, beloebOere }`

   Noden har eksisteret siden beslutning 7 med sit gyldigFra-indeks og sin
   `satser.skriv`-permission — den har bare aldrig haft noget i sig, fordi
   satsarket stod som en `const` i Bookingopsaetning.jsx. En ny node ville
   have været et fjerde sted priser bor.

   ⚠ GRUPPEN HEDDER `standard` OG ER DEN ENESTE.
   Prisgruppen ("A"/"B") bærer ikke længere en pris: der er ÉN standardliste
   for hele virksomheden, og afvigelser sættes på den enkelte kunde. To lag,
   ikke tre — se PRISER.md punkt 4.1.
   ══════════════════════════════════════════════════════════════════════════ */

export const STANDARDGRUPPE = "standard";

/**
 * ⚠ EN SATS OVERSKRIVES ALDRIG. Rettes prisen, kommer der en NY post med sin
 * egen `gyldigFra`. Reglerne kan ikke forbyde en overskrivning uden også at
 * forbyde en rettelse af en tastefejl samme dag, så formen håndhæves i
 * reglerne og beslutningen her.
 */
export function valideSats(post = {}, { nu = Date.now() } = {}) {
  const f = {};

  if (!Number.isFinite(post.gyldigFra)) f.gyldigFra = "Vælg hvornår prisen gælder fra.";
  else if (post.gyldigFra < Date.UTC(2020, 0, 1)) f.gyldigFra = "Datoen ligger urealistisk langt tilbage.";
  else if (post.gyldigFra > nu + 5 * 365 * 86400000) f.gyldigFra = "Datoen ligger mere end fem år ude i fremtiden.";

  if (!Number.isInteger(post.beloebOere)) f.beloebOere = "Skriv en pris.";
  else if (post.beloebOere < 0) f.beloebOere = "En pris kan ikke være negativ.";

  if (post.valuta && !/^[A-Z]{3}$/.test(post.valuta)) f.valuta = "Tre store bogstaver, fx DKK.";
  if (post.metode && !METODER[post.metode]) f.metode = "Ukendt beregningsmetode.";

  for (const k of Object.keys(f)) if (!f[k]) delete f[k];
  return f;
}

/**
 * Standardprisen for en ydelse på et tidspunkt — eller `null`.
 *
 * ⚠ `null`, IKKE 0. En ydelse uden pris er et ubesvaret spørgsmål, ikke en
 * gratis ydelse. Samme regel som momssatsen der mangler: et system der gætter
 * rigtigt ni gange ud af ti, lærer brugeren at stole på det tiende.
 *
 * ⚠ OG OPSLAGET GÅR GENNEM satsPaa(). Den bærer allerede beslutning 7 om at
 * satser aldrig overskrives, og en kopi her ville være to steder der afgør
 * hvilken pris der gjaldt.
 */
export function standardPris(standardpriser = {}, ydelseId, paaMs = Date.now()) {
  return satsPaa(satsliste(standardpriser?.[ydelseId]), paaMs);
}

/**
 * Satserne på en prispost som et array.
 *
 * `useListe()` giver et array; en rå RTDB-læsning giver et objekt. En
 * funktion der kun tålte det ene, ville virke i én skærm og fejle i den
 * næste — og det ville se ud som en manglende pris.
 */
export function satsliste(post) {
  return Array.isArray(post?.satser) ? post.satser : Object.values(post?.satser || {});
}

/**
 * Ydelserne der er i spil for en tenant, ud fra hvilke moduler den har.
 *
 * ⚠ EN VOGNMAND UDEN WAREHOUSE SKAL IKKE SÆTTE PRIS PÅ EN PALLEPLADS.
 * Prisskærmen ville ellers bede om tal for noget han ikke har købt — og de
 * tal ville stå der og se ud som en aftale.
 */
export function ydelserForModuler(moduler) {
  const harModul = (m) => !moduler || moduler[m] === true;
  return Object.entries(LAGERYDELSER)
    .filter(([, y]) => harModul(YDELSESKATEGORI[y.kategori]?.modul))
    .map(([id, y]) => ({ id, ...y }));
}

/* ══════════════════════════════════════════════════════════════════════════
   KUNDENS AFVIGELSE
   ══════════════════════════════════════════════════════════════════════════

   `kunder/<kundeId>/priser/<ydelseId>/satser/<satsId>`

   ⚠ DEN LIGGER PÅ KUNDEN, OG DET ER EN AFVEJNING DER BLEV TAGET BEVIDST.

   `.write` kaskaderer i RTDB, og `kunder` er skrivbar med `kunder.skriv` —
   som casehandler, disponent og koordinator alle har gennem BASIS_DATA.
   `satser.skriv` har kun admin. Uden videre ville prisen på kunden altså
   kunne sættes af flere end standardprisen kan, alene fordi den ligger i en
   anden sti. Det er ikke en rettighed nogen har besluttet at give.

   Derfor har `priser`-undertræet en `.validate` der OGSÅ kræver
   `satser.skriv`. En `.validate` kan læse `auth`, og den kan strammes hvor en
   `.write` ikke kan løsnes fra oven.

   ⚠ HULLET DER BLIVER TILBAGE: `.validate` kører ikke ved en SLETNING. En
   bruger med `kunder.skriv` alene kan derfor fjerne en kundes prisafvigelse,
   men ikke sætte eller ændre den. Det er skrevet her frem for at blive
   opdaget, og det er grunden til at skærmen ikke har en sletteknap — der
   findes ingen vej til det i klienten, som `skriv.js` ikke har en slet().

   ⚠ TIL GENGÆLD ARVER PRISEN KUNDENS EGEN VALIDERING. `kunder/$kundeId`
   kræver `division`, og den regel gælder også en skrivning dybt nede i
   undertræet: en pris på en kunde der ikke findes, afvises af reglerne.
   Det er den samme kendsgerning ét sted — ikke et opslag skærmen skal huske.
   ══════════════════════════════════════════════════════════════════════════ */

/** Stien til én kundesats. Ét sted, så skærmen ikke bygger den af strenge. */
export const kundeprisSti = (kundeId, ydelseId, satsId) =>
  `kunder/${kundeId}/priser/${ydelseId}/satser/${satsId}`;

/**
 * ⚠ ENTEN EN EGEN PRIS ELLER EN RABAT — ALDRIG BEGGE.
 *
 * To felter der begge kan sætte prisen, er to svar på samme spørgsmål, og så
 * bliver det tilfældigt hvilket der vinder. Reglen står både her og i
 * `firebase.rules.json`: formularen svarer hurtigt, reglerne afgør.
 */
export function valideKundesats(post = {}, { nu = Date.now() } = {}) {
  const harPris = post.beloebOere !== undefined && post.beloebOere !== null;
  const harRabat = post.rabatBps !== undefined && post.rabatBps !== null;

  const f = {};

  /* Datoen, metoden og valutaen er de samme regler som standardprisen.
     `beloebOere` prøves kun når den er der — derfor uden feltet her. */
  const grund = valideSats({ ...post, beloebOere: harPris ? post.beloebOere : 0 }, { nu });
  if (grund.gyldigFra) f.gyldigFra = grund.gyldigFra;
  if (harPris && grund.beloebOere) f.beloebOere = grund.beloebOere;
  if (grund.metode) f.metode = grund.metode;
  if (grund.valuta) f.valuta = grund.valuta;

  if (harPris && harRabat) {
    f.form = "Vælg enten en egen pris eller en rabat — ikke begge.";
  } else if (!harPris && !harRabat) {
    f.form = "Sæt enten en egen pris eller en rabat.";
  }

  if (harRabat) {
    /* Basispoint som i ejerkonsollen: 1500 = 15,00 %. En procent med
       decimaler ville give en afrundingsregel mere. */
    if (!Number.isInteger(post.rabatBps)) f.rabatBps = "Rabatten skal være hele basispoint (1500 = 15 %).";
    else if (post.rabatBps < 0) f.rabatBps = "En rabat kan ikke være negativ.";
    else if (post.rabatBps > BPS_SKALA) f.rabatBps = "En rabat kan ikke være over 100 %.";
  }

  return f;
}

/** Kundens gældende afvigelse for en ydelse — eller null. */
export function kundeSats(kundepriser = {}, ydelseId, paaMs = Date.now()) {
  return satsPaa(satsliste(kundepriser?.[ydelseId]), paaMs);
}

/**
 * prisFor({ standard, kunde }, ydelseId, paaMs)
 *
 *   → kundens egen sats på tidspunktet      (hvis der er en)
 *   → ellers standard × (1 − rabat)          (hvis der er en rabat)
 *   → ellers standarden
 *   → ellers null
 *
 * ⚠ `null`, IKKE 0. En ydelse uden pris er et ubesvaret spørgsmål, ikke en
 * gratis ydelse — samme regel som momssatsen der mangler.
 *
 * ⚠ OG EN RABAT PÅ INGENTING ER OGSÅ null. 15 % af en pris der ikke findes,
 * er ikke nul kroner; det er det samme ubesvarede spørgsmål med et tal foran.
 * Regnede vi den til 0, ville en glemt standardpris blive til en gratis ydelse
 * hos præcis den kunde der havde forhandlet sig til en rabat.
 *
 * ⚠ RABATTEN REGNES IND I SATSEN, ÉN GANG — gennem rabatteretSatsOere() i
 * beloeb.js. Lagde vi den oven på linjebeløbet, ville der afrundes to gange,
 * og summen af linjerne ville holde op med at stemme med totalen.
 *
 * ⚠ OG OPSLAGET GÅR GENNEM satsPaa(). Den bærer beslutning 7 om at satser
 * aldrig overskrives; en kopi her ville være to steder der afgør hvilken pris
 * der gjaldt.
 */
export function prisFor({ standard = {}, kunde = {} } = {}, ydelseId, paaMs = Date.now()) {
  const std = standardPris(standard, ydelseId, paaMs);
  const egen = kundeSats(kunde, ydelseId, paaMs);
  const standardOere = std ? std.beloebOere : null;

  if (egen && Number.isFinite(egen.beloebOere)) {
    return {
      oere: egen.beloebOere, kilde: "kunde",
      standardOere, rabatBps: null, sats: egen, standardSats: std,
    };
  }

  if (egen && Number.isFinite(egen.rabatBps)) {
    if (!std) return null;
    return {
      oere: rabatteretSatsOere(std.beloebOere, egen.rabatBps), kilde: "rabat",
      standardOere, rabatBps: egen.rabatBps, sats: egen, standardSats: std,
    };
  }

  if (std) {
    return {
      oere: std.beloebOere, kilde: "standard",
      standardOere, rabatBps: null, sats: std, standardSats: std,
    };
  }

  return null;
}

/** Hvor prisen kom fra — til visning. Kilden står ALTID ved tallet: en pris
 *  man ikke kan se oprindelsen af, kan ikke forklares over for kunden. */
export const PRISKILDE = {
  kunde:    { label: "Egen pris", tone: "warn" },
  rabat:    { label: "Rabat",     tone: "info" },
  standard: { label: "Standard",  tone: "ok" },
};

/* ══════════════════════════════════════════════════════════════════════════
   ÉN OPSLAGSVEJ FOR HELE PLATFORMEN
   ══════════════════════════════════════════════════════════════════════════

   ⚠ ALLE DER SKAL BRUGE EN PRIS, SKAL IGENNEM HER.

   `prisFor()` afgør hvad kunden betaler for én ydelse på ét tidspunkt.
   `satsopslag()` pakker den til de forbrugere der regner på mange linjer —
   `afregningslinjer()` i warehouse.js i dag, prismotoren senere. Uden den
   ville hver forbruger bygge sit eget opslag, og så bliver det tilfældigt
   hvilken pris der gjaldt.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ TO KATALOGER SKAL MØDES, OG BROEN ER ARTEN — IKKE EN TABEL.
 *
 * `LAGERYDELSER` her siger hvad der kan PRISSÆTTES; `YDELSE` i warehouse.js
 * siger hvad der kan AFREGNES. De to filer kan ikke importere hinanden —
 * warehouse.js er importfri, fordi den kopieres til serveren — og en
 * håndskrevet oversættelsestabel ville være det syvende sted i dette repo
 * hvor to lister skulle holdes i sync i hånden.
 *
 * I stedet oversættes der gennem **bevægelsesarten**, som begge kataloger
 * kender: afregningsydelsens arter slås op i `ydelseForArt()`.
 *
 * ⚠ ER SVARET TVETYDIGT, GIVES DER INGEN PRIS. Peger to arter på hver sin
 * prisydelse, kan opslaget ikke afgøre hvilken der gælder — og et gæt ville
 * fakturere en pris ingen kan forklare. `null` er det rigtige svar, og
 * linjen står så som "mangler sats", præcis som en ydelse uden pris.
 */
export function prisydelseForArter(arter = []) {
  const ider = [...new Set(arter.map(ydelseForArt).filter(Boolean))];
  return ider.length === 1 ? ider[0] : null;
}

/**
 * satsopslag({ standard, kunde, arterFor }) → satsFor(ydelse, paaMs)
 *
 * Formen på svaret er den `afregningslinjer()` forventer: `beloebOere` og
 * `gyldigFra`. Den bærer desuden `kilde`, så en linje kan forklare HVOR
 * prisen kom fra — standard, rabat eller kundens egen. En pris på en faktura
 * man ikke kan spore, er en pris man ikke kan forsvare.
 */
export function satsopslag({ standard = {}, kunde = {}, arterFor } = {}) {
  if (typeof arterFor !== "function") {
    throw new Error(
      "satsopslag: arterFor(ydelse) mangler. Broen mellem afregningens og " +
      "prisernes katalog går gennem bevægelsesarten — se prisydelseForArter()."
    );
  }
  return (ydelse, paaMs) => {
    const id = prisydelseForArter(arterFor(ydelse) || []);
    if (!id) return null;
    const r = prisFor({ standard, kunde }, id, paaMs);
    if (!r) return null;
    return {
      /* ⚠ DEN PRIS DER FAKTISK GJALDT — ikke standarden. Er der en rabat, er
         det den rabatterede sats der skal på linjen, og `kilde` siger hvorfor
         den ikke er den samme som standardprisen. */
      beloebOere: r.oere,
      gyldigFra: r.sats?.gyldigFra ?? null,
      kilde: r.kilde,
      ydelseId: id,
    };
  };
}

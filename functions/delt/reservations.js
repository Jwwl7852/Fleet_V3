/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/reservations.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/* src/fleet/reservations.js
 * ÉN reservationsmodel. Tre kilder skriver til den:
 *   booking      → enhed + medarbejder reserveret til en tur
 *   vaerksted    → bil blokeret under værkstedsbesøg
 *   facilitySag  → aktiv eller lokation optaget af et servicebesøg
 *
 * Uden dette har du tre kalendere der ikke kan se hinanden, og en bil
 * kan blive booket til Hamburg samtidig med at den står på værksted.
 *
 * Sti: tenants/<id>/reservationer/<ressourceType>/<ressourceId>/<resId>
 * Tider i epoch ms. Halvåbne intervaller: [fra, til)
 */

export const RESSOURCE = {
  koeretoej: "koeretoej",   // også trailere og påhæng — art står på enheden
  /* MEDARBEJDER, ikke chauffør. En lagermedarbejders ferie skal også kunne
     blokere hende, og en værkstedsopgave tildeles en mekaniker. Hed den
     'chauffoer', var halvdelen af personalet usynligt for disponeringen —
     én ting med et for snævert navn, spejlvendingen af beslutning 11. */
  medarbejder: "medarbejder",
  facilityAktiv: "facilityAktiv",
  lokation: "lokation",
  lager: "lager",           // beslutning 16 — kapacitet, ikke eksklusivitet
};

export const KILDE = {
  booking: "booking",
  vaerksted: "vaerksted",
  facilitySag: "facilitySag",
  fravaer: "fravaer",      // ferie, sygdom — blokerer medarbejderen
  lager: "lager",          // gods der står mellem to etaper
  manuel: "manuel",
};

/**
 * BESLUTNING 16 — to slags ressourcer i den SAMME node.
 *
 *   eksklusiv   én ad gangen. Enhver overlapning er en konflikt.
 *   kapacitet   mange på én gang. Konflikt kun hvis SUMMEN over overlappet
 *               overskrider kapaciteten.
 *
 * Lageret kunne have fået sin egen model ved siden af. Det ville have brudt
 * beslutning 4: så kunne en facility-sag der spærrer lagerhallen og en
 * forsendelse på samme hal ikke se hinanden — det er nøjagtig de tre
 * kalendere om igen, bare med et nyt navn.
 */
export const RESSOURCE_ART = {
  koeretoej: "eksklusiv",
  medarbejder: "eksklusiv",
  facilityAktiv: "eksklusiv",
  lokation: "eksklusiv",
  lager: "kapacitet",
};

export const erKapacitet = (ressourceType) => RESSOURCE_ART[ressourceType] === "kapacitet";

/** Hvilke kilder må overskrive hvilke. Værksted vinder over booking:
 *  en bil på værksted kan ikke køre, uanset hvad disponenten har lovet.
 *
 *  Prioritet gælder KUN eksklusive ressourcer. Man smider ikke en palle ud
 *  af lageret, fordi en værkstedsopgave har prioritet 40 — derfor står
 *  'lager' ikke på listen, og kapacitetsgrenen i tjekLedig() rører den ikke.
 *
 *  EKSPORTERET, så en skærm kan VISE prioriteten frem for at skrive tallet
 *  selv. Ferie & fravær viser hvad reservationen ville blive, og "30" skrevet
 *  i den skærm ville være samme regel to steder — den fejl der lå i
 *  Bookingopsætnings divisionsfilter, usynlig indtil den ene kopi drev. */
export const PRIORITET = { vaerksted: 40, fravaer: 30, facilitySag: 20, booking: 10, manuel: 5 };

/** Prioriteten for en kilde. Ukendt kilde giver 0 — den kan overskrive
 *  ingenting, hvilket er den sikre retning. */
export const prioritetFor = (kildeType) => PRIORITET[kildeType] ?? 0;

export const overlapper = (a, b) => a.fra < b.til && b.fra < a.til;

/**
 * Største samtidige belastning i et vindue. Sweep-line: +mængde ved fra,
 * −mængde ved til. Det er toppen der afgør om der er plads — ikke summen
 * over hele perioden, og ikke antallet af reservationer.
 *
 * felt er "m3" eller "kg". De tjekkes hver for sig: en palle kan være let
 * og fylde meget, eller tung og fylde lidt.
 */
export function maksBelastning(reservationer, { fra, til }, felt) {
  const haendelser = [];
  for (const r of reservationer) {
    if (r.annulleret) continue;
    const m = r.maengde?.[felt] || 0;
    if (!m) continue;
    if (!overlapper(r, { fra, til })) continue;
    haendelser.push({ ms: Math.max(r.fra, fra), delta: m });
    haendelser.push({ ms: Math.min(r.til, til), delta: -m });
  }
  /* Frigivelse før optagelse ved samme millisekund: intervaller er halvåbne,
     så en der slutter kl. 12 og en der starter kl. 12 er ikke samtidige. */
  haendelser.sort((a, b) => a.ms - b.ms || a.delta - b.delta);

  let nu = 0, top = 0;
  for (const h of haendelser) {
    nu += h.delta;
    if (nu > top) top = nu;
  }
  return top;
}

/** Fritekst til brugeren om hvorfor en reservation kollidere. */
export function konfliktTekst(ny, eksisterende) {
  const k = eksisterende.kilde;
  if (k.type === KILDE.vaerksted) return `Enheden er reserveret til værksted (${k.reference || k.id}).`;
  if (k.type === KILDE.fravaer) return `Medarbejderen har registreret fravær i perioden.`;
  if (k.type === KILDE.booking) return `Allerede reserveret til booking ${k.reference || k.id}.`;
  if (k.type === KILDE.facilitySag) return `Optaget af servicebesøg fra sag ${k.reference || k.id}.`;
  return "Ressourcen er optaget i perioden.";
}

/**
 * Læser reservationer i et tidsvindue.
 *
 * RTDB kan kun filtrere på ét felt, så vi indekserer på `fra`, henter et
 * vindue der er bredt nok til at fange reservationer der startede før
 * `fra` men stadig løber, og filtrerer resten klientside. Sæt
 * "reservationer/$type/$id": { ".indexOn": "fra" } i security rules.
 */
export async function hentReservationer(db, path, ressourceType, ressourceId, { fra, til, maxVarighedDage = 30 }) {
  const vindueStart = fra - maxVarighedDage * 86400000;
  const snap = await db
    .ref(path(`reservationer/${ressourceType}/${ressourceId}`))
    .orderByChild("fra")
    .startAt(vindueStart)
    .endAt(til)
    .once("value");

  const ud = [];
  snap.forEach((barn) => {
    const r = { id: barn.key, ...barn.val() };
    if (!r.annulleret && overlapper(r, { fra, til })) ud.push(r);
  });
  return ud.sort((a, b) => a.fra - b.fra);
}

/**
 * Tjekker om en reservation kan oprettes.
 *
 * Eksklusiv ressource  → { ok, konflikter, kanOverskrive }
 * Kapacitetsressource  → { ok, konflikter, restkapacitet }
 *
 * kapacitet: { m3, kg } skal med for et lager. Uden den kan vi ikke svare på
 * spørgsmålet, og så skal vi sige det frem for at gætte på "der er nok plads".
 */
export async function tjekLedig(db, path, ny, opts = {}) {
  const eksisterende = await hentReservationer(db, path, ny.ressourceType, ny.ressourceId, {
    fra: ny.fra, til: ny.til, ...opts,
  });
  return tjekLedigMod(eksisterende, ny, opts);
}

/**
 * Samme kontrol, men mod en liste man allerede HAR.
 *
 * Hele logikken ligger her; tjekLedig() henter og delegerer. Opdelingen er
 * ikke pænhed — den er nødvendig:
 *
 *  1. I demo-mode er `db` null, og tjekLedig() ville kaste. Disponering kunne
 *     derfor ikke vise det fjerde af sine fem tjek uden en database.
 *  2. Den Cloud Function der skriver en etape, henter alligevel sine
 *     reservationer i én transaktion — den skal kunne kontrollere dem uden at
 *     læse dem igen.
 *  3. Logikken kunne ikke testes uden emulator. Nu kan den.
 *
 * Samme greb som gitter.js og demo-kpi.js: den rene kerne skal kunne kaldes
 * uden infrastruktur.
 *
 * `eksisterende` skal allerede være afgrænset til den rigtige ressource og
 * det rigtige vindue — det er hentReservationer() der ved hvordan man spørger
 * RTDB, og den viden hører ikke to steder.
 */
export function tjekLedigMod(eksisterende = [], ny, opts = {}) {
  /* Overlapsfiltreringen sker HER og ikke kun i hentReservationer().
     hentReservationer() filtrerer allerede, så for tjekLedig() er det
     dobbeltarbejde uden virkning. Men en kalder der har hele ressourcens
     reservationsliste i hånden — som Disponering har — ville ellers få hver
     eneste reservation meldt som konflikt. Kapacitetsgrenen filtrerer selv
     inde i maksBelastning(). */
  const andre = eksisterende.filter(
    (r) => !r.annulleret && r.id !== ny.id && overlapper(r, { fra: ny.fra, til: ny.til })
  );

  if (erKapacitet(ny.ressourceType)) {
    const kapacitet = opts.kapacitet;
    if (!kapacitet) {
      throw new Error(
        `tjekLedig: ${ny.ressourceType} er en kapacitetsressource og kræver opts.kapacitet ({ m3, kg }).`
      );
    }
    const restkapacitet = {};
    const konflikter = [];
    for (const felt of ["m3", "kg"]) {
      if (kapacitet[felt] == null) continue;
      const top = maksBelastning(andre, { fra: ny.fra, til: ny.til }, felt);
      const oenskes = ny.maengde?.[felt] || 0;
      restkapacitet[felt] = kapacitet[felt] - top;
      if (top + oenskes > kapacitet[felt]) {
        konflikter.push({
          felt,
          iBrug: top,
          oenskes,
          kapacitet: kapacitet[felt],
          tekst: `Lageret har ${restkapacitet[felt]} ${felt} ledigt i perioden, der er brug for ${oenskes}.`,
        });
      }
    }
    /* Ingen kanOverskrive: kapacitet overskrives ikke. Der er plads, eller
       også er der ikke. */
    return { ok: konflikter.length === 0, konflikter, restkapacitet };
  }

  const konflikter = andre.map((r) => ({ ...r, tekst: konfliktTekst(ny, r) }));
  const nyPri = PRIORITET[ny.kilde.type] ?? 0;
  const kanOverskrive = konflikter.every((r) => (PRIORITET[r.kilde.type] ?? 0) < nyPri);

  return { ok: konflikter.length === 0, konflikter, kanOverskrive };
}

/**
 * Opretter en reservation. Kaster hvis der er en konflikt af højere eller
 * samme prioritet — så "Ingen konflikter fundet" i UI'et betyder noget.
 *
 * Det endelige tjek hører i en Cloud Function: to disponenter kan ramme
 * samme sekund, og klientsidetjek kan ikke forhindre det. Denne funktion
 * er til UI-feedback, ikke til at garantere unikhed.
 */
export async function reserver(db, path, ny, { tving = false, kapacitet } = {}) {
  /* Et lagerophold uden slutdato må ALDRIG gemmes som til: null. Man kan
     ikke summere kapacitet over uendelighed, og en åben ende betyder i
     praksis at hallen er fuld for altid. Er afgangen ukendt, sættes til til
     etapens frist (senestMs) — se lagerUd() i pricing.js, der bruger samme
     rangorden til prisen. */
  if (!Number.isFinite(ny.til)) {
    throw new Error(
      "reserver: til skal være et konkret tidspunkt. Er afgangen ukendt, brug etapens senestMs som estimat."
    );
  }

  const tjek = await tjekLedig(db, path, ny, { kapacitet });
  const maaOverskrive = tving && !erKapacitet(ny.ressourceType) && tjek.kanOverskrive;
  if (!tjek.ok && !maaOverskrive) {
    const fejl = new Error(
      erKapacitet(ny.ressourceType)
        ? "Der er ikke kapacitet nok i perioden."
        : "Ressourcen er ikke ledig i perioden."
    );
    fejl.konflikter = tjek.konflikter;
    throw fejl;
  }

  const ref = db.ref(path(`reservationer/${ny.ressourceType}/${ny.ressourceId}`)).push();
  const post = {
    fra: ny.fra,
    til: ny.til,
    kilde: ny.kilde,                 // { type, id, reference }
    maengde: ny.maengde || null,     // { m3, kg } — kun kapacitetsressourcer
    note: ny.note || null,
    oprettetMs: Date.now(),
    oprettetAf: ny.oprettetAf || null,
    annulleret: false,
  };
  await ref.set(post);

  /* Overskrevne reservationer annulleres med spor — de slettes ikke, så
     man kan forklare hvorfor en tur blev flyttet. */
  if (maaOverskrive) {
    for (const k of tjek.konflikter) {
      await db.ref(path(`reservationer/${ny.ressourceType}/${ny.ressourceId}/${k.id}`)).update({
        annulleret: true,
        annulleretMs: Date.now(),
        annulleretAf: ny.oprettetAf || null,
        annulleretAarsag: `Overskrevet af ${ny.kilde.type} ${ny.kilde.reference || ny.kilde.id}`,
      });
    }
  }

  return { id: ref.key, ...post };
}

/** Frigiv — soft delete, aldrig hård. Regnskab og disponering skal kunne
 *  genfortælle hvad der skete. */
export const frigiv = (db, path, ressourceType, ressourceId, resId, af, aarsag) =>
  db.ref(path(`reservationer/${ressourceType}/${ressourceId}/${resId}`)).update({
    annulleret: true, annulleretMs: Date.now(), annulleretAf: af || null, annulleretAarsag: aarsag || null,
  });

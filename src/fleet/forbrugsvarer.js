/* src/fleet/forbrugsvarer.js
 * Procures EGET varelager — beslutning 85.
 *
 * ⚠ IKKE `varer`. IKKE `lagre`. IKKE `warehouse`.
 *
 * Det er fjerde gang et lagernavn skal skilles fra et andet i den her base, og
 * forskellen er ikke sproglig — den er hvem godset TILHØRER:
 *
 *   `varer` + `beholdning`   Warehouse. **Kundens** gods, 3PL. `kundeId` er
 *                            PÅKRÆVET. Vi opbevarer det og fakturerer for
 *                            håndtering ind, opbevaring og håndtering ud.
 *   `lagre`                  Reservedelslageret under Fleet, med satser.
 *   `warehouse`              RESERVERET til et kommende modul (se CLAUDE.md).
 *   `forbrugsvarer`          **Vores egne** forbrugsvarer: handsker, strækfilm,
 *                            papir, filtre. Dem vi bruger op og køber igen.
 *
 * ⚠ OG SKELLET ER IKKE PEDANTERI. Overblikkets kort "Lav lagerbeholdning" stod
 * som `null` indtil den her node fandtes, netop fordi det ALTERNATIV der lå
 * lige for — at regne det af `varer`/`beholdning` — ville få Procure til at
 * bede os bestille noget en KUNDE mangler. Se beslutning 84.
 *
 * ⚠ FILEN ER REN OG KENDER INGEN DATABASE. Samme grund som `procure.js` og
 * `beregnKpi()`: hele regnestykket kan prøves uden en emulator, og Cloud
 * Functionen henter posterne og kalder herind.
 */

const tekst = (v, maks) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= maks;

/**
 * Bevægelsens art.
 *
 * ⚠ FIRE ARTER, IKKE ET FORTEGN. `antal: -3` alene siger at beholdningen faldt
 * med tre — ikke OM det var forbrug, svind eller en optælling der rettede en
 * fejl. De tre kræver hver sin handling: forbrug er normalt, svind skal
 * undersøges, og en korrektion er en indrømmelse af at tallet var forkert.
 * Ét felt der bare hed "ændring", ville gøre dem uskelnelige bagefter.
 */
export const BEVAEGELSESART = {
  modtaget: { label: "Modtaget", tone: "ok", retning: 1 },
  forbrug: { label: "Forbrug", tone: "info", retning: -1 },
  svind: { label: "Svind", tone: "bad", retning: -1 },
  /**
   * ⚠ EN OPTÆLLING ER IKKE EN BEVÆGELSE — DEN ER EN RETTELSE.
   *
   * Den bærer det TALTE antal, ikke en ændring, og bevægelsens `antal` er
   * forskellen. Uden den art ville en optælling skulle tastes som "korrektion
   * +4", og så skal den der tæller, regne i hovedet — og en fejl i det
   * hovedregnestykke ser bagefter ud som svind.
   */
  optaelling: { label: "Optælling", tone: "warn", retning: 0 },
};
export const ALLE_BEVAEGELSESARTER = Object.keys(BEVAEGELSESART);

/**
 * valideForbrugsvare(post) → { ok, fejl }
 *
 * ⚠ `minimumBeholdning` ER VALGFRIT, OG DET ER EN BESLUTNING.
 *
 * En vare uden en grænse har ingen "lav"-tilstand. Sattes den til 0 som
 * standard, ville varen ALDRIG være lav; sattes den til et tal, havde vi
 * opfundet en indkøbspolitik på kundens vegne. Begge er værre end at spørge.
 *
 * ⚠ MEN MANGLEN SKAL KUNNE SES. `udenGraense()` tæller dem, og skærmen viser
 * tallet — ellers betyder "0 varer under minimum" både "alt er fyldt op" og
 * "ingen har sat en grænse", og de to ser ens ud. Samme greb som
 * `kpi.opgaver.udenTidsregistrering` (beslutning 50).
 */
export function valideForbrugsvare(post = {}) {
  const f = {};

  if (!tekst(post.navn, 120)) f.navn = "Skriv hvad varen hedder.";
  if (!tekst(post.enhed, 20)) f.enhed = "Sæt en enhed — stk, pk, ruller.";
  if (post.varenummer !== undefined && post.varenummer !== null
      && !tekst(post.varenummer, 60)) {
    f.varenummer = "Varenummeret er for langt.";
  }
  if (post.minimumBeholdning !== undefined && post.minimumBeholdning !== null) {
    if (!Number.isFinite(post.minimumBeholdning) || post.minimumBeholdning < 0) {
      f.minimumBeholdning = "Minimum skal være nul eller derover.";
    }
  }
  /* ⚠ BEHOLDNINGEN SÆTTES IKKE I EN FORMULAR. Den er summen af bevægelser, og
     et felt man kunne taste, ville være en femte art ingen har besluttet —
     og den ville ikke stå i historikken. Skal tallet rettes, er det en
     OPTÆLLING. */
  if (post.beholdning !== undefined && post.beholdning !== null
      && !Number.isFinite(post.beholdning)) {
    f.beholdning = "Beholdningen er ikke et tal.";
  }
  if (post.division !== undefined) {
    f.division = "Division findes ikke længere — se beslutning 70.";
  }

  return { ok: Object.keys(f).length === 0, fejl: f };
}

/**
 * valideBevaegelse(post, { vare }) → { ok, fejl }
 *
 * ⚠ ANTALLET ER ALTID POSITIVT. Retningen kommer af ARTEN, ikke af et
 * fortegn: `antal: -3` med art `modtaget` er selvmodsigende, og en formular
 * der tillader begge, får før eller siden nogen til at taste minus på et
 * forbrug og trække to gange.
 */
export function valideBevaegelse(post = {}, { vare } = {}) {
  const f = {};

  if (!ALLE_BEVAEGELSESARTER.includes(post.art)) {
    f.art = "Vælg hvad der skete med varen.";
  }
  if (!tekst(post.forbrugsvareId, 60)) f.forbrugsvareId = "Vælg en vare.";
  if (!Number.isFinite(post.antal) || post.antal < 0) {
    f.antal = "Antallet skal være nul eller derover.";
  } else if (post.art !== "optaelling" && post.antal === 0) {
    /* En optælling til nul er et svar; en modtagelse af nul er en tastefejl. */
    f.antal = "Antallet skal være større end nul.";
  }
  if (!Number.isFinite(post.ms) || post.ms <= 0) f.ms = "Bevægelsen mangler et tidspunkt.";
  if (!tekst(post.uid, 128)) f.uid = "Bevægelsen mangler hvem der gjorde det.";
  if (post.note !== undefined && post.note !== null && String(post.note).length > 250) {
    f.note = "Noten er for lang (højst 250 tegn).";
  }
  if (vare === null) f.forbrugsvareId = "Varen findes ikke.";

  /* ⚠ SVIND KRÆVER EN GRUND. Et tal der forsvinder uden forklaring, bliver
     ikke undersøgt — og svind er netop dét man skal undersøge. Forbrug
     kræver ingen: det er hvad varen er til. */
  if (post.art === "svind" && !tekst(post.note, 250)) {
    f.note = "Skriv hvad der skete. Svind uden en grund bliver ikke undersøgt.";
  }

  return { ok: Object.keys(f).length === 0, fejl: f };
}

/**
 * nyBeholdning(vare, bevaegelse) → tallet efter bevægelsen.
 *
 * ⚠ REGNET ÉT STED, AF BEGGE SIDER. Skærmen viser hvad der vil ske; funktionen
 * skriver det. To regnestykker ville kunne blive uenige om en optælling.
 *
 * ⚠ OG EN OPTÆLLING SÆTTER, DEN LÆGGER IKKE TIL. Det er hele forskellen på
 * arten: `antal` er det TALTE, ikke en ændring.
 */
export function nyBeholdning(vare, bevaegelse) {
  const foer = Number.isFinite(vare?.beholdning) ? vare.beholdning : 0;
  if (bevaegelse?.art === "optaelling") return bevaegelse.antal;
  const retning = BEVAEGELSESART[bevaegelse?.art]?.retning ?? 0;
  return foer + retning * (bevaegelse?.antal || 0);
}

/**
 * ⚠ EN NEGATIV BEHOLDNING SPÆRRES IKKE — DEN VISES.
 *
 * Fristelsen er at afvise et forbrug der bringer tallet under nul. Men det
 * SKETE jo: nogen tog de sidste fem handsker, og tallet var forkert i forvejen.
 * Afviste vi bevægelsen, ville den rigtige hændelse gå tabt for at beskytte et
 * tal der allerede var galt — og den der står med en tom kasse, får at vide at
 * han tager fejl.
 *
 * Det rigtige svar er en OPTÆLLING. Indtil da er den negative beholdning
 * beviset på at der mangler en bevægelse — samme holdning som
 * `enhedsafvigelse()` i Warehouse (beslutning 39): en uenighed er en manglende
 * bevægelse, ikke et tal der skal rettes i stilhed.
 */
export function negativeBeholdninger(varer = []) {
  return varer.filter((v) => Number.isFinite(v.beholdning) && v.beholdning < 0);
}

/** Varer hvor beholdningen er på eller under minimum. */
export function laveVarer(varer = []) {
  return varer.filter((v) => (
    Number.isFinite(v.minimumBeholdning)
    && Number.isFinite(v.beholdning)
    && v.beholdning <= v.minimumBeholdning
  ));
}

/**
 * ⚠ DEM UDEN GRÆNSE TÆLLES FOR SIG. Uden det her tal betyder "0 varer under
 * minimum" både "alt er fyldt op" og "ingen har sat en grænse".
 */
export function udenGraense(varer = []) {
  return varer.filter((v) => !Number.isFinite(v.minimumBeholdning));
}

/**
 * behovFraVare(vare) → felterne et indkøbsbehov skal bære.
 *
 * BYGGER, SKRIVER IKKE — samme mønster som `behovTilLinje()`.
 *
 * ⚠ INTET ANTAL. Vi ved at varen er lav; vi ved ikke hvor meget der skal
 * købes. Antallet er valgfrit på et behov netop af den grund (beslutning 80),
 * og et gæt — "op til minimum", "en pakke" — ville gå med i en bestilling.
 * Den der bestiller, sætter det.
 */
export function behovFraVare(vare) {
  if (!vare?.navn) throw new Error("behovFraVare: varen har intet navn.");
  return {
    vare: vare.navn,
    kilde: "lager",
    enhed: vare.enhed || "stk",
    ...(vare.varenummer ? { varenummer: vare.varenummer } : {}),
    note: Number.isFinite(vare.beholdning)
      ? `Beholdningen er ${vare.beholdning} ${vare.enhed || "stk"}.`
      : "Beholdningen er ikke opgjort.",
  };
}

/**
 * beholdningAfBevaegelser(bevaegelser) → tallet regnet forfra.
 *
 * ⚠ DET GEMTE TAL ER SANDHEDEN I DRIFTEN, OG DET HER ER PRØVEN PÅ DEN.
 *
 * Beholdningen skrives sammen med bevægelsen i én `update()` (beslutning 39),
 * fordi en skærm ikke kan summere hele historikken for hver vare hver gang.
 * Men et gemt afledt tal driver — det er `bemanding.ledig` (beslutning 71) —
 * og derfor regnes det HER forfra, og forskellen vises på skærmen.
 *
 * ⚠ EN DRIFT DER IKKE KAN SES, BLIVER IKKE RETTET. Samme sætning som
 * `enhedsafvigelse()` bærer.
 */
export function beholdningAfBevaegelser(bevaegelser = []) {
  const sorteret = [...bevaegelser].sort((a, b) => (a.ms || 0) - (b.ms || 0));
  let tal = 0;
  for (const b of sorteret) {
    if (b.art === "optaelling") tal = b.antal;
    else tal += (BEVAEGELSESART[b.art]?.retning ?? 0) * (b.antal || 0);
  }
  return tal;
}

/**
 * beholdningsafvigelse(varer, bevaegelser) → [{ vare, gemt, regnet, forskel }]
 *
 * Kun dem der ER uenige. En tom liste er svaret "de stemmer".
 */
export function beholdningsafvigelse(varer = [], bevaegelser = []) {
  const pr = new Map();
  for (const b of bevaegelser) {
    if (!pr.has(b.forbrugsvareId)) pr.set(b.forbrugsvareId, []);
    pr.get(b.forbrugsvareId).push(b);
  }
  const ud = [];
  for (const v of varer) {
    const regnet = beholdningAfBevaegelser(pr.get(v.id) || []);
    const gemt = Number.isFinite(v.beholdning) ? v.beholdning : 0;
    if (regnet !== gemt) ud.push({ vare: v, gemt, regnet, forskel: gemt - regnet });
  }
  return ud;
}

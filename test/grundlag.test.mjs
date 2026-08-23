/* test/grundlag.test.mjs
 * Fakturagrundlaget. Beslutning 25.
 *
 * De to prøver der betyder mest, står nederst: at en erstatning ikke bliver en
 * fordobling, og at en manglende momssats blokerer eksporten frem for at blive
 * gættet. Begge er fejl der ville koste penge frem for at se grimme ud.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LINJE_ART, GRUNDLAG_TILSTAND, ANTAL_SKALA,
  antalFraTal, talFraAntal,
  linjeBeloebOere, linjeMomsOere, totaler,
  validerLinje, linjerUdenMoms, MOMSSATS_SALG,
  byggGrundlag, kanGodkende, godkend,
  kanEksportere, eksporter, EKSPORT_FORMAT_VERSION, laas, kanLaase,
  erstat, erGaeldende, summer, fraDb,
} from "../src/fleet/grundlag.js";

const NU = Date.UTC(2026, 7, 9, 10, 0, 0);
const BRUGER = "uid-jorn";

const linje = (o = {}) => ({
  id: o.id ?? "l1",
  art: o.art ?? "manuel",
  tekst: o.tekst ?? "En linje",
  antal: o.antal ?? ANTAL_SKALA,
  satsOere: o.satsOere ?? 100_00,
  momssats: o.momssats === undefined ? 25 : o.momssats,
  ...(o.kilde ? { kilde: o.kilde } : {}),
});

const grundlag = (o = {}) => ({
  id: o.id ?? "g1",
  ...byggGrundlag({
    bookingId: o.bookingId ?? "f1",
    kundeId: o.kundeId ?? "k1",
    linjer: o.linjer ?? [linje()],
    udarbejdetAf: BRUGER,
  }, NU),
  ...o.overskriv,
});

/* ---- Beløb ------------------------------------------------------------ */

test("antal er tusinddele — 1,5 bliver 1500 og tilbage igen", () => {
  assert.equal(antalFraTal(1.5), 1500);
  assert.equal(talFraAntal(1500), 1.5);
  /* Den klassiske float-fælde. 0,1 + 0,2 er ikke 0,3 — men 100 + 200 er 300. */
  assert.equal(antalFraTal(0.1) + antalFraTal(0.2), antalFraTal(0.3));
});

test("linjebeløb afrundes pr. linje, så summen af det viste stemmer", () => {
  /* En halv enhed à 3,33 kr. giver 1,665 kr. — et halvt øre, som SKAL rundes
     et sted. Vi runder pr. linje: 1,67 kr., og tre af dem er 5,01 kr.
     Rundede vi først på totalen, ville det være 3 × 1,665 = 4,995 → 5,00 kr.,
     og så stod der 5,00 på skærmen over tre linjer der lægger sammen til 5,01.
     Kunden lægger linjerne sammen i hånden — det er præcis hvad man gør, når
     man er uenig. Prøven er valgt så de to metoder ER uenige; går regnestykket
     op, beviser den ingenting. */
  const l = linje({ antal: 500, satsOere: 333 });
  assert.equal(linjeBeloebOere(l), 167);
  const t = totaler({ linjer: [l, l, l] });
  assert.equal(t.beloebOere, 501);
  assert.notEqual(t.beloebOere, Math.round((3 * 500 * 333) / 1000));
});

test("momsen er null når satsen mangler — ikke 0 og ikke 25", () => {
  const uden = linje({ momssats: null });
  assert.equal(linjeMomsOere(uden), null);
  const t = totaler({ linjer: [linje(), uden] });
  assert.equal(t.momsOere, null, "ét hul gør hele momssummen ukendt");
  assert.equal(t.ialtOere, null, "og dermed også totalen inkl. moms");
  /* Beløbet ekskl. moms er stadig kendt — det er det vi regner i. */
  assert.equal(t.beloebOere, 200_00);
});

/* ---- Validering -------------------------------------------------------- */

test("en kørselslinje skal pege på en etape", () => {
  assert.ok(LINJE_ART.koersel.kraeverKilde);
  const fejl = validerLinje(linje({ art: "koersel" }));
  assert.ok(fejl.some((f) => /etape/.test(f)));
  const ok = validerLinje(linje({ art: "koersel", kilde: { type: "etape", id: "e1" } }));
  assert.deepEqual(ok, []);
});

test("en manuel linje må stå uden kilde — men ikke uden tekst", () => {
  assert.deepEqual(validerLinje(linje()), []);
  assert.ok(validerLinje(linje({ tekst: "  " })).some((f) => /tekst/.test(f)));
});

test("satsen skal være hele ører, aldrig kroner som float", () => {
  assert.ok(validerLinje(linje({ satsOere: 100.5 })).some((f) => /ører/.test(f)));
});

/* ---- Godkendelse ------------------------------------------------------- */

test("åbne etaper på forløbet blokerer godkendelsen", () => {
  const g = grundlag();
  const etaper = [
    { id: "e1", bookingId: "f1", tilstand: "planlagt" },
    { id: "e2", bookingId: "f1", tilstand: "aaben" },
  ];
  const tjek = kanGodkende(g, { etaper, bruger: BRUGER });
  assert.equal(tjek.ok, false);
  assert.ok(tjek.aarsager.some((a) => /åben etape/.test(a)));
  assert.throws(() => godkend(g, { bruger: BRUGER, etaper }), /åben etape/);
});

test("en åben etape på et ANDET forløb blokerer ikke", () => {
  const g = grundlag();
  const tjek = kanGodkende(g, { etaper: [{ id: "e9", bookingId: "f2", tilstand: "aaben" }], bruger: BRUGER });
  assert.equal(tjek.ok, true, tjek.aarsager.join(" / "));
});

test("en ANNULLERET etape blokerer ikke — den skal ikke køres", () => {
  /* Den her består kun fordi tjekket spørger forloebstilstand() frem for at
     filtrere selv. Et hjemmestrikket `tilstand === "aaben"` ville også give
     grønt her, men det ville tabe alt det andet forloebstilstand() ved — og
     den dag reglen for hvad en åben etape er ændrer sig, ville de to svar
     drive fra hinanden uden at nogen opdagede det. */
  const g = grundlag();
  const etaper = [
    { id: "e1", bookingId: "f1", tilstand: "udfoert" },
    { id: "e2", bookingId: "f1", tilstand: "annulleret" },
  ];
  assert.equal(kanGodkende(g, { etaper, bruger: BRUGER }).ok, true);
});

test("alle årsager kommer med på én gang, ikke kun den første", () => {
  const g = grundlag({ linjer: [] });
  const tjek = kanGodkende(g, { etaper: [{ bookingId: "f1", tilstand: "aaben" }], bruger: BRUGER });
  assert.ok(tjek.aarsager.length >= 2,
    "en skærm der kun viser den første, sender disponenten frem og tilbage");
});

test("godkendelse sætter godkendtAf — det danske feltnavn, og et uid", () => {
  const g = grundlag();
  const p = godkend(g, { bruger: BRUGER, etaper: [] }, NU);
  assert.equal(p.tilstand, "godkendt");
  assert.equal(p.godkendtAf, BRUGER);
  assert.equal(p.godkendtMs, NU);
  assert.ok(!("approvedBy" in p), "feltnavnene er danske");
  assert.equal(p.historik.at(-1).hvad, "godkendt");
});

/* ---- Eksport ----------------------------------------------------------- */

/**
 * ⚠ PRØVEN HED "MOMSSATSEN GÆTTES IKKE", OG SPØRGSMÅLET ER BESVARET.
 *
 * Den holdt et mellemstadie på plads: satsen stod tom, eksporten var spærret
 * for alle, og det var det rigtige svar så længe ingen bogholder havde sagt
 * noget. Svaret kom med beslutning 98 — **25 %, uden undtagelser** — og så er
 * det ikke længere satsen der skal prøves, men at den bliver SAT.
 *
 * Havde jeg rettet prøven til at acceptere begge dele, ville den ikke måle
 * noget. Den måler nu det der faktisk holder.
 */
test("⚠ byggGrundlag SÆTTER MOMSSATSEN — den kan ikke længere mangle", () => {
  const g = grundlag({ linjer: [linje({ momssats: null })] });
  assert.equal(g.linjer[0].momssats, MOMSSATS_SALG);
  assert.equal(linjerUdenMoms(g).length, 0);
  assert.equal(kanEksportere({ ...g, tilstand: "godkendt" }).ok, true);
});

test("⚠ EN SATS DER ALLEREDE STÅR, RØRES IKKE — heller ikke 0", () => {
  /* `Number.isFinite(0)` er sandt, og en nul-sats er et SVAR, ikke et
     manglende felt. Uden det led ville en fremtidig momsfritagelse blive
     overskrevet af standarden hver gang grundlaget blev bygget om. */
  const g = grundlag({ linjer: [linje({ momssats: 0 })] });
  assert.equal(g.linjer[0].momssats, 0);
});

test("⚠ MEN VÆRNET STÅR: en linje uden sats eksporteres ikke", () => {
  /* Et grundlag fra FØR beslutning 98 kan have en tom linje — der lå én i
     basen — og en fremtidig vej ind kan springe byggGrundlag() over. En
     eksport er en kanal UD af systemet, og en fil med et hul i kan ikke
     kaldes tilbage fra bogholderens indbakke. Derfor bygges posten her
     DIREKTE, uden om byggGrundlag(). */
  const g = {
    ...grundlag(), tilstand: "godkendt",
    linjer: [{ ...linje(), momssats: null }],
  };
  const tjek = kanEksportere(g);
  assert.equal(tjek.ok, false);
  assert.ok(tjek.aarsager.some((a) => /momssats/.test(a)));
  assert.equal(linjerUdenMoms(g).length, 1);
  assert.throws(() => eksporter(g), /momssats/);
});

test("en kladde kan ikke eksporteres", () => {
  assert.equal(kanEksportere(grundlag()).ok, false);
  assert.equal(GRUNDLAG_TILSTAND.kladde.eksporterbar, false);
});

test("eksporten bærer formatVersion og beløb i ører", () => {
  const g = { ...grundlag(), tilstand: "godkendt", nummer: "GRL-2026-00042" };
  const ud = eksporter(g);
  assert.equal(ud.formatVersion, EKSPORT_FORMAT_VERSION);
  assert.equal(ud.nummer, "GRL-2026-00042");
  assert.equal(ud.beloebOere, 100_00);
  assert.equal(ud.momsOere, 25_00);
  assert.equal(ud.ialtOere, 125_00);
  assert.equal(ud.linjer[0].beloebOere, 100_00);
  assert.equal(ud.linjer[0].momsOere, 25_00);
});

test("låsning kræver en godkendelse først, og bevarer referencen ud", () => {
  assert.throws(() => laas(grundlag(), { bruger: BRUGER }), /godkendt/);
  const g = { ...grundlag(), tilstand: "godkendt" };
  const p = laas(g, { bruger: BRUGER, reference: "bilag-7781" }, NU);
  assert.equal(p.tilstand, "laast");
  assert.equal(p.eksportReference, "bilag-7781");
});

/* ---- Erstatning — EN RETTELSE MÅ IKKE VÆRE EN FORDOBLING ---------------- */

test("erstatningen sætter referencen BEGGE veje i ét kald", () => {
  const gammelt = { ...grundlag(), id: "g1", tilstand: "laast" };
  const { nyt, opdateringTilGammelt } = erstat(gammelt, {
    nytId: "g2", bruger: BRUGER, begrundelse: "Ventetiden var talt forkert.",
  }, NU);

  assert.equal(nyt.erstatterId, "g1", "peger bagud: hvad rettede denne?");
  assert.equal(opdateringTilGammelt.erstattetAfId, "g2", "peger frem: gælder denne stadig?");
  /* Ingen af de to må mangle. Med kun den bagudrettede kan man ikke se på et
     gammelt grundlag om det stadig tæller uden at søge hele mængden igennem. */
});

test("nytId kræves — ellers kunne kalderen glemme den halve reference", () => {
  const gammelt = { ...grundlag(), id: "g1", tilstand: "laast" };
  assert.throws(
    () => erstat(gammelt, { bruger: BRUGER, begrundelse: "x" }),
    /nytId/,
    "en regel der kun holder hvis kalderen husker den, er ikke en regel"
  );
});

test("det erstattede grundlag forbliver LÅST — erstattet er ikke en tilstand", () => {
  const gammelt = { ...grundlag(), id: "g1", tilstand: "laast" };
  const { opdateringTilGammelt } = erstat(gammelt, { nytId: "g2", bruger: BRUGER, begrundelse: "x" }, NU);
  assert.ok(!("tilstand" in opdateringTilGammelt),
    "det ER blevet eksporteret, og det kan ikke gøres usket");
});

test("summen tæller kun gældende grundlag — fordoblingen fanges her", () => {
  const gammelt = { ...grundlag(), id: "g1", tilstand: "laast", erstattetAfId: "g2" };
  const nyt = { ...grundlag({ linjer: [linje({ satsOere: 90_00 })] }), id: "g2", tilstand: "laast" };

  assert.equal(erGaeldende(gammelt), false);
  assert.equal(erGaeldende(nyt), true);

  const s = summer([gammelt, nyt]);
  assert.equal(s.antal, 1, "to poster for samme arbejde — én tæller");
  assert.equal(s.beloebOere, 90_00, "det korrigerede beløb, ikke summen af begge");
});

test("et allerede erstattet grundlag kan ikke erstattes igen", () => {
  const g = { ...grundlag(), id: "g1", erstattetAfId: "g2" };
  assert.throws(() => erstat(g, { nytId: "g3", bruger: BRUGER, begrundelse: "x" }), /allerede erstattet/);
  /* Og det kan heller ikke godkendes eller eksporteres. */
  assert.ok(kanGodkende(g, { bruger: BRUGER }).aarsager.some((a) => /erstattet/.test(a)));
});

test("en erstatning kræver en begrundelse", () => {
  const g = { ...grundlag(), id: "g1", tilstand: "laast" };
  assert.throws(() => erstat(g, { nytId: "g2", bruger: BRUGER, begrundelse: "  " }), /begrundelse/);
  /* Og begrundelsen bliver i historikken — ikke i auditposten, som er en
     allowliste. Samme regel som byggOverride() i personale.js. */
  const { nyt } = erstat(g, { nytId: "g2", bruger: BRUGER, begrundelse: "Talt forkert." }, NU);
  assert.equal(nyt.historik[0].begrundelse, "Talt forkert.");
});

test("summen er ukendt hvis bare ét gældende grundlag mangler moms", () => {
  /* ⚠ LINJEN BYGGES DIREKTE, ikke gennem byggGrundlag() — den sætter satsen
     nu (beslutning 98), og så ville prøven ikke kunne stille spørgsmålet.
     Reglen den måler, er stadig rigtig: et halvt momsbeløb er værre end
     intet, fordi det ser ud som om det er regnet ud. */
  const a = { ...grundlag(), id: "g1" };
  const b = { ...grundlag(), id: "g2", linjer: [{ ...linje(), momssats: null }] };
  assert.equal(summer([a, b]).momsOere, null);
});

/* ══════════════════════════════════════════════════════════════════════════
   RTDB HAR INGEN ARRAYS

   Fejlen kostede en hvid skærm: det første rigtige grundlag blev oprettet, og
   Fakturering kastede "object is not iterable" inde i kanGodkende() — et sted
   der intet har med godkendelsen at gøre. Serveren havde allerede
   oversættelsen, som en AFSKRIFT inde i hentGrundlag(). Klienten havde den
   ikke. Den samme kendsgerning to steder, hvor det ene sted ikke fandtes endnu.
   ══════════════════════════════════════════════════════════════════════════ */

test("fraDb oversætter linjer og historik fra objekt til array", () => {
  const raa = {
    tilstand: "kladde", kundeId: "k1",
    linjer: { l1: { id: "l1", art: "lager", antal: 1000, satsOere: 4500 } },
    historik: { h1: { hvad: "oprettet", ms: NU } },
  };
  const g = fraDb(raa, "grl-1");
  assert.equal(g.id, "grl-1");
  assert.ok(Array.isArray(g.linjer));
  assert.ok(Array.isArray(g.historik));
  assert.equal(g.linjer.length, 1);
});

test("fraDb rører ikke et grundlag der allerede har arrays", () => {
  /* Demo-sættet og byggGrundlag() leverer arrays. Blev de pakket om, ville
     rækkefølgen kunne skifte — og en fakturalinjes rækkefølge er det man
     læser oppefra og ned. */
  const g = { ...grundlag(), id: "g1" };
  const ud = fraDb(g);
  assert.deepEqual(ud.linjer, g.linjer);
  assert.deepEqual(ud.historik, g.historik);
});

test("⚠ kanGodkende KASTER på et uoversat grundlag — derfor findes fraDb", () => {
  /* Prøven her holder fast i HVORFOR: domænet itererer, og et RTDB-objekt kan
     ikke itereres. Fjernes fraDb, er det den her linje der falder — ikke en
     bruger der ser en hvid side. */
  const raat = { ...grundlag(), linjer: { l1: { id: "l1", art: "koersel", antal: 1000, satsOere: 100 } } };
  assert.throws(() => kanGodkende(raat, { bruger: BRUGER }), /iterable/);
  assert.ok(kanGodkende(fraDb(raat), { bruger: BRUGER }).ok !== undefined);
});

test("fraDb på null giver null — en manglende post er ikke et tomt grundlag", () => {
  assert.equal(fraDb(null), null);
});

/* ══════════════════════════════════════════════════════════════════════════
   AT KUNNE EKSPORTERES OG AT KUNNE LÅSES ER TO SPØRGSMÅL

   De var det samme, indtil et klik på et LÅST grundlag fandt forskellen:
   skærmen tilbød at låse det igen, kaldet nåede frem til laas(), og den
   kastede en rå Error — som kom ud af Cloud Functionen som "INTERNAL". En
   forudsætning der kun håndhæves af en exception, er ikke et svar man kan
   vise nogen.
   ══════════════════════════════════════════════════════════════════════════ */

test("et LÅST grundlag må eksporteres igen — men ikke låses igen", () => {
  const g = { ...grundlag(), tilstand: "laast", eksportReference: "bilag 4471" };
  /* Filen kan være gået tabt i den anden ende. Eksporten er en kopi. */
  assert.equal(kanEksportere(g).ok, true);
  /* Låsningen ville overskrive eksportReference og laastMs — og så ville den
     første eksport forsvinde uden spor. */
  const l = kanLaase(g);
  assert.equal(l.ok, false);
  assert.match(l.aarsager[0], /allerede låst/);
});

test("kanLaase bærer eksportens egne årsager med", () => {
  /* Den er kanEksportere PLUS ét led — ikke et selvstændigt regelsæt. To
     regelsæt ville kunne blive uenige om den samme momssats. */
  /* ⚠ LINJEN BYGGES DIREKTE. `byggGrundlag()` sætter satsen siden beslutning
     98, så en tom linje kan kun laves udenom — og det er netop den situation
     værnet er til for. */
  const udenMoms = {
    ...grundlag(), tilstand: "godkendt",
    linjer: [{ ...linje(), momssats: null }],
  };
  assert.equal(kanLaase(udenMoms).ok, false);
  assert.ok(kanLaase(udenMoms).aarsager.some((a) => /momssats/.test(a)));
});

test("et godkendt grundlag med moms kan både eksporteres og låses", () => {
  const g = { ...grundlag(), tilstand: "godkendt" };
  assert.equal(kanEksportere(g).ok, true);
  assert.equal(kanLaase(g).ok, true);
});

test("en KLADDE kan ingen af delene", () => {
  const g = { ...grundlag(), tilstand: "kladde" };
  assert.equal(kanEksportere(g).ok, false);
  assert.equal(kanLaase(g).ok, false);
});

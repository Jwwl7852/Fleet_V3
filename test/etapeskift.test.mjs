/* test/etapeskift.test.mjs
 * Disponeringen: de fem tjek, samlet ét sted — og håndhævet ét sted.
 *
 * Prøven der betyder mest, står nederst: at `etapeskift` faktisk KALDER
 * `tjekDisponering()` og afviser på den. De fem tjek har været bygget og
 * testet i månedsvis uden at noget kaldte dem; derefter VISTE Disponering dem.
 * At vise en spærring er ikke at håndhæve den.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  tjekDisponering, blokerer, spaerringer, forRessource, TONE
} from "../src/fleet/disponering.js";
import { reservationerFraEtape  } from "../src/fleet/etaper.js";
import { PRIORITET, RESSOURCE, KILDE } from "../src/fleet/reservations.js";
import { DELTE_FILER } from "../scripts/kopier-delt.mjs";
import { DEMO_ETAPER } from "../src/fleet/demo-etaper.js";
import { forloebstilstand, TILSTAND } from "../src/fleet/booking-state.js";

const T = 3600000;
const A = Date.UTC(2026, 7, 20, 6, 0, 0);

const TRAEKKER = {
  id: "kt-1", registrering: "AA 11 111", art: "traekker", status: "aktiv",
  kapacitet: { m3: 0, kg: 9000 }
};
const TRAILER = {
  id: "tr-1", registrering: "BB 22 222", art: "trailer", status: "aktiv",
  kapacitet: { m3: 90, kg: 24000 }
};
const PERSON = { id: "p-1", navn: "Lars Aage" };

/* Kompetencer der dækker alt en trækker+trailer kræver. */
const ALLE_KOMP = ["c", "ce", "tachografkort", "eubevis"].map((type) => ({
  id: `k-${type}`, personId: "p-1", type, udloeberMs: A + 400 * 24 * T
}));

const etape = (o = {}) => ({
  id: "et-1", bookingId: "bk-1", division: "gods",
  fra: A, til: A + 8 * T,
  koeretoejIder: { "kt-1": true, "tr-1": true },
  personId: "p-1",
  maengde: { m3: 60, kg: 14000 },
  ...o
});

const kald = (o = {}) => {
  const e = etape(o.etape);
  return tjekDisponering({
    reservationerForEtapen: reservationerFraEtape(e),
    enheder: o.enheder ?? [TRAEKKER, TRAILER],
    person: o.person ?? PERSON,
    kompetencer: o.kompetencer ?? ALLE_KOMP,
    reservationer: o.reservationer ?? {},
    straekninger: o.straekninger ?? [],
    gods: o.gods ?? e.maengde,
    advarendeKrav: o.advarendeKrav ?? []
  });
};

/* ---- Den rene sag ------------------------------------------------------ */

test("en lovlig disponering giver ingen bemærkninger", () => {
  const r = kald();
  assert.deepEqual(r, [], `uventede bemaerkninger: ${JSON.stringify(r)}`);
  assert.equal(blokerer(r), false);
});

/* ---- 1. Enhedskombination ---------------------------------------------- */

test("⚠ EN TRAILER KAN IKKE DISPONERES ALENE", () => {
  /* Reglen har været bygget og testet siden flaade.js blev skrevet, men
     modellen kunne ikke udtrykke en sættevogn — etapen bar ét koeretoejId.
     Først med `koeretoejIder` kan den overhovedet udløses. */
  const r = kald({ enheder: [TRAILER], etape: { koeretoejIder: { "tr-1": true } } });
  assert.ok(blokerer(r));
  assert.match(spaerringer(r)[0].tekst, /kan ikke disponeres uden en trækkende enhed/);
});

test("en enhed på værksted spærrer", () => {
  const r = kald({ enheder: [{ ...TRAEKKER, status: "vaerksted" }, TRAILER] });
  assert.ok(blokerer(r));
  assert.equal(spaerringer(r)[0].tjek, "Enhedskombination");
});

test("ingen enheder er også en spærring", () => {
  const r = kald({ enheder: [] });
  assert.ok(blokerer(r));
});

/* ---- 2. Kompetencer ---------------------------------------------------- */

test("⚠ EN UDLØBET KOMPETENCE BLOKERER — den advarer ikke", () => {
  /* En advarsel man kan klikke videre fra, er ikke en kontrol. En chauffør
     uden gyldigt C/E må ikke køre sættevogn, uanset hvor travlt disponenten
     har. */
  const udloebet = ALLE_KOMP.map((k) =>
    (k.type === "ce" ? { ...k, udloeberMs: A - 24 * T } : k));
  const r = kald({ kompetencer: udloebet });
  const s = spaerringer(r);
  assert.ok(s.length, "en udloebet C/E slap igennem");
  assert.match(s[0].tekst, /udløbet/);
  assert.match(s[0].tekst, /BLOKERER/);
});

test("⚠ MANGLER OG UDLØBNE HOLDES ADSKILT", () => {
  /* "Han har aldrig haft C/E" og "hans C/E udløb i går" kræver hver sin
     handling — et andet køretøj mod en fornyelse. En samlet liste ville
     skjule forskellen. */
  const uden = ALLE_KOMP.filter((k) => k.type !== "ce");
  const r = kald({ kompetencer: uden });
  assert.match(spaerringer(r)[0].tekst, /har aldrig haft/);
});

test("en ADVARENDE kompetence spærrer ikke", () => {
  /* Krav der ikke kan udledes af enheden og godset — virksomhedens egne, en
     kundes — advarer med en begrundet override. Læses de som spærringer,
     holder disponenten op med at læse dem. */
  const r = kald({ advarendeKrav: ["foerstehjaelp"] });
  assert.equal(blokerer(r), false, "en advarsel blev til en spaerring");
  assert.ok(r.some((x) => x.tone === TONE.warn));
});

/* ---- 3. Kapacitet ------------------------------------------------------ */

test("⚠ m³ OG kg TJEKKES HVER FOR SIG", () => {
  /* En palle kan være let og fylde meget, eller tung og fylde lidt. */
  const forTungt = kald({ gods: { m3: 10, kg: 40000 } });
  assert.ok(blokerer(forTungt));
  assert.match(spaerringer(forTungt)[0].tekst, /kg/);

  const forStort = kald({ gods: { m3: 200, kg: 1000 } });
  assert.ok(blokerer(forStort));
  assert.match(spaerringer(forStort)[0].tekst, /m³/);
});

test("⚠ KAPACITETEN LÆGGES SAMMEN PÅ TVÆRS AF ENHEDERNE", () => {
  /* Trækkeren har ingen ladkapacitet at tale om; traileren har 90 m³. Talte
     vi kun trækkeren, ville hver eneste sættevognstur se ubærlig ud. */
  const kunTraekker = kald({
    enheder: [TRAEKKER], etape: { koeretoejIder: { "kt-1": true } },
    gods: { m3: 60, kg: 14000 }
  });
  assert.ok(blokerer(kunTraekker), "traekkeren alene kan baere 60 m3");
  assert.equal(blokerer(kald()), false, "med traileren kan den");
});

/* ---- 4. Reservationskonflikt ------------------------------------------- */

const eksisterende = (kildeType, o = {}) => ({
  id: "r-x", fra: A + T, til: A + 3 * T,
  kilde: { type: kildeType, id: "andet", reference: null }, ...o
});

test("⚠ ET VÆRKSTEDSBESØG SLÅR EN BOOKING", () => {
  /* Prioritet 40 mod 10. En bil på værksted kan ikke køre, uanset hvad
     disponenten har lovet kunden — og bookingen kan derfor ikke overskrive. */
  assert.ok(PRIORITET.vaerksted > PRIORITET.booking);
  const r = kald({
    reservationer: { [RESSOURCE.koeretoej]: { "kt-1": [eksisterende(KILDE.vaerksted)] } }
  });
  assert.ok(blokerer(r));
  assert.equal(spaerringer(r)[0].tjek, "Reservation");
});

test("en konflikt med LAVERE prioritet er en advarsel", () => {
  /* Den nye kilde ville overskrive. Det er ikke en spærring — men det skal
     stå på skærmen, for noget bliver skubbet. */
  const r = kald({
    reservationer: { [RESSOURCE.koeretoej]: { "kt-1": [eksisterende(KILDE.manuel)] } }
  });
  assert.equal(blokerer(r), false);
  assert.ok(r.some((x) => x.tjek === "Reservation" && x.tone === TONE.warn));
});

test("⚠ ETAPENS EGEN RESERVATION ER IKKE EN KONFLIKT MED SIG SELV", () => {
  /* Skiftes en allerede reserveret etape, ligger dens egne poster der i
     forvejen. Talte de med, kunne ingen etape nogensinde gendisponeres. */
  const e = etape();
  const egne = reservationerFraEtape(e).map((r, i) => ({ id: `res-et-1-${i}`, ...r }));
  const r = kald({
    reservationer: { [RESSOURCE.koeretoej]: { "kt-1": egne, "tr-1": egne } }
  });
  assert.equal(blokerer(r), false, "etapen er i konflikt med sig selv");
});

test("⚠ BEGGE ENHEDER FÅR EN RESERVATION", () => {
  /* Bandt vi kun trækkeren, ville traileren se fri ud i hele turen — og en
     anden bil kunne få den. */
  const r = reservationerFraEtape(etape());
  assert.equal(r.length, 3);
  assert.deepEqual(
    r.filter((x) => x.ressourceType === RESSOURCE.koeretoej).map((x) => x.ressourceId).sort(),
    ["kt-1", "tr-1"]);
});

/* ---- 5. Køre-hviletid --------------------------------------------------- */

test("køre-hviletid spærrer på en for lang strækning", () => {
  const r = kald({ straekninger: [{ id: "et-1", fra: A, til: A + 11 * T }] });
  assert.ok(blokerer(r));
  assert.equal(spaerringer(r).find((x) => x.tjek === "Køre-hviletid") !== undefined, true);
});

/* ---- Opslaget ----------------------------------------------------------- */

test("forRessource slår op i NODENS form", () => {
  /* reservationer/<type>/<id>/<resId> — serveren læser den direkte. En flad
     liste ville være en anden form end den der ligger i basen, og så ville
     de to sider stille det samme spørgsmål på hver sin måde. */
  const n = { koeretoej: { "kt-1": [{ id: "a" }] } };
  assert.deepEqual(forRessource(n, "koeretoej", "kt-1"), [{ id: "a" }]);
  assert.deepEqual(forRessource(n, "koeretoej", "kt-9"), []);
  assert.deepEqual(forRessource(undefined, "koeretoej", "kt-1"), []);
});

/* ══════════════════════════════════════════════════════════════════════════
   HÅNDHÆVELSEN

   At funktionerne findes er ikke det samme som at de håndhæves.
   ══════════════════════════════════════════════════════════════════════════ */

const kilde = readFileSync("functions/index.js", "utf8");
/* ⚠ KUN etapeskift-FUNKTIONEN, IKKE RESTEN AF FILEN.
   Her stod `kilde.slice(indexOf("export const etapeskift"))` — altså ALT fra
   etapeskift og ned. Det holdt så længe den var den sidste callable i filen;
   den dag `opgaveplanlaeg` blev lagt ind under den, talte prøven "een
   rod.update()" på TO funktioner og faldt på noget der var rigtigt.

   En prøve der læser en fil som tekst, skal afgrænse det den læser. Ellers
   flytter dens betydning sig, hver gang nogen skriver noget nedenunder. */
const blok = (() => {
  const start = kilde.indexOf("export const etapeskift");
  const naeste = kilde.indexOf(String.fromCharCode(10) + "export const ", start + 1);
  return naeste < 0 ? kilde.slice(start) : kilde.slice(start, naeste);
})();

test("⚠ etapeskift KALDER tjekDisponering OG AFVISER PÅ DEN", () => {
  assert.ok(blok.includes("tjekDisponering({"), "de fem tjek koeres ikke");
  assert.ok(blok.includes('r.tone === "bad"'), "spaerringerne skilles ikke fra advarslerne");
  assert.ok(blok.includes('throw new HttpsError("failed-precondition"'),
    "der afvises ikke paa en spaerring");
});

/** Kommentarer ud: en note der NÆVNER et navn er ikke en brug. Den fælde er
    dukket op fire gange i denne omgang — se beslutning 50, 53 og 55. */
const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("⚠ SERVEREN AFVISER MED SKÆRMENS EGEN SÆTNING", () => {
  /* To formuleringer af den samme spærring ville være to forklaringer på én
     ting — og brugeren ville se den ene og få den anden.

     ⚠ SÆTNINGEN BYGGES NU I `spaerringerFor()`, ikke inde i `etapeskift`.
     Den blev flyttet dertil fordi `forslagskriv` kører NØJAGTIG de samme tjek
     når forslaget LAVES — og skal svare med den samme sætning. To kopier af
     opslagene ville være to steder at være uenige om hvad "alt de fem tjek
     skal bruge" betyder. Prøven læser derfor hele filen, ikke kun blokken. */
  assert.ok(/spaerringer\[0\]\.tekst/.test(kilde),
    "afvisningen bygger sin egen tekst i stedet for at bruge tjekkets");
  assert.ok(kilde.includes("async function spaerringerFor("),
    "de fem tjek ligger ikke ét sted");
  assert.ok(blok.includes("spaerringerFor("),
    "etapeskift kører ikke de fælles tjek");
});

/**
 * ⚠ OG FORSLAGSKRIVNINGEN KØRER DE SAMME.
 *
 * Ikke for at spærre for evigt — der går tid mellem forslag og godkendelse,
 * og det er ved godkendelsen afgørelsen falder. Men et forslag koordinatoren
 * ikke KAN godkende, er et løfte til en kunde der ikke kan holdes, og
 * disponenten skal have sit nej med det samme. Beslutning 58.
 */
test("⚠ forslagskriv KØRER DE SAMME FEM TJEK", () => {
  const start = kilde.indexOf("export const forslagskriv");
  assert.ok(start >= 0, "functions/index.js har ingen forslagskriv");
  const naeste = kilde.indexOf(String.fromCharCode(10) + "export const ", start + 1);
  /* ⚠ KOMMENTARERNE UD. Blokken FORKLARER at den kræver booking.foreslaa og
     IKKE booking.godkend — og en prøve der søgte råt, ville falde over netop
     den forklaring. Fjerde gang i denne omgang; se beslutning 50 og 53. */
  const fblok = udenKommentarer(
    naeste < 0 ? kilde.slice(start) : kilde.slice(start, naeste));

  assert.ok(fblok.includes("spaerringerFor("), "forslaget prøves ikke mod de fem tjek");
  assert.ok(fblok.includes("valideForslag("), "formen prøves ikke med skærmens funktion");
  /* ⚠ booking.foreslaa — IKKE booking.godkend. Beslutning 5. */
  assert.ok(fblok.includes('perms.includes("|booking.foreslaa|")'));
  assert.ok(!fblok.includes("booking.godkend"),
    "forslagskriv kræver godkendelsespermissionen");
  /* ⚠ ET FORSLAG SPÆRRER INGENTING. */
  assert.ok(!/opdatering\[.reservationer/.test(fblok),
    "et forslag skriver en reservation");
  /* ⚠ OG DET RØRER IKKE TILSTANDEN — det er etapeskifts arbejde. */
  assert.ok(!fblok.includes("tilTilstand"), "forslaget skifter etapens tilstand");
});

test("⚠ TILSTANDSSKIFTET GÅR GENNEM kanSkifteEtape — den SAMME som skærmen", () => {
  /* Den bærer beslutning 5: disponenten godkender ikke sit eget forslag. Og
     den er en PERMISSION, ikke en rolleliste. */
  assert.ok(blok.includes("kanSkifteEtape("));
  assert.ok(kilde.includes('from "./delt/booking-state.js"'));
  assert.ok(DELTE_FILER.includes("booking-state.js"));
});

test("⚠ ALT LANDER I ÉN rod.update()", () => {
  /* Etapen, dens ressourcer og reservationerne skal skrives sammen eller slet
     ikke. Prototypens DE-QR 777 mod DE-KL 404 var netop to poster der kunne
     blive uenige. */
  const tilUpdate = blok.slice(0, blok.indexOf("await rod.update(opdatering)"));
  assert.ok(tilUpdate.includes("opdatering[`etaper/${etapeId}/koeretoejIder`]"));
  assert.ok(tilUpdate.includes("opdatering[`reservationer/"));
  assert.equal((blok.match(/await rod\.update\(/g) || []).length, 1,
    "der skrives i mere end eet kald");
});

test("⚠ EN ETAPE DER FORLADER RESERVERET, FRIGIVER SINE RESSOURCER", () => {
  /* Blev reservationen stående, ville bilen se optaget ud resten af ugen — og
     den næste disponent ville lede efter en tur der ikke findes. */
  assert.ok(blok.includes('etape.tilstand === "reserveret" && tilTilstand !== "reserveret"'));
  assert.ok(/reservationer\/\$\{r\.ressourceType\}\/\$\{r\.ressourceId\}\/res-\$\{etapeId\}-\$\{i\}`\] = null/.test(blok),
    "reservationerne fjernes ikke");
});

test("⚠ RESERVATIONENS ID ER UDLEDT AF ETAPEN, ikke en push-nøgle", () => {
  /* Så kan den samme etape ikke lægge to reservationer på den samme ressource
     hvis funktionen kaldes to gange — og frigivelsen kan finde dem igen uden
     at søge. */
  assert.ok(blok.includes("`res-${etapeId}-${i}`"));
});

test("⚠ ABONNEMENT OG MODUL PRØVES — admin-SDK'et gaar uden om reglerne", () => {
  assert.ok(blok.includes("Abonnementet er ikke aktivt."));
  assert.ok(blok.includes("Booking-modulet er ikke aktivt."));
});

test("⚠ REGLEN FOR DELTE FILER ER TRANSITIV", () => {
  /* disponering.js importerer fem filer, og personale.js importerer selv
     format.js. Firebase deployer kun functions/-mappen: en import op gennem
     træet fejler i SKYEN, ved deploy — ikke ved test. */
  for (const fil of DELTE_FILER) {
    const src = readFileSync(`src/fleet/${fil}`, "utf8");
    for (const m of src.matchAll(/from\s+"\.\/([\w-]+\.js)"/g)) {
      assert.ok(DELTE_FILER.includes(m[1]),
        `${fil} importerer ${m[1]}, som ikke kopieres til functions/delt/`);
    }
  }
  for (const f of ["disponering.js", "flaade.js", "personale.js", "reservations.js",
    "koerehviletid.js", "format.js", "etaper.js"]) {
    assert.ok(DELTE_FILER.includes(f), `${f} mangler paa listen`);
  }
});

test("skærmen har ikke sin egen kopi af de fem tjek", () => {
  /* De stod som en lokal tjekAlt() indtil serveren skulle håndhæve dem. To
     kopier af en kontrol er værre end ingen: den ene driver, og ingen opdager
     hvilken. */
  const s = readFileSync("src/moduler/booking/Disponering.jsx", "utf8");
  assert.ok(s.includes("tjekDisponering("), "skaermen bruger ikke husets ene funktion");
  assert.ok(!/function tjekAlt/.test(s), "den lokale kopi staar der stadig");
  /* ⚠ KODEN, IKKE PROSAEN. Filens hoved NÆVNER de fem tjek ved navn — det er
     forklaringen, ikke et kald. En prøve der ikke kan skelne, tvinger den
     næste til at slette begrundelsen for at få grønt. */
  const kode = s.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/kanDisponeres\(|kanBaere\(|tjekLedigMod\(/.test(kode),
    "skaermen kalder de enkelte tjek udenom tjekDisponering()");
});

test("⚠ KOMPETENCEN SKAL GÆLDE NÅR TUREN KØRER, ikke når der klikkes", () => {
  /* En chauffør hvis ADR-bevis udløber på tirsdag, må ikke kunne disponeres
     på en tur på fredag: beviset ER gyldigt i det øjeblik disponenten
     trykker, og udløbet i det øjeblik det betyder noget.

     ⚠ TIDSPUNKTET ER ETAPENS SLUTNING. Et bevis der udløber midt i turen, er
     udløbet på hjemvejen — og en kontrol i Tyskland spørger ikke hvornår man
     kørte hjemmefra. */
  const udloeberMidtITuren = ALLE_KOMP.map((k) =>
    (k.type === "ce" ? { ...k, udloeberMs: A + 4 * T } : k));
  const r = tjekDisponering({
    reservationerForEtapen: reservationerFraEtape(etape()),
    enheder: [TRAEKKER, TRAILER], person: PERSON,
    kompetencer: udloeberMidtITuren, gods: { m3: 60, kg: 14000 }
  });
  assert.ok(blokerer(r), "et bevis der udloeber midt i turen slap igennem");
  assert.match(spaerringer(r)[0].tekst, /udløbet/);
});

test("paaMs kan sættes eksplicit — og ellers udledes af etapens slutning", () => {
  const komp = ALLE_KOMP.map((k) =>
    (k.type === "ce" ? { ...k, udloeberMs: A + 4 * T } : k));
  const args = {
    reservationerForEtapen: reservationerFraEtape(etape()),
    enheder: [TRAEKKER, TRAILER], person: PERSON,
    kompetencer: komp, gods: { m3: 60, kg: 14000 }
  };
  /* Spørger vi om turens START, er beviset stadig gyldigt. */
  assert.equal(blokerer(tjekDisponering({ ...args, paaMs: A })), false);
  /* Spørger vi om slutningen — som er standarden — er det ikke. */
  assert.equal(blokerer(tjekDisponering(args)), true);
});

/* ══════════════════════════════════════════════════════════════════════════
   KØRE-HVILETID PÅ EN PLANLAGT ETAPE

   Begge fund her kom af at HÅNDHÆVE tjekket mod rigtige data. Så længe det
   blev vist og ikke håndhævet, kunne ingen se at det spærrede alt.
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ ET VINDUE ER IKKE KØRETID — en langtur uden koerselMin spærres", () => {
  /* tjekKoerehviletid() regner hele strækningen som kørsel når koerselMin
     mangler. Det er rigtigt for en dagstur og forkert for en tur over to
     døgn, hvor chaufføren sover. Svaret er en spærring der siger hvad der
     MANGLER — ikke et regnestykke på en antagelse. */
  const langtur = { id: "et-lang", fra: A, til: A + 40 * T };
  const r = kald({ straekninger: [langtur] });
  const s = spaerringer(r);
  assert.ok(s.length, "en langtur uden planlagt koeretid slap igennem");
  assert.match(s[0].tekst, /planlagt køretid/);
  assert.match(s[0].tekst, /gættes ikke/);
});

test("en dagstur uden koerselMin vurderes stadig", () => {
  /* Under den daglige grænse er den strenge antagelse både rigtig nok og på
     den sikre side: en tur på seks timer ER stort set kørsel. */
  const dagstur = { id: "et-dag", fra: A, til: A + 6 * T };
  const r = kald({ straekninger: [dagstur] });
  assert.ok(!spaerringer(r).some((x) => /planlagt køretid/.test(x.tekst)),
    "en dagstur blev afvist for at mangle et felt den ikke behoever");
});

test("⚠ PAUSEREGLEN ADVARER — den kan ikke afgøres ud af en plan", () => {
  /* En etape siger hvor MEGET der køres, ikke hvor pauserne ligger. En tur
     med 8 timers kørsel er ikke 8 timer i træk. En spærring der udløses af
     hver eneste langtur, lærer disponenten at klikke videre. */
  const r = kald({ straekninger: [{ id: "et-x", fra: A, til: A + 12 * T, koerselMin: 480 }] });
  const pause = r.filter((x) => x.tjek === "Køre-hviletid" && /uden pause/.test(x.tekst));
  assert.equal(pause.length, 1, "pausereglen blev ikke vurderet");
  assert.equal(pause[0].tone, TONE.warn, "pausereglen spaerrer paa en plan");
  assert.match(pause[0].tekst, /kan ikke afgøres/);
});

test("⚠ MEN DAGENS SUM BLOKERER UÆNDRET", () => {
  /* 17 timers kørsel på ét døgn er ulovligt, uanset hvordan det deles op —
     og det er et tal etapen faktisk bærer. Det er den overtrædelse der
     betyder noget her. */
  const r = kald({ straekninger: [{ id: "et-y", fra: A, til: A + 20 * T, koerselMin: 17 * 60 }] });
  const dag = spaerringer(r).filter((x) => /timers kørsel på ét døgn/.test(x.tekst));
  assert.equal(dag.length, 1, "en 17-timers koeredag slap igennem");
});

test("demo-etaperne er lovlige — ellers viser dev noget serveren afviser", () => {
  /* et-004 stod med 1020 min. planlagt kørsel på ét døgn. Det er 17 timer, og
     serveren afviste demo-sættets eget forslag mod den udrullede base. */
  for (const e of DEMO_ETAPER) {
    if (!Number.isFinite(e.koerselMin)) continue;
    assert.ok(e.koerselMin <= 600,
      `${e.id}: ${e.koerselMin} min. koersel paa eet doegn — serveren ville afvise den`);
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   BOOKINGENS TILSTAND ER AFLEDT — OG SKRIVES SAMME STED

   `forloebstilstand()` siger det selv: feltet lagres denormaliseret på
   bookingen, men skrives af PRÆCIS ÉN ting — den funktion der skifter en
   etapetilstand, i samme transaktion. Der findes derfor ikke et
   `bookingskift`; der er den her blok i `etapeskift`.

   Hullet var der i én commit: etapeskift skrev etapen og lod bookingen stå.
   Det er `bemanding.ledig` i en tredje forklædning.
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ etapeskift SKRIVER BOOKINGENS AFLEDTE TILSTAND", () => {
  assert.ok(blok.includes("forloebstilstand(mine)"),
    "bookingens tilstand udledes ikke");
  assert.ok(blok.includes("opdatering[`bookinger/${etape.bookingId}/tilstand`]"),
    "bookingens tilstand skrives ikke");
  assert.ok(blok.includes("harAabneEtaper"),
    "harAabneEtaper skrives ikke — kanGodkende() paa et grundlag spoerger om den");
});

test("⚠ OG DEN SKRIVES I DEN SAMME opdatering", () => {
  /* Et andet kald ville kunne lykkes halvt, og så ville bookingen påstå noget
     andet end sine egne etaper. */
  const tilUpdate = blok.slice(0, blok.indexOf("await rod.update(opdatering)"));
  assert.ok(tilUpdate.includes("bookinger/${etape.bookingId}/tilstand"),
    "bookingen skrives efter den atomiske opdatering");
});

test("⚠ DEN NYE TILSTAND LÆGGES OVEN PÅ FØR DER REGNES", () => {
  /* Læste vi bare noden, ville vi regne på den GAMLE tilstand og skrive et
     forløb der var ét skridt bagud. */
  assert.ok(blok.includes("x.id === etapeId ? { ...x, tilstand: tilTilstand } : x"),
    "forloebstilstand regner paa den gamle etapetilstand");
});

test("⚠ DER FINDES IKKE ET bookingskift", () => {
  /* To veje til det samme felt ville være to sandheder. Kommer der en, skal
     spørgsmålet om hvem der ejer bookingens tilstand afgøres først. */
  assert.ok(!/export const bookingskift/.test(kilde),
    "der er kommet et bookingskift — hvem ejer bookingens tilstand nu?");
  const klient = readFileSync("src/fleet/disponer.js", "utf8");
  assert.ok(klient.includes("BOOKINGEN HAR INGEN EGEN FUNKTION"),
    "klienten siger ikke hvorfor der ikke er en bookingfunktion");
});

test("et forløb er først udført når hver eneste etape er det", () => {
  /* Reglen som forloebstilstand() bærer — prøvet her, så den ikke kan drive
     fra det etapeskift faktisk skriver. */
  assert.equal(forloebstilstand([
    { tilstand: "udfoert" }, { tilstand: "reserveret" },
  ]).tilstand, "delvist");
  assert.equal(forloebstilstand([
    { tilstand: "udfoert" }, { tilstand: "udfoert" },
  ]).tilstand, "udfoert");
  assert.equal(forloebstilstand([
    { tilstand: "reserveret" }, { tilstand: "aaben" },
  ]).harAabneEtaper, true);
});

test("reglerne kender de samme bookingtilstande som domænet", () => {
  /* Mønstret i regelfilen er en afskrift af TILSTAND. Kommer der en tilstand
     mere uden at reglen får den, afviser en fremtidig skrivning noget skærmen
     viser som gyldigt. */
  const regler = readFileSync("firebase.rules.json", "utf8");
  const blokR = regler.slice(regler.indexOf('"bookinger": {'), regler.indexOf('"etaper": {'));
  const linje = blokR.split(/\r?\n/).find((l) => l.includes('"tilstand": {'));
  const iReglen = linje?.match(/\(([a-zA-Z|]+)\)/)?.[1].split("|") || [];
  assert.deepEqual(iReglen.slice().sort(), Object.keys(TILSTAND).slice().sort());
});

/* ══════════════════════════════════════════════════════════════════════════
   BESLUTNING 40 — FORSLAGET LIGGER PÅ ETAPEN

   Det lå begge steder: på bookingen med tid, pris og transittid, på etapen
   med enheder og chauffør. For et forløb med én etape var det det samme løfte
   skrevet to steder — mønstret `test/demo-kilder.test.mjs` findes for at
   fange, nu for syvende gang.
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ DER ER KUN ÉN OVERGANGSTABEL", () => {
  /* `OVERGANGE` stod ved siden af `ETAPE_OVERGANGE`: to næsten identiske
     tabeller, hvor bookingens manglede `aaben`. Kommentaren under den sagde
     selv "Én kontrol, to tabeller. Ellers driver reglerne fra hinanden" — men
     to tabeller ER hvordan de driver. */
  const kilde = readFileSync("src/fleet/booking-state.js", "utf8");
  const kode = kilde.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/const OVERGANGE\s*=/.test(kode), "bookingens overgangstabel er tilbage");
  assert.ok(/const ETAPE_OVERGANGE\s*=/.test(kode));
});

test("⚠ OG INGEN kanSkifte() / byggSkifte() PÅ EN BOOKING", () => {
  /* En funktion der findes, bliver kaldt. En tilstandsmaskine der kunne sætte
     bookingens tilstand direkte, ville være en anden vej til et felt der har
     ét sted at komme fra — `forloebstilstand()` gennem `etapeskift`. */
  const kilde = readFileSync("src/fleet/booking-state.js", "utf8");
  const kode = kilde.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\*\*[\s\S]*?\*\//g, "");
  assert.ok(!/export function kanSkifte\s*\(/.test(kode));
  assert.ok(!/export function byggSkifte\s*\(/.test(kode));
  assert.ok(!/export function tilgaengeligeHandlinger\s*\(/.test(kode));
  /* Etapens tre bliver stående. */
  assert.ok(/export function kanSkifteEtape\s*\(/.test(kode));
  assert.ok(/export function byggEtapeSkifte\s*\(/.test(kode));
  assert.ok(/export function tilgaengeligeEtapeHandlinger\s*\(/.test(kode));
});

test("⚠ INGEN SKÆRM KALDER DEN GAMLE MASKINE", () => {
  /* Fandtes der en kalder, ville importen fejle ved build — men en prøve
     siger HVORFOR, og den fanger det før nogen bygger. */
  for (const f of [
    "src/moduler/booking/Forslag.jsx",
    "src/moduler/booking/Oversigt.jsx",
    "src/moduler/booking/NyForespoergsel.jsx",
  ]) {
    const s = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.ok(!/\bkanSkifte\(|\bbyggSkifte\(|\btilgaengeligeHandlinger\(/.test(s),
      `${f} kalder bookingens gamle tilstandsmaskine`);
  }
});

test("Forslag-skærmen læser etapens forslag og skriver gennem etapeskift", () => {
  /* ⚠ KOMMENTARERNE UD FØRST. Prøven krævede før at skærmen kaldte
     `demoEtaperPaa(` — og da den holdt op med det (beslutning 56), blev den
     grøn alligevel, fordi en KOMMENTAR nævnte navnet. Tredje gang i denne
     omgang at en prøve leder det forkerte sted; se beslutning 53 og 55. */
  const s = readFileSync("src/moduler/booking/Forslag.jsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(s.includes('useListe("etaper"'), "skaermen henter ikke forloebets etaper fra noden");
  assert.ok(!s.includes("demoEtaperPaa("), "skaermen henter stadig etaperne fra demofilen");
  /* ⚠ `forslag` ER ET OBJEKT I NODEN, nøglet på forslagets eget id.
     `forslagListe()` er det ene sted formen oversættes. Beslutning 58. */
  assert.ok(s.includes("forslagListe("), "skaermen laeser ikke etapens forslag");
  assert.ok(!/etape\.forslag\??\.length/.test(s),
    "skaermen behandler forslag som en array");
  assert.ok(s.includes("skiftEtape("), "skaermen skriver ikke gennem etapeskift");
  /* ⚠ OG DEN VISER DE FEM TJEK FØR MAN TRYKKER. Serveren kører dem igen og
     afviser med samme sætning, men at se dem først er forskellen på at vælge
     rigtigt og at få en fejl. */
  assert.ok(s.includes("tjekDisponering("), "de fem tjek vises ikke for det valgte forslag");
});

test("⚠ ET FORLØB MED FLERE ETAPER GODKENDES ÉN AD GANGEN", () => {
  /* Det er ikke en omvej — det er hele grunden til at `delvist` findes.
     Skærmen skal derfor have en etapevælger. */
  const s = readFileSync("src/moduler/booking/Forslag.jsx", "utf8");
  assert.ok(s.includes("etaper.length > 1"), "der er ingen etapevaelger");
});

test("reglerne kender etapens forslag", () => {
  const regler = readFileSync("firebase.rules.json", "utf8");
  const blokE = regler.slice(regler.indexOf('"etaper": {'), regler.indexOf('"lagre": {'));
  assert.ok(blokE.includes('"forslag": {'), "forslaget staar ikke i reglerne");
  assert.ok(blokE.includes('"estimatOere"'), "estimatet valideres ikke");
  /* ⚠ ET VALG SKAL PEGE PÅ ET FORSLAG DER FINDES. */
  assert.ok(/"valgtForslagId":[^\n]*child\('forslag'\)/.test(blokE),
    "valgtForslagId kan pege paa et forslag der ikke findes");
});

test("⚠ SKÆRMEN DEAKTIVERER GODKEND NÅR TJEKKENE SPÆRRER", () => {
  /* `kanSkifteEtape()` svarer kun på tilstandsmaskinen — den ved intet om at
     chaufføren allerede kører den dag. Serveren afviser, men en knap der er
     blå og så fejler, er en knap der lyver.

     ⚠ OG DET ER IKKE EN ANDEN SANDHED: det er den SAMME tjekDisponering()
     serveren kalder. Håndhævelsen ligger stadig i etapeskift. */
  const s = readFileSync("src/moduler/booking/Forslag.jsx", "utf8");
  assert.ok(s.includes("const spaerret = tjekraekker.some"),
    "skaermen udleder ikke om tjekkene spaerrer");
  assert.ok(/disabled=\{!tjek\.ok \|\| stoppet \|\| arbejder\}/.test(s),
    "knappen deaktiveres ikke af tjekkene");
  /* ⚠ KUN VEJEN TIL reserveret BINDER RESSOURCER. En returnering rører
     hverken bil eller chauffør — den skal ikke spærres af en konflikt;
     tværtimod er det dét man gør når forslaget ikke holder. */
  assert.ok(s.includes('const binder = m.til === "reserveret";'),
    "en returnering spaerres ogsaa af en reservationskonflikt");
});

test("⚠ HELE RÆKKEN VÆLGER ET FORSLAG, ikke kun radioen", () => {
  /* Et forslag er en linje med otte kolonner, og en 4 px knap yderst til
     venstre er det eneste sted man må ramme — det er ikke betjening, det er
     en prøve i finmotorik. `paaRaekke` giver også tastaturadgang. */
  const s = readFileSync("src/moduler/booking/Forslag.jsx", "utf8");
  assert.ok(s.includes("paaRaekke={(f) => setValgtForslagId(f.id)}"));
  assert.ok(s.includes("erValgt={(f) => f.id === valgtForslagId}"));
});

test("⚠ PROVISIONERINGEN SKRIVER RESERVATIONERNE — udledt af etaperne", () => {
  /* En reserveret etape HAR reservationer, men de skrives kun af etapeskift.
     Et seed der sprang dem over, viste et lager hvor hver bil var fri — og
     den første probe godkendte to ture på samme chauffør uden at
     konflikttjekket sagde noget. Det lignede en fejl i tjekket; det var en
     fejl i dataene. */
  const s = readFileSync("scripts/provisioner-dev.mjs", "utf8");
  assert.ok(s.includes("reservationerFraEtape(e)"),
    "reservationerne udledes ikke af etaperne");
  assert.ok(!/DEMO_RESERVATIONER/.test(s),
    "der er kommet et selvstaendigt reservationsdatasaet — to udgaver af samme kendsgerning");
});

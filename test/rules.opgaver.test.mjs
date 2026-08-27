/* test/rules.opgaver.test.mjs
 * Beslutning 21: opgaver.art, håndhævet af serveren.
 *
 * ⚠ HVORFOR DEN HER FIL BLEV SKREVET.
 * Da `art` blev gjort påkrævet, kørte hele suiten grønt med det samme — fordi
 * de eksisterende testfiler tilfældigvis allerede skrev `art: "vaerksted"` med
 * i deres opgaveposter. Suiten bekræftede altså kun reglens LYKKELIGE
 * tilfælde. En regel der kun er bekræftet i sit lykkelige tilfælde, er ikke
 * afprøvet — det står i rules.division.test.mjs' eget hoved, og det gjaldt
 * her.
 *
 * Filen tester derfor det reglen skal NÆGTE: en opgave uden art, og en opgave
 * med `langtur`, som netop IKKE er en gyldig art (se beslutning 21).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ OG SÅ BLEV NODEN LUKKET (beslutning 45), OG HALVDELEN AF FILEN FLYTTEDE.
 *
 * `opgaver` er `.write: false`. En klient kan derfor ikke længere skrive en
 * opgave — heller ikke en gyldig — og de prøver der DEMONSTREREDE at reglen
 * tog imod en rigtig post, kan ikke køre.
 *
 * ⚠ VÆRRE: afvisningsprøverne ville blive stående og PASSERE, men af den
 * forkerte grund. "afviser langtur" ville være grøn fordi skrivningen er
 * lukket, ikke fordi arten er forkert — en prøve der ikke kan fejle for sin
 * egen sætning, er værre end ingen, for den ser ud som dækning.
 *
 * Håndhævelsen ligger nu hvor skrivningen ligger: `opgaveMangler()` og
 * `valideOpgaveplan()` i `functions/delt/`, som `opgaveplanlaeg` kalder — og
 * som formularen kalder med de SAMME sætninger. Prøverne herunder spørger
 * derfor DEM, og de to file-læsende prøver (indekset og prioritetens ordliste)
 * står uændret: de handler om regelfilen, ikke om en skrivning.
 *
 * ⚠ ET FELT DER IKKE FINDES, AFVISES IKKE LÆNGERE AF EN REGEL. `$andet: false`
 * kan ikke nås. Til gengæld bygger funktionen posten FELT FOR FELT fra en
 * allowliste — `fra`, `til` og `type` bliver aldrig kopieret med. Det er en
 * stærkere spærring end reglen var, og prøven nedenfor læser funktionen.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kør:  npm run test:rules
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import { ref, set, update, get } from "firebase/database";
import { permStrengFraRolle } from "../src/fleet/permissions.js";
import { DEMO_OPGAVER } from "../src/fleet/demo-opgaver.js";
import { ALLE_OPGAVE_ARTER } from "../src/fleet/opgaver.js";
import { ALLE_PRIORITETER } from "../src/fleet/prioritet.js";
import { opgaveMangler } from "../src/fleet/opgaver.js";
import { valideOpgaveplan } from "../src/fleet/opgaveplan-regler.js";
import { ALLE_PERMS, PERM, permStreng } from "../src/fleet/permissions.js";

/* Egen tenant: node --test kører testfilerne parallelt. */
const TENANT = "vognmandOpg";
let miljoe;

const som = (uid, rolle = "admin") =>
  miljoe.authenticatedContext(uid, {
    tenant: TENANT, rolle, perms: permStrengFraRolle(rolle),
  }).database();

const sti = (id) => `tenants/${TENANT}/opgaver/${id}`;

/** En gyldig opgave uden art — arten lægges på pr. test. */
/* ⚠ startMs, IKKE dato. Fixturet skrev `dato` — det samme felt indekset
   navngav og som ingen post har. Noden kraever nu startMs, fordi opgaven
   RESERVERER sin ressource og et vindue skal kunne regnes. */
const opgave = (ekstra = {}) => ({
  status: "planlagt",
  startMs: 1786000000000,
  estimeretMin: 90,
  beskrivelse: "Serviceeftersyn 30.000 km",
  ...ekstra,
});

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-opgaver",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync("firebase.rules.json", "utf8"),
    },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    /* ⚠ EN GANG. ctx.database() kalder useEmulator() under motorhjelmen, og
       et kald nummer to paa samme kontekst er en FATAL fejl i SDK'en. */
    const db = ctx.database();
    await set(ref(db, `tenants/${TENANT}/_findes`), true);
    /* Et vaerksted at pege paa. leverandoerId slaar OP i reglerne — uden
       posten her ville hver skrivning fejle paa VALIDERING og ligne en
       manglende permission. */
    await set(ref(db, `tenants/${TENANT}/leverandoerer/lv-daf`), {
      navn: "DAF Trucks Fredericia", cvr: "30556612", kategori: "vaerksted",
    });
  });
});

after(async () => {
  await miljoe?.cleanup();
});

describe("⚠ NODEN ER LUKKET — vejen ind er opgaveplanlaeg", () => {
  /* Beslutning 45. Det er IKKE en manglende rettighed: disponent,
     koordinator og admin HAR alle `opgaver.skriv`, og funktionen
     kræver den. Det er VEJEN der er lukket — samme snit som kasseudlaan
     (37) og enheder (39). */

  it("⚠ EN BRUGER MED opgaver.skriv AFVISES", async () => {
    /* Den vigtigste prøve i filen. En opgave og dens RESERVATION bærer den
       samme kendsgerning — at enheden er optaget — og `reservationer` er
       `.write: false`. Kunne klienten skrive den ene halvdel, ville der stå
       en opgave uden reservation, og bilen ser FRI ud i disponeringen mens
       den står på liften. Det er beslutning 4's fejl. */
    const db = miljoe.authenticatedContext("uid-kun-opgaver", {
      tenant: TENANT, rolle: "disponent", perms: permStreng([PERM.opgaverSkriv]),
    }).database();
    await assertFails(set(ref(db, sti("o-forsoeg")), opgave({ art: "vaerksted" })));
  });

  it("⚠ HELLER IKKE MED ALLE PERMISSIONS", async () => {
    const db = miljoe.authenticatedContext("uid-alt", {
      tenant: TENANT, rolle: "admin", perms: permStreng(ALLE_PERMS),
    }).database();
    await assertFails(set(ref(db, sti("o-admin")), opgave({ art: "vaerksted" })));
  });

  it("en opdatering af en eksisterende opgave afvises også", async () => {
    /* Det er ikke oprettelsen der er farlig — det er `startMs`. Flyttede en
       klient vinduet, ville reservationen blive stående, og de to ville sige
       hver sit om hvornår bilen er optaget. */
    const db = som("admin-opg");
    await assertFails(update(ref(db, sti("o-seedet")), { startMs: 1786100000000 }));
    await assertFails(update(ref(db, sti("o-seedet")), { status: "udfoert" }));
  });

  it("læsningen er uændret — det er skrivningen der er lukket", async () => {
    const db = som("uid-laeser", "chauffoer");
    await assertSucceeds(get(ref(db, `tenants/${TENANT}/opgaver`)));
  });

  it("⚠ REGELFILEN SIGER DET SAMME SOM FILEN HER", () => {
    const regler = JSON.parse(
      readFileSync("firebase.rules.json", "utf8")
        .split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith("//")).join(String.fromCharCode(10))
    );
    assert.equal(regler.rules.tenants.$tenantId.opgaver[".write"], false,
      "opgaver er skrivbar igen — så kan en opgave landes uden sin reservation");
  });

  it("⚠ PERMISSIONEN BESTÅR — det er vejen der er lukket, ikke retten", () => {
    /* Samme ordning som kasseudlaan: `opgaveplanlaeg` kræver
       `opgaver.skriv`, så permissionen betyder stadig noget. Fjernede vi
       den, ville funktionen ikke kunne skelne en disponent fra en chauffør. */
    assert.ok(ALLE_PERMS.includes(PERM.opgaverSkriv));
    const kode = readFileSync("functions/index.js", "utf8");
    assert.match(kode, /perms\.includes\("\|opgaver\.skriv\|"\)/,
      "opgaveplanlaeg prøver ikke længere permissionen");
  });
});

describe("beslutning 21 — art på opgaver", () => {
  /* ⚠ HÅNDHÆVELSEN LIGGER I opgaveMangler(), ikke i reglen. Noden er lukket,
     så `.validate` kan ikke nås af en klient — den beskriver stadig FORMEN
     serveren skal overholde, men det er den delte funktion der afgør. */

  it("kender hver af de gyldige arter", () => {
    for (const art of ALLE_OPGAVE_ARTER) {
      assert.ok(!opgaveMangler({ ...opgave({ art }), koeretoejId: "kt-1", aktivId: "a-1" })
        .includes("art"), `${art} blev afvist som art`);
    }
  });

  /* Kataloget i fleet/opgaver.js og reglen skal beskrive det samme. Tilføjer
     nogen en art i den ene uden den anden, falder den her. */
  it("kender præcis de arter kataloget kender", async () => {
    assert.deepEqual([...ALLE_OPGAVE_ARTER].sort(), ["facility", "vaerksted"]);
  });

  it("afviser en opgave HELT uden art", () => {
    assert.ok(opgaveMangler(opgave()).includes("art"));
    assert.ok(valideOpgaveplan(opgave()).fejl.art);
  });

  /* Den vigtigste afvisning i filen. `langtur` var den art README foreslog,
     før beslutning 16 gjorde den til en dublet af en etape. Bliver den gyldig
     igen, står en transportstrækning to steder — og så er vi tilbage ved
     DE-QR 777 mod DE-KL 404. */
  it("afviser 'langtur' — en langtur er en etape, ikke en opgave", () => {
    assert.ok(opgaveMangler(opgave({ art: "langtur" })).includes("art"));
    /* Og funktionen sætter i øvrigt arten SELV — se prøven nederst. */
  });

  it("afviser ukendte og forkert formede arter", () => {
    for (const art of ["Vaerksted", "VAERKSTED", "vaerksted ", "", "vaerksted,facility", "service"]) {
      assert.ok(opgaveMangler(opgave({ art })).includes("art"), `art="${art}" burde afvises`);
    }
  });

  it("afviser art som noget andet end en streng", () => {
    for (const art of [true, 1, null]) {
      assert.ok(opgaveMangler(opgave({ art })).includes("art"), `art=${art} burde afvises`);
    }
  });

  /* Division var påkrævet før beslutning 21 og er det stadig. Arten erstatter
     den ikke: en opgave er en TRANSAKTION og hører til én afdeling, mens
     arten siger hvad arbejdet udføres på. */
  it("⚠ ARTEN KAN IKKE ÆNDRES BAGEFTER — der er ingen vej til det", () => {
    /* Her stod to prøver på at reglen afviste en opdatering af `art`. De
       er blevet overflødige på den gode måde: der findes ingen klientvej til
       at opdatere en opgave OVERHOVEDET. Skulle et statusskifte bygges, er
       det en funktion — og så er det DEN der skal prøves.
       Se "to veje er lukket med" i regelfilen. */
    const kode = readFileSync("functions/index.js", "utf8");
    assert.doesNotMatch(kode, /opgaver\/\$\{[^}]*\}\/art/,
      "en funktion skriver art på en eksisterende opgave");
  });

  /* Reglerne skal kunne forespørges på art — ellers kan Disponering ikke
     hente dagens værkstedsopgaver uden at hente hele noden ned. Et manglende
     .indexOn FEJLER ikke; det henter bare alt og advarer i konsollen. */
  it("⚠ INDEKSERER FELTER DER FAKTISK FINDES PÅ EN OPGAVE", () => {
    /* Her stod at .indexOn skulle indeholde "dato". Det gjorde det — og
       INGEN opgave har feltet: de bærer startMs. Et indeks på et felt der
       ikke findes, koster ingenting og beskytter ingenting, og den dag
       nogen sorterer på startMs, henter RTDB hele noden ned og sorterer i
       klienten: en advarsel i konsollen og en regning i stilhed.

       Det overlevede fordi ingen skærm forespurgte på noden — den var
       demo-drevet, og noden stod tom. Prøven spørger nu om DATAENE. */
    const regler = JSON.parse(
      readFileSync("firebase.rules.json", "utf8")
        .split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith("//")).join(String.fromCharCode(10))
    );
    const indeks = regler.rules.tenants.$tenantId.opgaver[".indexOn"];
    assert.ok(indeks.includes("art"), ".indexOn mangler art");
    assert.ok(indeks.includes("startMs"), ".indexOn mangler startMs");
    assert.ok(!indeks.includes("dato"), "dato er tilbage — intet felt hedder det");

    /* Og hvert indekseret felt skal findes på en rigtig post. */
    const felter = new Set(DEMO_OPGAVER.flatMap((o) => Object.keys(o)));
    for (const f of indeks) {
      assert.ok(felter.has(f), `.indexOn indekserer "${f}", som ingen opgave har`);
    }
  });
});

describe("prioriteten er tre trin, og serveren kender dem", () => {
  /* ⚠ NODEN ER LUKKET MED $andet: false. Uden en regel for feltet kunne
     prioriteten slet IKKE skrives — skærmen ville vise en vælger, serveren
     ville afvise, og fejlen ville se ud som en manglende permission. */

  it("tager hvert af de tre trin", () => {
    for (const trin of ALLE_PRIORITETER) {
      const post = opgave({ art: "vaerksted", koeretoejId: "kt-1", prioritet: trin });
      assert.deepEqual(opgaveMangler(post), [], `${trin} blev afvist`);
    }
  });

  it("⚠ AFVISER LABELET. Værdien er \"normal\" — \"mellem\" er det man SKRIVER", async () => {
    /* Den her er hele grunden til at ordlisten står som en regex og ikke som
       et længdetjek. "mellem" er præcis det ord skærmen viser, og en
       udvikler der skriver værdien af efter labelet, rammer det. Slap
       reglen den igennem, ville posten hverken tælle som lav, mellem eller
       høj på Driftskalenderen — den ville forsvinde mellem tre tal der
       alle så rigtige ud. */
    const post = opgave({ art: "vaerksted", koeretoejId: "kt-1", prioritet: "mellem" });
    assert.ok(opgaveMangler(post).some((m) => m.startsWith("prioritet")));
    assert.ok(valideOpgaveplan(post).fejl.prioritet);
  });

  it("afviser en prioritet der slet ikke findes", () => {
    for (const v of ["kritisk", 1]) {
      const post = opgave({ art: "vaerksted", koeretoejId: "kt-1", prioritet: v });
      assert.ok(opgaveMangler(post).some((m) => m.startsWith("prioritet")), `prioritet=${v}`);
    }
  });

  it("⚠ EN OPGAVE UDEN PRIORITET ER GYLDIG — 'ikke vurderet' er et svar", async () => {
    /* Feltet står med vilje IKKE i hasChildren. Krævede vi det, ville den der
       opretter, gætte — og så var alt "Mellem" og tallet ubrugeligt. Se
       prioritet.js: prioritetFor() svarer null, aldrig PRIORITET.normal. */
    const post = opgave({ art: "vaerksted", koeretoejId: "kt-1" });
    assert.deepEqual(opgaveMangler(post), []);
    assert.equal(valideOpgaveplan(post).ok, false, "arbejdstype mangler stadig");
    assert.equal(valideOpgaveplan({ ...post, arbejdstype: "service" }).ok, true);
  });

  it("⚠ SAMME ORDLISTE TRE STEDER — ikke en afskrift der kan drive", () => {
    /* Tre noder bærer feltet: opgaver, indberetninger og plukordrer. Skrev
       de hver sin ordliste, ville Driftskalenderens kasser tælle to noder
       med hvert sit ordforråd — og de står side om side i den samme kø.

       Prøven læser REGELFILEN og holder den op mod prioritet.js. En regex
       over rå tekst ville have været sin egen fejlkilde; her parses JSON,
       efter at kommentarlinjerne er strippet (regelfilen bærer //-noter,
       som Firebase tillader og JSON.parse ikke).

       ⚠ Og den kigger på ALLE tre. Rettede nogen kun den ene, ville de to
       andre stå tilbage — det er præcis sådan de to demo-datasæt for én
       node opstod. */
    const regler = JSON.parse(
      readFileSync("firebase.rules.json", "utf8")
        .split(String.fromCharCode(10))
        .filter((l) => !l.trim().startsWith("//"))
        .join(String.fromCharCode(10))
    );
    const t = regler.rules.tenants.$tenantId;
    const steder = {
      opgaver: t.opgaver.$opgaveId.prioritet,
      indberetninger: t.indberetninger.$id.prioritet,
      plukordrer: t.plukordrer.$ordreId.prioritet,
    };
    /* "matches(/^(" og ")$/" skrives af tegn frem for som literaler, saa
       proeven ikke selv skal escape en regex den handler om. */
    const SKRAA = String.fromCharCode(47);
    const AABN = "matches(" + SKRAA + String.fromCharCode(94) + "(";
    const LUK = ")" + String.fromCharCode(36) + SKRAA;
    const forventet = [...ALLE_PRIORITETER].sort();
    for (const [node, regel] of Object.entries(steder)) {
      assert.ok(regel, `${node} har ingen regel for prioritet — noden er lukket`);
      /* Ordlisten hentes ved at klippe mellem to faste stumper frem for med
         en regex. En regex om en regex er sin egen fejlkilde — og fejler den,
         fejler den ved at finde INGENTING, hvilket ser ud som en manglende
         regel frem for en daarlig proeve. */
      const v = regel[".validate"];
      const a = v.indexOf(AABN);
      assert.ok(a >= 0, `${node}s prioritet valideres ikke mod en ordliste`);
      const trin = v.slice(a + AABN.length, v.indexOf(LUK, a));
      assert.deepEqual(trin.split("|").sort(), forventet,
        `${node} kender ${trin} — prioritet.js kender ${ALLE_PRIORITETER}`);
    }
  });
});

describe("værkstedsbesøgets to felter", () => {
  /* ⚠ DE KOM MED SAMMENLÆGNINGEN. De otte værkstedsbesøg lå i deres eget
     demo-datasæt med `type` og `leverandoerId`; da de blev flyttet ind i
     `opgaver`, kunne de ikke gemmes — noden er lukket med $andet: false, og
     ingen af de to felter fandtes. Prøven her er den anden halvdel af den
     flytning: uden den kunne demo-sættet vise noget serveren afviser. */

  it("tager arbejdstype og leverandoerId", () => {
    const post = opgave({
      art: "vaerksted", koeretoejId: "kt-1",
      arbejdstype: "service", leverandoerId: "lv-daf",
    });
    assert.deepEqual(opgaveMangler(post), []);
    assert.equal(valideOpgaveplan(post).ok, true);
  });

  it("⚠ VÆRKSTEDET SLÅS OP — OG DET GØR FUNKTIONEN, IKKE REGLEN", () => {
    /* Et opslag, ikke en fritekst. Værkstedets navn stod som streng i tre
       demo-filer med hver sin stavemåde at drive med, før leverandoerer/ blev
       kilden — og en fejlstavning skal blive en AFVISNING frem for en ny
       leverandør ingen kan finde igen.

       ⚠ REGLEN SLOG DET OP MED root.child(...). Den kan ikke nås længere, og
       et opslag i en database kan ikke laves af en ren funktion — så den her
       kontrol er DEN ENE der udelukkende ligger i `opgaveplanlaeg` nu.
       Prøven læser funktionen; probet mod DEV kalder den. */
    const kode = readFileSync("functions/index.js", "utf8");
    assert.match(kode, /leverandoerer\/\$\{leverandoerId\}/,
      "opgaveplanlaeg slår ikke leverandøren op");
    assert.match(kode, /Leverandøren \$\{leverandoerId\} findes ikke/);
  });

  it("⚠ EN OPGAVE UDEN LEVERANDØR ER GYLDIG — det er eget værksted", () => {
    /* Feltet er netop det der skiller intern vedligehold fra et eksternt
       besøg. Krævede vi det, ville halvdelen af flådens arbejde — det vores
       egen mekaniker laver på vores egen lift — ikke kunne gemmes. */
    const post = opgave({ art: "vaerksted", koeretoejId: "kt-1", arbejdstype: "reparation" });
    assert.deepEqual(opgaveMangler(post), []);
    assert.equal(valideOpgaveplan(post).ok, true);
  });

  it("⚠ FELTET HEDDER arbejdstype — \"type\" AFVISES", () => {
    /* Noden har allerede `art`. Et felt ved siden af der hed `type`, ville
       være den forveksling der har kostet os to gange: indberetningers indeks
       navngav "type" mens posterne bærer "art", og opgavers navngav "dato".
       $andet: false gør det til en afvisning frem for et felt der ligger og
       ikke bliver læst. */
    const post = opgave({ art: "vaerksted", koeretoejId: "kt-1", type: "service" });
    assert.ok(valideOpgaveplan(post).fejl.arbejdstype,
      "en post med 'type' i stedet for 'arbejdstype' blev godtaget");
    /* Og `type` kommer aldrig i noden: funktionen bygger posten felt for felt.
       ⚠ MÅLT PÅ OPGAVEFUNKTIONERNE, IKKE PÅ HELE FILEN. Den læste hele
       functions/index.js, og forbuddet gjaldt dermed enhver funktion der
       nogensinde blev skrevet — `statusmelding` tager med rette et `type` fra
       klienten, for en statusmelding HAR ingen `art` at forveksle det med.
       En prøve der rammer bredere end sin begrundelse, siger nej til noget
       den ikke har taget stilling til. Se beslutning 103. */
    const kode = readFileSync("functions/index.js", "utf8");
    for (const navn of ["opgaveplanlaeg", "facilityplanlaeg", "opgaveflyt", "opgavestatus"]) {
      const krop = kode.split(`export const ${navn} =`)[1]?.split("\nexport const")[0];
      assert.ok(krop, `funktionen ${navn} findes ikke længere`);
      assert.doesNotMatch(krop, /type: kortStreng\(d\.type/);
    }
  });

  it("⚠ OG fra/til AFVISES — en opgave bærer startMs og estimeretMin", async () => {
    /* Et besøg bar et VINDUE. Koden i reservationFraOpgave() tager imod begge
       former, men den ene kunne aldrig ligge i basen — og det var netop det
       der gjorde sammenlægningen til mere end en omdøbning. */
    /* ⚠ `$andet: false` KAN IKKE NÅS LÆNGERE, og spærringen er blevet
       STÆRKERE: funktionen bygger posten felt for felt fra en allowliste, så
       `fra` og `til` aldrig bliver kopieret med. En regel afviser hele
       skrivningen; en allowliste kan ikke komme til at lade feltet slippe
       igennem, fordi det aldrig bliver læst. */
    const kode = readFileSync("functions/index.js", "utf8");
    const post = kode.slice(kode.indexOf("export const opgaveplanlaeg"));
    const krop = post.slice(post.indexOf("const post = {"), post.indexOf("};", post.indexOf("const post = {")));
    for (const felt of ["fra", "til", "type"]) {
      assert.doesNotMatch(krop, new RegExp(`\\b${felt}:`),
        `opgaveplanlaeg kopierer "${felt}" med i posten`);
    }
    assert.match(krop, /startMs:/);
    assert.match(krop, /estimeretMin:/);
  });
});

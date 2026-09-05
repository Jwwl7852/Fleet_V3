/* test/rules.indberetninger.test.mjs
 * Indberetningen og dens klassificerede satellit.
 *
 * ⚠ NODEN `sensitive/indberetninger` FANDTES IKKE — men CLAUDE.md beskrev
 * dens regel som gældende:
 *
 *   "Skrive en underskrift to gange. `sensitive/…/underskrift` er write-once
 *    i reglerne (`!data.exists()`)."
 *
 * Den regel stod ingen steder. En dokumenteret spærring uden håndhævelse er
 * den værste slags: den står i vejen for at nogen bygger den, og den stopper
 * ingenting. `indberetninger.js` har hele tiden sagt hvad der skulle ske —
 * `PERM_SENSITIVE_LAES_PLANLAGT` tilføjes "i SAMME ombæring som reglerne og
 * deres tests, ikke før".
 *
 * ⚠ OG HOVEDPOSTEN VALIDEREDE KUN `division`. Alt andet var frit — og det er
 * den ene node hvor den MINDST betroede rolle opretter poster: chauffører
 * skriver deres egne indberetninger.
 *
 * Koer: npm test
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import { ref, set, get, update, remove } from "firebase/database";
import { PERM, permStreng, permStrengFraRolle } from "../src/fleet/permissions.js";
import { SENSITIVE_FELTER, ALLE_ARTER, ALLE_FORLOEB } from "../src/fleet/indberetninger.js";
import { ALLE_PRIORITETER } from "../src/fleet/prioritet.js";

const T = "tenantInd";
const KT = "kt-012";

let miljoe;

const medPerms = (uid, perms) =>
  miljoe.authenticatedContext(uid, {
    tenant: T, rolle: "admin", perms: permStreng(perms),
  }).database();

const somRolle = (uid, rolle) =>
  miljoe.authenticatedContext(uid, {
    tenant: T, rolle, perms: permStrengFraRolle(rolle),
  }).database();

const sti = (rest) => `tenants/${T}/${rest}`;

const POST = (o = {}) => ({
  art: "koeretoejsskade", forloeb: "ny", oprettetAf: "uid-lars", oprettetMs: 1786912716050,
  koeretoejId: KT, beskrivelse: "Bulet kofanger ved rampe 3",
  ...o,
});

const UNDERSKRIFT = {
  navn: "Preben Sørensen",
  billedeSti: "underskrifter/ind-001.png",
  stedTekst: "Rampe 4, Bornholms Mejeri",
  ms: 1786912777755,
};

/**
 * ⚠ TILFØJET 2026-09-05 — indberetninger/$id.write kræver nu data.exists()
 * på BEGGE grene (indberetninger.skriv og indberetninger.skrivAlle). En
 * frisk post kan derfor ikke længere skrives direkte af en klient — den
 * kommer kun fra `indberetningIndsend` (Cloud Function, Admin-SDK, som går
 * uden om reglerne), fordi den samtidig skal oprette en sag med et
 * ticketnummer i samme update(). Se firebase.rules.json's egen note ved
 * indberetninger/$id.write.
 *
 * Testene her prøver stadig `.validate` — feltformer, obligatoriske felter,
 * ordlister — som gælder UÆNDRET for en REDIGERING. `seedPost()` lægger
 * derfor en gyldig post ned FØRST, uden om reglerne, så den efterfølgende
 * `set()`/`update()` i selve prøven bliver en redigering (data.exists() ===
 * true) i stedet for en oprettelse — og dermed rammer den `.validate`, som
 * er dét prøven faktisk handler om, ikke det nye skriveslør.
 */
async function seedPost(id, oprettetAf, ekstra = {}) {
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), sti(`indberetninger/${id}`)), POST({ oprettetAf, ...ekstra }));
  });
}

/** Samme som seedPost(), men uden POST()'s koeretoejsskade-baseline — til
 * TANKNING() og andre former der ikke deler POST()'s felter (fx braendstof,
 * som ikke har `forloeb`). */
async function seedRaw(id, data) {
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), sti(`indberetninger/${id}`)), data);
  });
}

before(async () => {
  miljoe = await initializeTestEnvironment({
    projectId: "fc-rules-ind",
    database: {
      host: "127.0.0.1", port: 9000,
      rules: readFileSync("firebase.rules.json", "utf8"),
    },
  });
  await miljoe.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, `tenants/${T}/_findes`), true);
    /* koeretoejId slår op — uden bilen fejler hver skrivning på VALIDERING og
       ville ligne en manglende permission. */
    await set(ref(db, `tenants/${T}/koeretoejer/${KT}`), {
      navn: "Volvo FH", art: "lastbil", status: "aktiv",
    });
  });
});

after(async () => { await miljoe?.cleanup(); });

/* ══════════════════════════════════════════════════════════════════════
   Hovedposten
   ══════════════════════════════════════════════════════════════════════ */
describe("indberetningen", () => {
  it("tager en fuldt udfyldt post", async () => {
    /* ⚠ TILFØJET 2026-09-05 — en frisk post kræver nu indberetningIndsend()
       (se seedPost()'s note). Prøven seeder derfor posten først, uden om
       reglerne, og prøver så at (gen)skrive den FULDE gyldige form som en
       REDIGERING — hvilket stadig er dét .validate skal acceptere. */
    await seedPost("i-ok", "u1");
    await assertSucceeds(set(ref(medPerms("u1", [PERM.indberetningerSkriv]),
      sti("indberetninger/i-ok")), POST({ oprettetAf: "u1" })));
  });

  it("⚠ oprettetAf ER ET uid — og reglen sammenligner med auth.uid", async () => {
    /* Bytter man uid og personId, holder ejerskabstjekket op med at virke:
       et personId matcher aldrig et uid, og så kan ingen chauffør rette sin
       egen post. Prøven her viser at feltet ER det reglen læser.
       ⚠ TILFØJET 2026-09-05 — begge poster seedes nu først (en frisk
       oprettelse kræver indberetningIndsend()). "i-egen" prøver at GEMME
       igen med samme ejer (skal lykkes); "i-andens" prøver at OMDØBE ejeren
       til en anden, som auth.uid — det er stadig præcis den sammenligning
       reglen laver, nu på redigeringen i stedet for oprettelsen. */
    const ch = somRolle("uid-ch", "chauffoer");
    await seedPost("i-egen", "uid-ch");
    await assertSucceeds(
      set(ref(ch, sti("indberetninger/i-egen")), POST({ oprettetAf: "uid-ch" })));

    await seedPost("i-andens", "uid-ch");
    await assertFails(
      set(ref(ch, sti("indberetninger/i-andens")), POST({ oprettetAf: "en-anden" })));
  });

  it("⚠ DE TRE KLASSIFICEREDE FELTER AFVISES PÅ HOVEDPOSTEN", async () => {
    /* Beslutning 17: det klassificerede ligger i en SATELLIT med sin egen
       .read. Uden de tre `.validate: false` kunne en skadebeskrivelse skrives
       på hovedposten, som ENHVER med flådemodulet kan læse — og adskillelsen
       ville være en konvention frem for en spærring.

       Listen læses af SENSITIVE_FELTER, så et fjerde felt ikke kan komme til
       i modulet uden at prøven her opdager det. */
    const db = medPerms("u3", [PERM.indberetningerSkriv]);
    assert.deepEqual(SENSITIVE_FELTER, ["skadeBeskrivelse", "modpart", "underskrift"]);
    for (const felt of SENSITIVE_FELTER) {
      await seedPost(`klas-${felt}`, "u3");
      await assertFails(set(ref(db, sti(`indberetninger/klas-${felt}`)),
        POST({ oprettetAf: "u3", [felt]: felt === "modpart" ? { navn: "X" } : "noget" })));
    }
  });

  it("afviser et ukendt felt", async () => {
    await seedPost("i-ekstra", "u4");
    await assertFails(set(ref(medPerms("u4", [PERM.indberetningerSkriv]), sti("indberetninger/i-ekstra")),
      POST({ oprettetAf: "u4", forsikringssum: 1 })));
  });

  it("⚠ EN OMKOSTNING ER HELE ØRE", async () => {
    const db = medPerms("u5", [PERM.indberetningerSkriv]);
    await seedPost("i-oere", "u5");
    await assertSucceeds(set(ref(db, sti("indberetninger/i-oere")),
      POST({ oprettetAf: "u5", omkostningOere: 184500 })));
    await seedPost("i-float", "u5");
    await assertFails(set(ref(db, sti("indberetninger/i-float")),
      POST({ oprettetAf: "u5", omkostningOere: 1845.5 })));
  });

  it("indekset navngiver et felt posterne FAKTISK har", () => {
    /* ⚠ HER STOD "type". Posterne bærer "art" — tredje gang et indeks peger
       på et felt der ikke findes (opgaver."dato", fakturaer.
       "godkendelsesstatus"). Det fejler ikke: RTDB henter hele noden ned og
       filtrerer i klienten med en advarsel i konsollen. */
    const regler = JSON.parse(
      readFileSync("firebase.rules.json", "utf8").replace(/^\s*\/\/.*$/gm, ""));
    const node = regler.rules.tenants.$tenantId.indberetninger;
    assert.ok(node[".indexOn"].includes("art"));
    assert.ok(!node[".indexOn"].includes("type"),
      '"type" findes ikke på en indberetning — den hedder "art"');
    for (const felt of node[".indexOn"]) {
      assert.ok(felt in POST(), `indekset navngiver "${felt}", som ingen post har`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════
   ⚠ TILLÆGSKRAV "BRÆNDSTOFMATCH" §1/§2/§8 — koeretoejId, dato og liter er
   OBLIGATORISKE for braendstof, og kun for braendstof. Det er præcis de tre
   felter matchmotoren (endnu ubygget) skal bruge — aldrig pris, aldrig
   foto. Se firebase.rules.json's egen note ved indberetninger.$id.validate.
   ══════════════════════════════════════════════════════════════════════ */
describe("braendstof kræver koeretoejId, dato og liter — kun braendstof", () => {
  const SKRIVER = [PERM.indberetningerSkriv];
  const TANKNING = (o = {}) => ({
    art: "braendstof", oprettetAf: "u-tank", oprettetMs: 1786912716050,
    koeretoejId: KT, dato: "2026-08-31", liter: 58.4,
    ...o,
  });

  /* ⚠ TILFØJET 2026-09-05 — hver prøve seeder nu en fuldt gyldig tankning
     FØRST (uden om reglerne), så den efterfølgende set() bliver en
     redigering — se seedRaw()/seedPost()'s fælles note. */
  it("en fuldt udfyldt tankning tages", async () => {
    await seedRaw("tank-ok", TANKNING());
    await assertSucceeds(set(ref(medPerms("u-tank", SKRIVER), sti("indberetninger/tank-ok")),
      TANKNING()));
  });

  it("⚠ UDEN koeretoejId AFVISES", async () => {
    const uden = TANKNING();
    delete uden.koeretoejId;
    await seedRaw("tank-uden-enhed", TANKNING());
    await assertFails(set(ref(medPerms("u-tank", SKRIVER), sti("indberetninger/tank-uden-enhed")),
      uden));
  });

  it("⚠ UDEN dato AFVISES", async () => {
    const uden = TANKNING();
    delete uden.dato;
    await seedRaw("tank-uden-dato", TANKNING());
    await assertFails(set(ref(medPerms("u-tank", SKRIVER), sti("indberetninger/tank-uden-dato")),
      uden));
  });

  it("⚠ UDEN liter AFVISES", async () => {
    const uden = TANKNING();
    delete uden.liter;
    await seedRaw("tank-uden-liter", TANKNING());
    await assertFails(set(ref(medPerms("u-tank", SKRIVER), sti("indberetninger/tank-uden-liter")),
      uden));
  });

  it("⚠ EN DATO DER IKKE ER ISO (åååå-mm-dd) AFVISES", async () => {
    await seedRaw("tank-forkert-dato", TANKNING());
    await assertFails(set(ref(medPerms("u-tank", SKRIVER), sti("indberetninger/tank-forkert-dato")),
      TANKNING({ dato: "31-08-2026" })));
  });

  it("prisPrLiterOere er stadig et gyldigt (men VALGFRIT) felt — bagudkompatibilitet", async () => {
    /* Formularen tilbyder det ikke længere (Indberetning.jsx), men gamle
       poster har det, og feltets egen validering er ikke fjernet fra
       reglerne — kun kravet om at det skal udfyldes er der aldrig kommet. */
    await seedRaw("tank-med-pris", TANKNING());
    await assertSucceeds(set(ref(medPerms("u-tank", SKRIVER), sti("indberetninger/tank-med-pris")),
      TANKNING({ prisPrLiterOere: 1395 })));
  });

  it("kravet gælder KUN braendstof — en anden art har hverken dato eller liter", async () => {
    /* Regressionsvagt: den nye betingelse må ikke ved en fejl ramme alle
       arter. POST() (koeretoejsskade) har hverken dato eller liter, og den
       allerede eksisterende "tager en fuldt udfyldt post"-prøve ovenfor
       beviser det samme — denne gør det eksplicit for netop dette krav. */
    await seedPost("ikke-tank", "u6");
    await assertSucceeds(set(ref(medPerms("u6", SKRIVER), sti("indberetninger/ikke-tank")),
      POST({ oprettetAf: "u6" })));
  });
});

/* ══════════════════════════════════════════════════════════════════════
   Satellitten — og underskriften der kun skrives én gang
   ══════════════════════════════════════════════════════════════════════ */
describe("sensitive/indberetninger", () => {
  const SKRIVER = [PERM.indberetningerSkriv, PERM.indberetningerSensitiveLaes];

  it("kræver BÅDE skriv og sensitiveLaes", async () => {
    /* Den der skriver det klassificerede, skal også kunne læse det — ellers
       kunne man skrive noget ind man ikke selv måtte se igen. */
    const kunSkriv = medPerms("s1", [PERM.indberetningerSkriv]);
    await assertFails(set(ref(kunSkriv, sti("sensitive/indberetninger/i-1")),
      { skadeBeskrivelse: "Noget" }));

    const begge = medPerms("s2", SKRIVER);
    await assertSucceeds(set(ref(begge, sti("sensitive/indberetninger/i-1")),
      { skadeBeskrivelse: "Noget" }));
  });

  it("⚠ DISPONENTEN MÅ IKKE LÆSE DEN — koordinatoren må", async () => {
    /* Han skal vide AT bilen er på værksted for at kunne planlægge; hvad
       modparten hedder, ændrer ingen rute. Koordinatoren lukker sagen og
       håndterer fakturaen — samme snit som på bookingen. */
    await assertFails(get(ref(somRolle("d1", "disponent"), sti("sensitive/indberetninger"))));
    await assertSucceeds(get(ref(somRolle("k1", "koordinator"), sti("sensitive/indberetninger"))));
    await assertFails(get(ref(somRolle("c1", "chauffoer"), sti("sensitive/indberetninger"))));
  });

  it("⚠ EN UNDERSKRIFT SKRIVES ÉN GANG — OG RETTES ALDRIG", async () => {
    /* Reglen CLAUDE.md allerede beskrev, og som ikke fandtes. Et bevis der
       kan redigeres, beviser ingenting. En rettelse er en NY indberetning
       der henviser til den gamle. */
    const db = medPerms("s3", SKRIVER);
    const sti1 = sti("sensitive/indberetninger/i-sig/underskrift");
    await assertSucceeds(set(ref(db, sti1), UNDERSKRIFT));
    await assertFails(set(ref(db, sti1), { ...UNDERSKRIFT, navn: "En anden" }));
  });

  it("⚠ HELLER IKKE ÉT FELT I DEN", async () => {
    /* !data.exists() ligger på hele underskriften, ikke på hvert felt. Kunne
       man rette navnet bagefter, var det stadig en redigeret underskrift. */
    const db = medPerms("s4", SKRIVER);
    await assertSucceeds(
      set(ref(db, sti("sensitive/indberetninger/i-felt/underskrift")), UNDERSKRIFT));
    await assertFails(
      set(ref(db, sti("sensitive/indberetninger/i-felt/underskrift/navn")), "En anden"));
  });

  /**
   * ⚠ DE TO PRØVER OVENFOR SAGDE AT REGLEN HOLDT — OG INGEN AF DEM SLETTEDE
   * FØRST.
   *
   * `.validate` køres IKKE ved en sletning. Det er samme kendsgerning som
   * beslutning 38 navngav for `priser`, og den kostede det samme her: MÅLT i
   * emulatoren kunne en bruger med `indberetninger.skriv` +
   * `sensitiveLaes` fjerne underskriften, tømme den med en `update`, eller
   * slette hele den klassificerede post — og bagefter skrive en ny.
   * Write-once var brudt i to trin.
   *
   * En `.validate` siger hvad der må STÅ, aldrig hvad der må FORSVINDE.
   */
  it("⚠ EN UNDERSKRIFT KAN HELLER IKKE SLETTES OG SKRIVES OM", async () => {
    const db = medPerms("s3b", SKRIVER);
    const s = sti("sensitive/indberetninger/i-slet/underskrift");
    await assertSucceeds(set(ref(db, s), UNDERSKRIFT));
    await assertFails(remove(ref(db, s)));
    /* Og den samme sletning skrevet som en update med null. */
    await assertFails(
      update(ref(db, sti("sensitive/indberetninger/i-slet")), { underskrift: null }));
  });

  it("⚠ HELLER IKKE VED AT SLETTE HELE DEN KLASSIFICEREDE POST", async () => {
    /* Havde spærringen kun stået på feltet, var vejen udenom ét niveau oppe. */
    const db = medPerms("s3c", SKRIVER);
    await assertSucceeds(
      set(ref(db, sti("sensitive/indberetninger/i-hele/underskrift")), UNDERSKRIFT));
    await assertFails(remove(ref(db, sti("sensitive/indberetninger/i-hele"))));
  });

  /**
   * ⚠ OG SPÆRRINGEN DÆKKER MERE END UNDERSKRIFTEN SELV.
   *
   * Kunne skadebeskrivelsen rettes bagefter, ville underskriften bevise noget
   * andet end det der blev skrevet under på — og så er den lige så lidt værd
   * som en der kunne redigeres. Hele posten er derfor frosset.
   *
   * ⚠ RÆKKEFØLGEN ER DERMED BESTEMT: beskrivelse og modpart FØRST,
   * underskrift SIDST. Det er også den rigtige vej rundt.
   */
  it("⚠ EN UNDERSKREVET POST ER FROSSET — OGSÅ FELTERNE VED SIDEN AF", async () => {
    const db = medPerms("s3d", SKRIVER);
    const post = sti("sensitive/indberetninger/i-frost");
    await assertSucceeds(set(ref(db, post), {
      skadeBeskrivelse: "Bulet kofanger, ridser i lakken",
    }));
    /* Før underskriften: rettelser er i orden. */
    await assertSucceeds(set(ref(db, `${post}/skadeBeskrivelse`), "Bulet kofanger"));
    await assertSucceeds(set(ref(db, `${post}/underskrift`), UNDERSKRIFT));
    /* Efter: intet mere. */
    await assertFails(set(ref(db, `${post}/skadeBeskrivelse`), "Ikke så slemt endda"));
    await assertFails(set(ref(db, `${post}/modpart`), { navn: "En anden" }));
  });

  it("kræver navn og tidspunkt på en underskrift", async () => {
    const db = medPerms("s5", SKRIVER);
    for (const felt of ["navn", "ms"]) {
      const uden = { ...UNDERSKRIFT };
      delete uden[felt];
      await assertFails(
        set(ref(db, sti(`sensitive/indberetninger/i-u-${felt}/underskrift`)), uden));
    }
  });

  /**
   * ⚠ OG HALVDELEN AF EN SPÆRRING ER EN NY FEJL.
   *
   * Da den klassificerede post blev frosset, kunne HOVEDPOSTEN stadig slettes
   * af sin ejer — og de to ligger på det SAMME id. Resultatet ville være et
   * bevis der peger på ingenting: en underskrift der ikke kan fjernes, på en
   * skade ingen kan finde igen. Før spærringen kunne begge dele slettes, og
   * de var i det mindste enige.
   *
   * ⚠ EN USKREVEN POST MÅ STADIG TRÆKKES TILBAGE. `FORLOEB` har ingen
   * `annulleret`, så uden det ville en fejloprettet indberetning stå for
   * altid. Det er sletning af et BEVIS der er lukket, ikke sletning.
   */
  it("⚠ EN UNDERSKREVET INDBERETNING KAN IKKE SLETTES — BEVISET BLIVER FORÆLDRELØST", async () => {
    const ejer = medPerms("s7", [PERM.indberetningerSkriv]);
    const begge = medPerms("s7", SKRIVER);

    /* ⚠ TILFØJET 2026-09-05 — begge poster seedes først (en frisk oprettelse
       kræver nu indberetningIndsend()); resten af prøven — at ejeren kan
       redigere/slette sin egen ikke-underskrevne post, men ikke en
       underskrevet — er uændret og gælder på REDIGERINGEN. */
    /* Uden underskrift: ejeren må trække sin egen post tilbage. */
    await seedPost("i-fjern", "s7");
    await assertSucceeds(set(ref(ejer, sti("indberetninger/i-fjern")), POST({ oprettetAf: "s7" })));
    await assertSucceeds(remove(ref(ejer, sti("indberetninger/i-fjern"))));

    /* Med underskrift: nej. */
    await seedPost("i-bevis", "s7");
    await assertSucceeds(set(ref(ejer, sti("indberetninger/i-bevis")), POST({ oprettetAf: "s7" })));
    await assertSucceeds(
      set(ref(begge, sti("sensitive/indberetninger/i-bevis/underskrift")), UNDERSKRIFT));
    await assertFails(remove(ref(ejer, sti("indberetninger/i-bevis"))));

    /* Men den må stadig RETTES — et forløb skal kunne skride frem. */
    await assertSucceeds(
      update(ref(ejer, sti("indberetninger/i-bevis")), { forloeb: "vurderet" }));
  });

  it("afviser et ukendt felt i satellitten", async () => {
    await assertFails(set(ref(medPerms("s6", SKRIVER), sti("sensitive/indberetninger/i-x")),
      { politiRapport: "ja" }));
  });

  it("ordlisterne bor i modulet, ikke i regelfilen", () => {
    /* Samme begrundelse som lagre.metode: en afskrift i reglerne ville være
       et andet sted ordlisten stod, med sin egen udrulningscyklus. */
    const regler = readFileSync("firebase.rules.json", "utf8");
    const blok = regler.slice(regler.indexOf('"indberetninger": {'));
    for (const ord of [...ALLE_ARTER, ...ALLE_FORLOEB]) {
      assert.ok(!blok.slice(0, 4000).includes(`|${ord}|`),
        `"${ord}" er skrevet af ind i regelfilen`);
    }
    assert.ok(ALLE_ARTER.length >= 4 && ALLE_FORLOEB.length === 6);
  });
});

describe("⚠ SKIVE 3B — ingenOmkostning ER ET OBJEKT, IKKE ET FLUESKIN", () => {
  /* Her stod ".validate": "newData.isBoolean()" — mens kanAfslutte() i
     indberetninger.js hele tiden har læst `ingenOmkostning.begrundelse`, og
     demo-indberetninger.js allerede skrev formen { begrundelse, af, ms }.
     Reglen var den ene brik der ikke fulgte med: en bruger der prøvede at
     afslutte uden omkostning, kunne ALDRIG skrive den begrundelse
     kanAfslutte() krævede. */
  const SKRIVER = [PERM.indberetningerSkriv, PERM.indberetningerSkrivAlle];

  it("afviser nu den gamle boolean-form", async () => {
    await seedPost("i-bool", "b1");
    await assertFails(set(ref(medPerms("b1", SKRIVER), sti("indberetninger/i-bool")),
      POST({ oprettetAf: "b1", ingenOmkostning: true })));
  });

  it("tager et objekt med en begrundelse", async () => {
    await seedPost("i-obj", "b2");
    await assertSucceeds(set(ref(medPerms("b2", SKRIVER), sti("indberetninger/i-obj")),
      POST({ oprettetAf: "b2", ingenOmkostning: { begrundelse: "Dækket af garantien" } })));
  });

  it("kræver begrundelsen — et objekt uden den afvises", async () => {
    /* ⚠ ET TOMT OBJEKT ER IKKE DEN RIGTIGE PRØVE — RTDB skriver aldrig et
       tomt objekt; en skrivning uden børn er en no-op, og assertFails ville
       fejle af den forkerte grund. Objektet skal have ET barn der ikke er
       begrundelse, for at ramme hasChildren(['begrundelse']) selv. */
    await seedPost("i-tom", "b3");
    await assertFails(set(ref(medPerms("b3", SKRIVER), sti("indberetninger/i-tom")),
      POST({ oprettetAf: "b3", ingenOmkostning: { af: "uid-x" } })));
  });

  it("tager af/ms — kontorets afgørelse og hvornår", async () => {
    await seedPost("i-afms", "b4");
    await assertSucceeds(set(ref(medPerms("b4", SKRIVER), sti("indberetninger/i-afms")),
      POST({
        oprettetAf: "b4",
        ingenOmkostning: { begrundelse: "Kørt på eget værksted", af: "uid-jorn", ms: 1786912716050 },
      })));
  });

  it("afviser et ukendt felt i ingenOmkostning", async () => {
    await seedPost("i-ekstra", "b5");
    await assertFails(set(ref(medPerms("b5", SKRIVER), sti("indberetninger/i-ekstra")),
      POST({ oprettetAf: "b5", ingenOmkostning: { begrundelse: "X", forsikringssag: "12345" } })));
  });
});

describe("prioriteten på en indberetning", () => {
  /* ⚠ SAMME TRE TRIN SOM PÅ opgaver/. Driftskalenderen viser de to noder
     side om side i den samme kø — havde de hver sit ordforråd, kunne
     kasserne ikke summere dem. */

  it("tager hvert af de tre trin", async () => {
    const db = medPerms("uid-lars", ["indberetninger.skriv"]);
    for (const p of ALLE_PRIORITETER) {
      /* ⚠ TILFØJET 2026-09-05 — seedet først, se seedPost()'s note. */
      await seedPost(`pri-${p}`, "uid-lars");
      await assertSucceeds(set(ref(db, sti(`indberetninger/pri-${p}`)),
        POST({ oprettetAf: "uid-lars", prioritet: p })));
    }
  });

  it("⚠ AFVISER \"mellem\" — det er labelet, ikke værdien", async () => {
    await seedPost("pri-label", "uid-lars");
    await assertFails(set(ref(medPerms("uid-lars", ["indberetninger.skriv"]),
      sti("indberetninger/pri-label")),
      POST({ oprettetAf: "uid-lars", prioritet: "mellem" })));
  });

  it("⚠ EN CHAUFFØRS INDBERETNING HAR INGEN PRIORITET — og skal kunne gemmes", async () => {
    /* Det er hele grunden til at feltet er valgfrit. Chaufføren melder at
       motorlampen lyser; om det haster, afgør værkføreren. Krævede reglen
       feltet, ville chaufføren blive tvunget til at vurdere noget han ikke
       kan vurdere — og "Mellem" ville stå på alt.
       ⚠ TILFØJET 2026-09-05 — seedet først (se seedPost()'s note); "pri-uden"
       ender stadig UDEN prioritet, som de to næste prøver bygger videre på. */
    await seedPost("pri-uden", "uid-lars");
    await assertSucceeds(set(ref(medPerms("uid-lars", ["indberetninger.skriv"]),
      sti("indberetninger/pri-uden")), POST({ oprettetAf: "uid-lars" })));
  });

  it("værkføreren kan sætte den bagefter", async () => {
    /* Triagen er en RETTELSE af chaufførens post, og den kræver
       indberetninger.skrivAlle — ejerskabstjekket i .write sammenligner
       oprettetAf med auth.uid, og værkføreren er ikke chaufføren. */
    await assertSucceeds(update(ref(medPerms("uid-vaerkfoerer",
      ["indberetninger.skriv", "indberetninger.skrivAlle"]),
      sti("indberetninger/pri-uden")), { prioritet: "hoej" }));
  });

  it("⚠ OG CHAUFFØREN KAN IKKE SÆTTE DEN PÅ EN KOLLEGAS POST", async () => {
    /* Prioriteten ændrer ikke ejerskabsreglen. Uden skrivAlle er en
       fremmed post lukket, uanset hvilket felt man rører. */
    await assertFails(update(ref(medPerms("uid-anden", ["indberetninger.skriv"]),
      sti("indberetninger/pri-uden")), { prioritet: "lav" }));
  });
});

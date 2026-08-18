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
import { ref, set, get, update } from "firebase/database";
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
  art: "koeretoejsskade", forloeb: "ny", division: "gods",
  oprettetAf: "uid-lars", oprettetMs: 1786912716050,
  koeretoejId: KT, beskrivelse: "Bulet kofanger ved rampe 3",
  ...o,
});

const UNDERSKRIFT = {
  navn: "Preben Sørensen",
  billedeSti: "underskrifter/ind-001.png",
  stedTekst: "Rampe 4, Bornholms Mejeri",
  ms: 1786912777755,
};

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
    /* ⚠ oprettetAf SKAL VAERE SKRIVERENS EGET uid. Foerste udgave af proeven
       skrev "uid-lars" som en vilkaarlig streng — og det gik igennem, fordi
       ejerskabet kun blev proevet ved REDIGERING. Se proeven nedenfor. */
    await assertSucceeds(set(ref(medPerms("u1", [PERM.indberetningerSkriv]),
      sti("indberetninger/i-ok")), POST({ oprettetAf: "u1" })));
  });

  it("kræver art, forløb, division, oprettetAf og oprettetMs", async () => {
    /* Noden validerede KUN division. En art vi ikke kender, et forløb der
       ikke findes, en tid der mangler: alt blev taget imod. */
    const db = medPerms("u2", [PERM.indberetningerSkriv]);
    for (const felt of ["art", "forloeb", "division", "oprettetAf", "oprettetMs"]) {
      const uden = POST({ oprettetAf: "u2" });
      delete uden[felt];
      await assertFails(set(ref(db, sti(`indberetninger/mangler-${felt}`)), uden));
    }
  });

  it("⚠ oprettetAf ER ET uid — og reglen sammenligner med auth.uid", async () => {
    /* Bytter man uid og personId, holder ejerskabstjekket op med at virke:
       et personId matcher aldrig et uid, og så kan ingen chauffør rette sin
       egen post. Prøven her viser at feltet ER det reglen læser. */
    const ch = somRolle("uid-ch", "chauffoer");
    await assertSucceeds(
      set(ref(ch, sti("indberetninger/i-egen")), POST({ oprettetAf: "uid-ch" })));
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
      await assertFails(set(ref(db, sti(`indberetninger/klas-${felt}`)),
        POST({ oprettetAf: "u3", [felt]: felt === "modpart" ? { navn: "X" } : "noget" })));
    }
  });

  it("afviser et ukendt felt", async () => {
    await assertFails(set(ref(medPerms("u4", [PERM.indberetningerSkriv]), sti("indberetninger/i-ekstra")),
      POST({ oprettetAf: "u4", forsikringssum: 1 })));
  });

  it("⚠ EN OMKOSTNING ER HELE ØRE", async () => {
    const db = medPerms("u5", [PERM.indberetningerSkriv]);
    await assertSucceeds(set(ref(db, sti("indberetninger/i-oere")),
      POST({ oprettetAf: "u5", omkostningOere: 184500 })));
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

  it("kræver navn og tidspunkt på en underskrift", async () => {
    const db = medPerms("s5", SKRIVER);
    for (const felt of ["navn", "ms"]) {
      const uden = { ...UNDERSKRIFT };
      delete uden[felt];
      await assertFails(
        set(ref(db, sti(`sensitive/indberetninger/i-u-${felt}/underskrift`)), uden));
    }
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

describe("prioriteten på en indberetning", () => {
  /* ⚠ SAMME TRE TRIN SOM PÅ opgaver/. Driftskalenderen viser de to noder
     side om side i den samme kø — havde de hver sit ordforråd, kunne
     kasserne ikke summere dem. */

  it("tager hvert af de tre trin", async () => {
    const db = medPerms("uid-lars", ["indberetninger.skriv"]);
    for (const p of ALLE_PRIORITETER) {
      await assertSucceeds(set(ref(db, sti(`indberetninger/pri-${p}`)),
        POST({ oprettetAf: "uid-lars", prioritet: p })));
    }
  });

  it("⚠ AFVISER \"mellem\" — det er labelet, ikke værdien", async () => {
    await assertFails(set(ref(medPerms("uid-lars", ["indberetninger.skriv"]),
      sti("indberetninger/pri-label")),
      POST({ oprettetAf: "uid-lars", prioritet: "mellem" })));
  });

  it("⚠ EN CHAUFFØRS INDBERETNING HAR INGEN PRIORITET — og skal kunne gemmes", async () => {
    /* Det er hele grunden til at feltet er valgfrit. Chaufføren melder at
       motorlampen lyser; om det haster, afgør værkføreren. Krævede reglen
       feltet, ville chaufføren blive tvunget til at vurdere noget han ikke
       kan vurdere — og "Mellem" ville stå på alt. */
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

/* test/ansoegning-afgoer.test.mjs
 * At afgøre en frihedsansøgning — B2, V1-stabiliseringsauditens anden
 * BLOCKER.
 *
 * HVORFOR FILEN FINDES. Chaufførappens "Anmod om frihed" kunne skrive en
 * ansøgning siden beslutning 108 — men intet kontor-vendt sted kunne se
 * eller besvare den: `Fravaer.jsx` viste kun REGISTREREDE fravær, og der
 * fandtes ingen serverfunktion der kunne godkende eller afvise. Skærmens
 * egen tekst lovede "Kontoret svarer her i appen", uden at det var sandt.
 *
 * Samme mønster som opgavestatus.test.mjs: den rene maskine
 * (kanAfgoereAnsoegning, ANSOEGNING_OVERGANGE) prøves i fravaer.test.mjs
 * uden en emulator. Denne fil læser functions/index.js og skærmene som
 * tekst, og prøver at HÅNDHÆVELSEN faktisk kalder den samme maskine —
 * ikke en afskrift.
 *
 * Koer: npm test
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   HÅNDHÆVELSEN — functions/index.js
   ══════════════════════════════════════════════════════════════════════════ */

const kilde = readFileSync("functions/index.js", "utf8");
const blok = (() => {
  const start = kilde.indexOf("export const ansoegningAfgoer");
  assert.ok(start >= 0, "functions/index.js har ingen ansoegningAfgoer");
  const naeste = kilde.indexOf(String.fromCharCode(10) + "export const ", start + 1);
  return naeste < 0 ? kilde.slice(start) : kilde.slice(start, naeste);
})();

const udenKommentarer = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("ansoegningAfgoer håndhæver den samme maskine som skærmen tegner", () => {
  test("⚠ KALDER kanAfgoereAnsoegning(), ikke en afskrift", () => {
    assert.ok(blok.includes("kanAfgoereAnsoegning("), "maskinen prøves ikke");
    assert.ok(!blok.includes("ANSOEGNING_OVERGANGE"),
      "funktionen har sin egen kopi af tilstandsmaskinen — den skal ligge ét sted");
  });

  test("⚠ GATEN ER fravaer.skriv — DEN SAMME SOM REGLEN SKELNER PÅ", () => {
    /* Præcis den permission der allerede skiller "kontorets gren" fra
       "chaufførens gren" i firebase.rules.json's .write på fravaer/$id
       (se rules.ansoegning.test.mjs). Chaufføren har den ikke:
       chauffoer: [...BASIS_LAES, PERM.indberetningerSkriv]. */
    assert.match(blok, /perms\.includes\("\|fravaer\.skriv\|"\)/);
    assert.ok(!/rolle === "(admin|koordinator|disponent)"/.test(blok),
      "der spørges på rollen frem for på permissionen");
  });

  test("⚠ TENANT, ABONNEMENT OG bemanding-MODULET PRØVES", () => {
    assert.ok(blok.includes('child("_findes")'), "tenanten prøves ikke");
    assert.ok(blok.includes('child("abonnement/status")'), "abonnementet prøves ikke");
    assert.ok(blok.includes('moduler.child("bemanding")'),
      "modulspærringen prøves ikke, eller spørger om det forkerte modul");
  });

  test("⚠ TENANTEN KOMMER FRA TOKENET, IKKE FRA KLIENTEN", () => {
    /* Cross-tenant adgang: rod bygges af auth.token.tenant, og fravaerId
       slås kun op under DEN tenant — et id fra en anden tenant giver derfor
       altid not-found, aldrig et hit. */
    assert.match(blok, /const tenantId = auth\.token\?\.tenant/);
    assert.ok(!/tenantId\s*=\s*d\.tenantId/.test(blok),
      "tenantId læses fra klienten");
  });

  test("⚠ KUN fravaerId, status OG svar LÆSES FRA KLIENTEN", () => {
    /* Medarbejder og periode må IKKE kunne manipuleres under behandlingen —
       de skal komme fra `foer`, den post der allerede står i basen. */
    assert.match(blok, /kortStreng\(d\.fravaerId/);
    assert.match(blok, /kortStreng\(d\.status/);
    assert.ok(!/d\.personId/.test(blok), "personId læses fra klienten");
    assert.ok(!/d\.fra\b/.test(blok), "fra læses fra klienten");
    assert.ok(!/d\.til\b/.test(blok), "til læses fra klienten");
  });

  test("⚠ PERIODEN OG PERSONEN KOMMER FRA foer, IKKE FRA KLIENTEN", () => {
    assert.ok(blok.includes("reservationFraFravaer({ ...foer, id: fravaerId })"),
      "reservationen bygges ikke af den post der allerede står i basen");
  });

  test("⚠ ALT LANDER I ÉN rod.update()", () => {
    /* Status og reservationens følge sammen eller slet ikke — landede kun
       den ene halvdel, kunne en godkendt ansøgning stå uden reservation,
       eller omvendt. Samme begrundelse som opgavestatus/opgaveplanlaeg. */
    assert.equal((blok.match(/await rod\.update\(/g) || []).length, 1,
      "der skrives i mere end ét kald");
  });

  test("⚠ RESERVATIONENS ID ER UDLEDT AF fravaerId, IKKE EN NY push()-NØGLE", () => {
    /* Samme greb som res-${opgaveId}: to godkendelser af samme ansøgning
       skriver til DEN SAMME nøgle i stedet for at oprette to poster. */
    assert.ok(blok.includes("`res-${fravaerId}`"),
      "reservationens id er ikke udledt af fravaerId");
    assert.ok(!/reservationer.*\.push\(\)/.test(udenKommentarer(blok)),
      "reservationen får en ny push-nøgle i stedet for en udledt");
  });

  test("⚠ KUN godkendt SKRIVER EN RESERVATION", () => {
    const b = udenKommentarer(blok);
    const idxGren = b.indexOf('tilStatus === "godkendt"');
    assert.ok(idxGren >= 0, "reservationsgrenen er ikke betinget af tilStatus");
    const idxSkriv = b.indexOf("reservationer/${ny.ressourceType}");
    assert.ok(idxSkriv > idxGren,
      "reservationen skrives uden for godkendt-grenen");
  });

  test("⚠ LEDIGHEDEN PRØVES MED tjekLedigMod, SAMME SOM DE ANDRE KILDER", () => {
    assert.ok(blok.includes("tjekLedigMod("), "ledigheden prøves ikke");
    assert.ok(blok.includes("failed-precondition"),
      "en optaget medarbejder giver ikke et svar");
  });

  test("⚠ FORMEN PRØVES MED valideAnsoegning() — SAMME SOM SKÆRMEN", () => {
    assert.ok(blok.includes("valideAnsoegning("), "formen prøves ikke");
  });

  test("⚠ AFGØRELSEN LOGGES som et tilstandsskift", () => {
    assert.ok(blok.includes("logFravaer("), "afgørelsen logges ikke");
    assert.ok(blok.includes("AUDIT.tilstandsskift"),
      "afgørelsen logges som noget andet end et tilstandsskift");
  });

  test("⚠ afgjortAf OG afgjortMs SÆTTES AF SERVEREN, IKKE AF KLIENTEN", () => {
    const b = udenKommentarer(blok);
    assert.ok(b.includes("afgjortAf: uid"), "afgjortAf sættes ikke fra serverens egen uid");
    assert.ok(b.includes("afgjortMs: nu"), "afgjortMs sættes ikke fra serverens egen tid");
    assert.ok(!/d\.afgjortAf|d\.afgjortMs/.test(b),
      "afgjortAf eller afgjortMs læses fra klienten");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   SKÆRMEN — kontorets kanoniske hjem, Workforce → Ferie & fravær
   ══════════════════════════════════════════════════════════════════════════ */

describe("Fravaer.jsx afgør gennem serveren, ikke selv", () => {
  const skaerm = readFileSync("src/moduler/Fravaer.jsx", "utf8");
  const transport = readFileSync("src/fleet/fravaerplan.js", "utf8");

  test("⚠ SKÆRMEN KALDER afgoerAnsoegning(), IKKE db.ref DIREKTE", () => {
    const s = udenKommentarer(skaerm);
    assert.ok(s.includes("afgoerAnsoegning("), "skærmen kalder ikke serveren");
    assert.ok(s.includes('from "../fleet/fravaerplan.js"'),
      "transporten hentes ikke fra den delte klientfil");
    assert.ok(!/db\.ref\(/.test(s), "skærmen skriver ansøgningen uden om serveren");
  });

  test("⚠ TRANSPORTEN KALDER kaldFunktion(\"ansoegningAfgoer\")", () => {
    assert.ok(transport.includes('kaldFunktion(AFGOERFUNKTION'));
    assert.match(transport, /AFGOERFUNKTION = "ansoegningAfgoer"/);
    assert.ok(!/db\.ref\(/.test(transport), "transporten skriver selv");
  });

  test("⚠ INGEN NYT TOPNIVEAUPUNKT — det er stadig Workforce", () => {
    /* Ruten skal fortsat være /bemanding/fravaer. En separat HR-app eller et
       nyt menupunkt ville modsige "Byg IKKE en separat HR-app". */
    const nav = readFileSync("src/fleet/nav.js", "utf8");
    assert.match(nav, /sti: "\/bemanding\/fravaer"/);
    assert.ok(!/\/hr\b|\/frihed\b/i.test(nav), "der er sneget sig et nyt topniveaupunkt ind");
  });

  test("⚠ KØEN VISES KUN FOR maaSkrive", () => {
    const s = udenKommentarer(skaerm);
    const idxKoe = s.indexOf("Anmodninger om frihed");
    assert.ok(idxKoe >= 0, "arbejdskøen findes ikke");
    /* Betingelsen skal stå FØR overskriften i JSX-træet — {maaSkrive && (<Kort … */
    const foer = s.slice(Math.max(0, idxKoe - 400), idxKoe);
    assert.match(foer, /maaSkrive && \(/);
  });

  test("⚠ MEDARBEJDER OG PERIODE SENDES IKKE MED HERFRA", () => {
    /* Kaldet må kun sende fravaerId, status og svar — samme kontrol som på
       serveren, set fra den anden ende. */
    const t = udenKommentarer(transport);
    const kald = t.slice(t.indexOf("kaldFunktion(AFGOERFUNKTION"), t.indexOf("kaldFunktion(AFGOERFUNKTION") + 200);
    assert.ok(!/personId|fra:|til:/.test(kald),
      "transporten sender personId eller periode med");
  });
});

/* test/skive3b-indberetningstriage.test.mjs
 * Skive 3B — Fleet Indberetningstriage.
 *
 * ⚠ SAMME METODE SOM test/opgaveplan.test.mjs' "HÅNDHÆVELSEN". At funktionerne
 * findes er ikke det samme som at de håndhæver noget: anden halvdel her læser
 * functions/index.js SOM TEKST og spørger om håndhævelsen — at
 * indberetningTriage og den udvidede opgaveplanlaeg rent faktisk kalder de
 * samme FORLOEB/kanSkifteTil()/kanAfslutte() som skærmen viser, at
 * permissionen er den narrow indberetninger.skrivAlle og ikke den brede
 * indberetninger.skriv, at ingen andre felter på indberetninger kan ændres
 * herfra, og at intet slettes.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  FORLOEB, kanSkifteTil, kanAfslutte, ALLE_FORLOEB,
} from "../src/fleet/indberetninger.js";
import { PERM, ROLLE_PERMS } from "../src/fleet/permissions.js";
import { DELTE_FILER } from "../scripts/kopier-delt.mjs";
import { udenKommentarer } from "./kode.mjs";

/* ══════════════════════════════════════════════════════════════════════════
   1. DEN EKSISTERENDE STATUSMODEL RÆKKER — INGEN NY TILSTANDSMASKINE
   ══════════════════════════════════════════════════════════════════════════ */
describe("FORLOEB udtrykker triageforløbet uden ændring", () => {
  it("⚠ ny → vurderet/næste handling → evt. planlagt → afsluttet", () => {
    /* Sætningen fra opgavebeskrivelsen, afprøvet ord for ord mod den
       EKSISTERENDE maskine. Ingen ny tilstand tilføjet i denne skive. */
    assert.equal(kanSkifteTil("ny", "vurderet"), true);
    assert.equal(kanSkifteTil("ny", "afsluttet"), true);
    assert.equal(kanSkifteTil("vurderet", "planlagt"), true);
    assert.equal(kanSkifteTil("vurderet", "afsluttet"), true);
    assert.equal(kanSkifteTil("planlagt", "afsluttet"), true);
    assert.equal(ALLE_FORLOEB.length, 6, "seks tilstande, uændret");
  });

  it("⚠ EN INDBERETNING KAN IKKE PLANLÆGGES FØR DEN ER VURDERET", () => {
    /* "ny" springer IKKE direkte til "planlagt" — kontoret skal først sætte
       den på afvent. Det er ikke en begrænsning denne skive opfinder; det
       stod allerede i FORLOEB.ny.naeste, som ikke indeholder "planlagt". */
    assert.equal(kanSkifteTil("ny", "planlagt"), false);
    assert.ok(!FORLOEB.ny.naeste.includes("planlagt"));
  });

  it("⚠ EN UDGIFTSREGISTRERING (intet forløb) AFVISES OVERALT", () => {
    /* undefined/null har ingen naeste — kanSkifteTil() fejler lukket,
       samme som på en ukendt streng. En tankning kan derfor ikke "triageres"
       via denne maskine, hvilket er korrekt: den har intet forløb at følge. */
    assert.equal(kanSkifteTil(undefined, "vurderet"), false);
    assert.equal(kanSkifteTil(undefined, "afsluttet"), false);
    assert.equal(kanSkifteTil(null, "afsluttet"), false);
  });

  it("afsluttet er en endestation", () => {
    assert.deepEqual(FORLOEB.afsluttet.naeste, []);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. PERMISSION-GATEN — indberetninger.skrivAlle, IKKE indberetninger.skriv
   ══════════════════════════════════════════════════════════════════════════ */
describe("permission-gaten skelner chaufføren fra kontortriagen", () => {
  it("⚠ CHAUFFØREN HAR KUN indberetninger.skriv", () => {
    assert.ok(ROLLE_PERMS.chauffoer.includes(PERM.indberetningerSkriv));
    assert.ok(!ROLLE_PERMS.chauffoer.includes(PERM.indberetningerSkrivAlle),
      "chaufføren må ikke kunne triagere — hverken sin egen eller andres");
  });

  it("⚠ KOORDINATOREN HAR indberetningerSkrivAlle — samme snit som sensitiveLaes", () => {
    /* Deliberat valg i denne skive, dokumenteret i permissions.js: samme
       rolle der allerede fik indberetningerSensitiveLaes (den der lukker
       sagen og håndterer fakturaen) er den der reelt kan triagere. Uden
       den her tildeling kunne KUN admin bruge funktionen i praksis. */
    assert.ok(ROLLE_PERMS.koordinator.includes(PERM.indberetningerSkrivAlle));
  });

  it("ingen anden driftsrolle end koordinator fik den ved siden af", () => {
    for (const rolle of ["casehandler", "disponent", "lagermedarbejder", "revisor"]) {
      assert.ok(!ROLLE_PERMS[rolle].includes(PERM.indberetningerSkrivAlle), rolle);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. HÅNDHÆVELSEN I functions/index.js
   ══════════════════════════════════════════════════════════════════════════ */
const kilde = readFileSync("functions/index.js", "utf8");

const blokFra = (naerNavn) => {
  const start = kilde.indexOf(`export const ${naerNavn}`);
  assert.ok(start >= 0, `functions/index.js har ingen ${naerNavn}`);
  const naeste = kilde.indexOf(String.fromCharCode(10) + "export const ", start + 1);
  return naeste < 0 ? kilde.slice(start) : kilde.slice(start, naeste);
};

const triageBlok = blokFra("indberetningTriage");
const planBlok = blokFra("opgaveplanlaeg");

describe("indberetningTriage håndhæver det skærmen viser", () => {
  it("⚠ GATEN ER indberetninger.skrivAlle — ikke indberetninger.skriv", () => {
    assert.match(triageBlok, /perms\.includes\("\|indberetninger\.skrivAlle\|"\)/);
    /* Og IKKE alene på .skriv — chaufføren har den permission for sine
       egne poster, og triage må ikke kunne udføres af ham. */
    const foersteTjek = triageBlok.slice(0, triageBlok.indexOf("getDatabase()"));
    assert.ok(!/perms\.includes\("\|indberetninger\.skriv\|"\)/.test(foersteTjek),
      "funktionen gater (også) på den brede indberetninger.skriv");
  });

  it("⚠ PERMISSIONEN, IKKE ROLLEN", () => {
    assert.ok(!/rolle === "(admin|koordinator)"/.test(triageBlok),
      "der spørges på rollen frem for på permissionen");
  });

  it("⚠ ABONNEMENT, MODUL OG TENANT PRØVES", () => {
    assert.ok(triageBlok.includes('child("_findes")'));
    assert.ok(triageBlok.includes('child("abonnement/status")'));
    assert.ok(triageBlok.includes('child("flaade")'));
  });

  it("⚠ SAMME MASKINE SOM SKÆRMEN — kanSkifteTil()", () => {
    assert.ok(triageBlok.includes("kanSkifteTil("), "der prøves ikke mod FORLOEB");
    assert.ok(kilde.includes('from "./delt/indberetninger.js"'),
      "indberetninger.js importeres ikke fra delt/");
  });

  it("⚠ DEN ER I DELTE_FILER — ellers fejler den ved DEPLOY", () => {
    assert.ok(DELTE_FILER.includes("indberetninger.js"));
  });

  it("⚠ SAMME kanAfslutte() SOM \"Afslut\"-KNAPPEN VISTE", () => {
    assert.ok(triageBlok.includes("kanAfslutte("),
      "afslutning prøves ikke mod den delte pengeside-kontrol");
  });

  it("⚠ REGRESSION: kanAfslutte() SER POSTEN SOM DEN ER NU, IKKE MÅLET", () => {
    /* FUNDET VED DEV-VERIFIKATION, IKKE ANTAGET. Første udgave byggede
       `{ ...foer, forloeb: "afsluttet", ... }` FØR den kaldte kanAfslutte() —
       og kanAfslutte()'s eget første tjek er `forloeb === "afsluttet"`. Enhver
       lovlig afslutning blev derfor afvist med "allerede afsluttet", MÅLT i
       DEV: en indberetning i "planlagt" kunne aldrig lukkes med en gyldig
       begrundelse. Prøven læser koden: objektet der sendes til kanAfslutte()
       må ikke selv sætte forloeb til "afsluttet". */
    assert.ok(!/forloeb:\s*["']afsluttet["']/.test(triageBlok),
      "forloeb sættes til \"afsluttet\" i et udkast FØR kanAfslutte() kaldes");
  });

  it("⚠ KUN TO MÅL — \"planlagt\" GÅR GENNEM opgaveplanlaeg", () => {
    /* Se opgaveplanlaeg-testene nedenfor: at oprette en driftsopgave OG
       koble indberetningen er én handling, og de to skal lande i ÉN
       update() — ikke splittes over to uafhængige serverfunktioner. */
    assert.match(kilde, /TRIAGE_MAAL\s*=\s*\["vurderet",\s*"afsluttet"\]/);
    assert.ok(!/opgaver\//.test(udenKommentarer(triageBlok)),
      "indberetningTriage rører opgaver/ — det er opgaveplanlaegs arbejde");
  });

  it("⚠ KUN forloeb OG ingenOmkostning KAN SKRIVES — intet andet felt", () => {
    /* Alle skrivestier i denne funktion, læst af som tekst. En sjette sti
       ville betyde at funktionen kunne røre noget triage ikke må. */
    const stier = [...triageBlok.matchAll(/opdatering\[`indberetninger\/\$\{id\}\/([a-zA-Z]+)`\]/g)]
      .map((m) => m[1]);
    assert.ok(stier.length >= 1);
    for (const felt of stier) {
      assert.ok(["forloeb", "ingenOmkostning"].includes(felt),
        `triage skriver til "${felt}", som ikke er forloeb eller ingenOmkostning`);
    }
  });

  it("⚠ OPRINDELIGE FELTER BEVARES — ingen skrivning til dem", () => {
    for (const felt of ["oprettetAf", "oprettetMs", "koeretoejId", "beskrivelse", "art"]) {
      assert.ok(!triageBlok.includes(`indberetninger/\${id}/${felt}\``),
        `triage rører ${felt}`);
    }
  });

  it("⚠ INGEN SLETNING — historikken og posten bevares", () => {
    assert.ok(!/\.remove\(/.test(triageBlok), "funktionen sletter");
    assert.ok(!/:\s*null\b/.test(udenKommentarer(triageBlok)),
      "funktionen nuller et felt ud");
  });

  it("⚠ SERVEREN SÆTTER af/ms — IKKE KLIENTEN", () => {
    assert.match(triageBlok, /af:\s*uid/);
    assert.match(triageBlok, /ms:\s*Date\.now\(\)/);
    assert.ok(!/d\.af\b/.test(triageBlok), "af tages fra klienten");
  });

  it("⚠ AUDITLOGGES EFTER SAMME MØNSTER SOM opgaver", () => {
    assert.ok(triageBlok.includes("logIndberetning("));
    assert.ok(triageBlok.includes("AUDIT.tilstandsskift"));
  });

  it("⚠ ÉN update() — ATOMISK", () => {
    assert.equal((triageBlok.match(/await rod\.update\(/g) || []).length, 1);
    assert.ok(!/\.set\(/.test(triageBlok));
  });
});

describe("opgaveplanlaeg kobler indberetningId — beslutning 109 fuldført", () => {
  it("⚠ SAMME NARROWE PERMISSION VED KOBLINGEN", () => {
    assert.match(planBlok, /perms\.includes\("\|indberetninger\.skrivAlle\|"\)/);
  });

  it("⚠ SAMME kanSkifteTil() FØR OPGAVEN OPRETTES", () => {
    assert.ok(planBlok.includes("kanSkifteTil(indberetningFoer.forloeb"));
  });

  it("⚠ STADIG ÉN update() — koblingen lander i den SAMME opdatering", () => {
    /* Regressionstest for det eksisterende opgaveplan.test.mjs's krav om
       ÉN update(): tilføjelsen må ikke lægge et kald mere. */
    assert.equal((planBlok.match(/await rod\.update\(/g) || []).length, 1,
      "der skrives i mere end ét kald");
    const tilUpdate = planBlok.slice(0, planBlok.indexOf("await rod.update(opdatering)"));
    assert.ok(tilUpdate.includes("opdatering[`indberetninger/${indberetningId}/forloeb`]"));
  });

  it("⚠ KOBLINGEN AUDITLOGGES OGSÅ", () => {
    assert.ok(planBlok.includes("logIndberetning("));
  });
});

describe("klienten skriver ikke uden om serveren (indberetningplan.js)", () => {
  const klient = readFileSync("src/fleet/indberetningplan.js", "utf8");

  it("⚠ INGEN db.ref() — vejen går gennem funktionen", () => {
    assert.ok(!/db\.ref\(|\.set\(|\.update\(/.test(klient), "der skrives direkte");
    assert.ok(klient.includes("kaldFunktion("));
  });

  it("⚠ KASTER ALDRIG", () => {
    assert.ok(klient.includes("try {") && klient.includes("catch (fejl)"));
    assert.ok(klient.includes("tolkPlanfejl(fejl)"));
  });

  it("⚠ FUNKTIONSNAVNET MATCHER functions/index.js", () => {
    const m = /TRIAGEFUNKTION = "([a-zA-Z]+)"/.exec(klient);
    assert.ok(m, "TRIAGEFUNKTION findes ikke");
    assert.ok(kilde.includes(`export const ${m[1]} = onCall`),
      `functions/index.js har ingen ${m[1]}`);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. Ingen parallel arbejdsgang — Planlaegdialog genbruges, ikke kopieres
   ══════════════════════════════════════════════════════════════════════════ */
describe("Planlæg aktivitet genbruger Fleets eksisterende motor", () => {
  const triageUi = readFileSync("src/fleet/Indberetningtriage.jsx", "utf8");
  const skaerm = readFileSync("src/moduler/flaade/Indberetninger.jsx", "utf8");

  it("⚠ INGEN SEPARAT \"INDBERETNINGSKALENDER\"", () => {
    assert.ok(!/Gitterkalender/.test(triageUi));
    assert.ok(!/ny.*kalender|kalender.*ny/i.test(triageUi));
  });

  it("⚠ SAMME Planlaegdialog-KOMPONENT SOM Fleet Driftskalender", () => {
    assert.ok(skaerm.includes('import Planlaegdialog from "../../fleet/Planlaegdialog.jsx"'));
    /* Ingen JSX-kopi af formularfelterne (enhed/type/status/varighed) her —
       kun forudfyldningen af foraf sendes med. */
    assert.ok(!/valgmuligheder=\{\[/.test(skaerm), "formularfelter er kopieret ind i skærmen");
  });

  it("⚠ FORUDFYLDNINGEN DÆKKER ENHED, HÆNDELSE OG PRIORITET", () => {
    assert.match(skaerm, /koeretoejId:\s*valgt\.koeretoejId/);
    assert.match(skaerm, /beskrivelse:\s*valgt\.beskrivelse/);
    assert.match(skaerm, /prioritet:\s*valgt\.prioritet/);
    assert.match(skaerm, /indberetningId:\s*valgt\.id/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. Afslut kræver pengesiden afklaret — samme kanAfslutte() overalt
   ══════════════════════════════════════════════════════════════════════════ */
describe("kanAfslutte() — pengesiden, prøvet mod den delte funktion", () => {
  const indb = (o = {}) => ({
    art: "reparation", forloeb: "afventerFaktura",
    oprettetAf: "uid-1", oprettetMs: 1, koeretoejId: "kt-1", ...o,
  });

  it("afvises uden omkostning, indkøb eller begrundelse", () => {
    assert.equal(kanAfslutte(indb()).ok, false);
  });

  it("tager en registreret omkostning uden begrundelse", () => {
    assert.equal(kanAfslutte(indb({ omkostningOere: 12500 })).ok, true);
  });

  it("⚠ TAGER \"INGEN OMKOSTNING\" — MEN KUN MED EN BEGRUNDELSE", () => {
    assert.equal(kanAfslutte(indb({ ingenOmkostning: { begrundelse: "  " } })).ok, false,
      "en tom begrundelse må ikke tælle som en begrundelse");
    assert.equal(
      kanAfslutte(indb({ ingenOmkostning: { begrundelse: "Dækket af garantien" } })).ok,
      true);
  });
});

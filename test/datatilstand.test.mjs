/* test/datatilstand.test.mjs
 * De tre datatilstande — og især at en afvisning ALDRIG bærer tal med sig.
 *
 * Testen er skrevet fordi det modsatte var tilfældet: useKpi og useListe
 * oversatte en permission-denied til demo-data med teksten "ingen forbindelse
 * til databasen". Reglerne virkede, og appen kaldte det et netværksproblem.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TILSTAND, dataTilstand, erAfvist, vaerste } from "../src/fleet/datatilstand.js";

const AFVIST_FEJL = { code: "PERMISSION_DENIED", message: "PERMISSION_DENIED: Permission denied" };
const NETVAERKSFEJL = { code: "NETWORK_ERROR", message: "Failed to fetch" };

describe("dataTilstand skiller de tre tilstande", () => {
  it("kalder det demo når der ikke er nogen database", () => {
    const t = dataTilstand({ harDb: false, harBruger: false });
    assert.equal(t.art, TILSTAND.demo);
    assert.equal(t.visDemo, true, "demo-mode er netop det tilfælde hvor demo-data er det rigtige svar");
  });

  it("kalder det uautentificeret når der er en database men ingen bruger", () => {
    const t = dataTilstand({ harDb: true, harBruger: false });
    assert.equal(t.art, TILSTAND.uautentificeret);
  });

  it("er ok når der er en bruger og ingen fejl", () => {
    const t = dataTilstand({ harDb: true, harBruger: true });
    assert.equal(t.art, TILSTAND.ok);
    assert.equal(t.visDemo, false);
  });
});

describe("En afvisning bærer aldrig tal med sig", () => {
  it("kalder en permission-denied for naegtet — ikke forbindelse", () => {
    const t = dataTilstand({ harDb: true, harBruger: true, fejl: AFVIST_FEJL });
    assert.equal(
      t.art, TILSTAND.naegtet,
      "en afvist læsning er reglerne der virker, ikke et netværksproblem"
    );
  });

  it("viser ALDRIG demo-data ved en afvisning", () => {
    const t = dataTilstand({ harDb: true, harBruger: true, fejl: AFVIST_FEJL });
    assert.equal(
      t.visDemo, false,
      "opdigtede tal oven på en afvisning er den fejl filen findes for at rette"
    );
  });

  it("skelner en almindelig fejl fra en afvisning", () => {
    const t = dataTilstand({ harDb: true, harBruger: true, fejl: NETVAERKSFEJL });
    assert.equal(t.art, TILSTAND.forbindelse);
    assert.equal(t.visDemo, false, "heller ikke en netværksfejl må fylde skærmen med tal");
  });
});

describe("Stilladset er fjernet, som beslutning 26 lovede", () => {
  /* ⚠ DEN HER PRØVE STOD OMVENDT.
     Indtil beslutning 27 gav `uautentificeret` demo-data i dev, fordi der
     ikke fandtes noget login-flow, og en tom app ville have betydet at nogen
     lavede en hurtig overstyring for at kunne arbejde. Fjernelsesbetingelsen
     stod skrevet: grenen skulle væk, når login landede.

     Den blev vendt om frem for slettet. At betingelsen faktisk blev indfriet
     — og kan ses indfriet — er det der gør den NÆSTE midlertidige gren
     troværdig. Slettes prøven, står der bare ingenting. */
  it("viser ikke demo-data ved uautentificeret, heller ikke i dev", () => {
    const t = dataTilstand({ harDb: true, harBruger: false });
    assert.equal(
      t.visDemo, false,
      "der findes nu en måde at logge ind på, og en dev-bruger der ikke er " +
      "logget ind er ikke længere en tilstand man skal kunne arbejde i"
    );
  });

  /* Ingen miljøparameter mere. Var der én, ville der være et sted at gøre
     undtagelsen igen. */
  it("kender ikke længere sit miljø", () => {
    const uden = dataTilstand({ harDb: true, harBruger: false });
    for (const miljoe of ["demo", "dev", "prod"]) {
      assert.deepEqual(
        dataTilstand({ harDb: true, harBruger: false, miljoe }), uden,
        `miljoe:"${miljoe}" ændrede svaret — så er der igen et sted at gøre undtagelsen`
      );
    }
  });

  it("viser kun demo-data hvor der ikke er en database at spørge", () => {
    const medDb = [
      dataTilstand({ harDb: true, harBruger: false }),
      dataTilstand({ harDb: true, harBruger: true }),
      dataTilstand({ harDb: true, harBruger: true, fejl: AFVIST_FEJL }),
      dataTilstand({ harDb: true, harBruger: true, fejl: NETVAERKSFEJL }),
    ];
    for (const t of medDb) assert.equal(t.visDemo, false, `${t.art} bar tal med sig`);
    assert.equal(dataTilstand({ harDb: false, harBruger: false }).visDemo, true);
  });
});

describe("erAfvist genkender de former RTDB bruger", () => {
  /* Rammer vi forbi, ender en afvisning som "forbindelse" — og så er vi
     delvist tilbage ved den fejl der skulle rettes. Derfor begge felter. */
  it("genkender afvisningen på code alene", () => {
    assert.equal(erAfvist({ code: "PERMISSION_DENIED" }), true);
  });

  it("genkender afvisningen på message alene", () => {
    assert.equal(erAfvist({ message: "permission_denied at /tenants/x: Client doesn't have permission" }), true);
  });

  it("genkender skrivemåden med bindestreg", () => {
    assert.equal(erAfvist({ code: "permission-denied" }), true);
  });

  it("tager ikke fejl af en almindelig fejl", () => {
    assert.equal(erAfvist(NETVAERKSFEJL), false);
    assert.equal(erAfvist(null), false);
    assert.equal(erAfvist({}), false);
  });
});

describe("vaerste vælger efter alvor, ikke efter rækkefølge", () => {
  const ok = { art: TILSTAND.ok, visDemo: false };
  const naegtet = { art: TILSTAND.naegtet, visDemo: false };
  const forbindelse = { art: TILSTAND.forbindelse, visDemo: false };

  /* Skærme som Medarbejdere og Kunder læser to noder. Den ene kan være
     afvist mens den anden går igennem — og så er det afvisningen brugeren
     skal se. Vælger man den første, afhænger beskeden af hvem der svarede
     hurtigst, og fejlen bliver umulig at genskabe. */
  it("lader en afvisning vinde over ok, uanset rækkefølge", () => {
    assert.equal(vaerste(ok, naegtet).art, TILSTAND.naegtet);
    assert.equal(vaerste(naegtet, ok).art, TILSTAND.naegtet);
  });

  it("lader en afvisning vinde over en almindelig forbindelsesfejl", () => {
    assert.equal(vaerste(forbindelse, naegtet).art, TILSTAND.naegtet);
  });

  it("er ok når alt er ok, og tåler tomme argumenter", () => {
    assert.equal(vaerste(ok, ok).art, TILSTAND.ok);
    assert.equal(vaerste().art, TILSTAND.ok);
    assert.equal(vaerste(null, undefined, ok).art, TILSTAND.ok);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   En tom node er en TREDJE ting
   ══════════════════════════════════════════════════════════════════════

   useKpi faldt tilbage til DEMO_KPI når kpi/ var tom. Begrundelsen var at
   appen ellers stod tom for en bruger der var logget korrekt ind — og det var
   rigtigt dengang alt var visning og der kun fandtes én tenant.

   ⚠ MEN EN RIGTIG KUNDE MED EN TOM BASE VILLE HAVE SET DEMO TRANSPORTS TAL:
   287 aktiver, 842.615 kr i driftsomkostninger. Det er beslutning 26's
   lærestreg — demo-data oven på en rigtig læsning — som overlevede præcis dér.
   ══════════════════════════════════════════════════════════════════════ */
describe("ikkeAggregeret er hverken en fejl, en afvisning eller nul", () => {
  it("den findes som sin egen tilstand", () => {
    assert.ok(TILSTAND.ikkeAggregeret);
    assert.notEqual(TILSTAND.ikkeAggregeret, TILSTAND.ok);
    assert.notEqual(TILSTAND.ikkeAggregeret, TILSTAND.forbindelse);
    assert.notEqual(TILSTAND.ikkeAggregeret, TILSTAND.naegtet);
  });

  it("den taber til en afvisning", () => {
    /* Læser en skærm to noder, og den ene er afvist, er det afvisningen
       brugeren skal se — ikke den mildeste af de to. */
    assert.equal(
      vaerste({ art: TILSTAND.ikkeAggregeret }, { art: TILSTAND.naegtet }).art,
      TILSTAND.naegtet
    );
    assert.equal(
      vaerste({ art: TILSTAND.ikkeAggregeret }, { art: TILSTAND.forbindelse }).art,
      TILSTAND.forbindelse
    );
  });

  it("den vinder over ok", () => {
    /* Ellers ville en skærm med ét aggregeret og ét manglende nøgletal se
       fuldstændig normal ud. */
    assert.equal(
      vaerste({ art: TILSTAND.ok }, { art: TILSTAND.ikkeAggregeret }).art,
      TILSTAND.ikkeAggregeret
    );
  });
});

describe("useKpi falder ikke tilbage til demo", () => {
  it("har ingen demo-fallback på en tom node", () => {
  /* LINT. Prøven læser useKpi.js som tekst: hooken kan ikke importeres i
     Node, fordi den henter firebase.js. Det er samme greb som prøven på
     skriv.js, og af samme grund.

     ⚠ KOMMENTARER SKAL VÆK FØRST. Noten i useKpi.js CITERER det gamle
     `snap.val() || demo` for at forklare hvorfor det ikke står der længere —
     og linten fangede sin egen forklaring. Samme falske positiv som
     designlinten havde på `tone: "orange"`. En lint man ikke kan stole på,
     bliver slået fra. */
  const kilde = readFileSync(new URL("../src/fleet/useKpi.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.doesNotMatch(kilde, /snap\.val\(\)\s*\|\|\s*demo/,
    "useKpi falder tilbage til demo på en tom node. En rigtig kunde ville se " +
    "DEMO Transports tal — beslutning 26.");
  assert.match(kilde, /TILSTAND\.ikkeAggregeret/,
      "useKpi sætter ikke ikkeAggregeret på en tom node.");
  });
});

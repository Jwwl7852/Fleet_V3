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
import { TILSTAND, dataTilstand, erAfvist, vaerste, blokerer } from "../src/fleet/datatilstand.js";

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

/* ══════════════════════════════════════════════════════════════════════════
   blokerer() — den lukkede ring en ny kunde stod i
   ══════════════════════════════════════════════════════════════════════════ */

/* Skærme med noget UNDER nøgletallene som de læser direkte fra basen. De må
   ikke blanke: en ny kunde opretter sin første post netop dér.
   Listen er ikke pynt — den er hvad prøven håndhæver. */
const SKAERME_DER_IKKE_MAA_BLOKERE = [
  "src/moduler/flaade/Oversigt.jsx",
  "src/moduler/flaade/Indberetninger.jsx",
  /* ⚠ Vaerkstedskalender.jsx STOD HER OG ER TAGET UD — fordi den ikke længere
     LÆSER kpi/.

     Prøven nedenfor er hele tiden om ét mønster: en skærm der henter
     nøgletal, må ikke blanke fordi aggregeringen mangler. Driftskalenderens
     fem kasser er ikke nøgletal fra kpi/ — de er tællinger af de lister
     skærmen alligevel henter (`opgaver` og `indberetninger`), og "Kommende"
     afhænger af et vindue brugeren selv sætter. Se driftskalender.js.

     ⚠ DET ER IKKE EN LEMPELSE. Skærmen blokerer stadig på en AFVIST læsning
     af de to lister — `blokerer(opgaver.tilstand)` står der — og den kan ikke
     komme til at blokere på manglende aggregering, fordi den ikke spørger om
     nogen. Ringen den her prøve findes for, kan ikke lukkes om den.

     Fjern den ikke bare fordi listen bliver kortere: skulle skærmen få et
     KpiKort igen, skal den tilbage på listen samme dag. */
  "src/moduler/facility/Oversigt.jsx",
  /* ⚠ Klima.jsx STOD HER OG ER TAGET UD — Skive 1 (V1-redesign) gjorde ruten
     til HIDE/LATER og erstattede hele skærmen med en ærlig "ikke en del af
     V1 endnu"-besked. Den læser ikke længere kpi/ eller nogen anden node, og
     kan derfor ikke falde i den gamle ring. Får skærmen sit indhold tilbage,
     skal den tilbage på listen samme dag. Se docs/product-redesign-v1/. */
  "src/moduler/facility/Servicekalender.jsx",
  "src/moduler/indkoeb/Oversigt.jsx",
  /* ⚠ Fakturaer.jsx STOD HER OG ER TAGET UD — Skive 4A. Skærmen mistede sine
     to k.indkoeb.*-nøgletal (fakturaerTilGodkendelse, godkendtDenneMaaned) —
     de hørte til den fulde fakturaliste/godkendelse, som flyttede til
     Fakturacenter.jsx (der stadig står på listen). De to KpiKort der er
     tilbage her ("Manglende match", "Kontantkøb uden bilag") er tællinger af
     de lister skærmen alligevel henter, ikke af `k` — samme mønster som
     Vaerkstedskalender.jsx ovenfor. Skærmen blokerer stadig på en AFVIST
     læsning af `fakturaer`/`indkoeb`; den kan bare ikke længere blokere på
     manglende AGGREGERING, fordi den ikke spørger om nogen. Får skærmen et
     k.indkoeb.*-felt tilbage, skal den tilbage på listen samme dag. */
  "src/moduler/indkoeb/Leverandoerer.jsx",
  "src/moduler/Kompetencer.jsx",
  "src/moduler/Fakturering.jsx",
];

describe("blokerer() lader en ny kunde komme i gang", () => {
  it("blokerer IKKE på manglende aggregering", () => {
    /* ⚠ HELE POINTEN. Ingen tal → ingen skærm → ingen bil → ingen tal.
       Ringen ramte det allerførste en kunde skal gøre. */
    assert.equal(blokerer({ art: TILSTAND.ikkeAggregeret, visDemo: false }), false);
  });

  it("blokerer ikke når alt er i orden", () => {
    assert.equal(blokerer({ art: TILSTAND.ok, visDemo: false }), false);
    assert.equal(blokerer(null), false);
  });

  it("blokerer stadig på afvisning, fejl og manglende session", () => {
    /* En afvist læsning er ikke "lidt data" — det er at vi ikke ved hvad
       der er. Så skal skærmen ikke tegne noget som helst. */
    for (const art of [TILSTAND.naegtet, TILSTAND.forbindelse, TILSTAND.uautentificeret]) {
      assert.equal(blokerer({ art, visDemo: false }), true, `${art} skal blokere`);
    }
  });

  it("ingen af de elleve skærme har den gamle tidlige retur tilbage", () => {
    /* LINT. Mønstret `if (!k) return <Datatilstand/>` stod i sytten filer og
       var rigtigt i seks af dem. Kopieres det tilbage til en af de elleve,
       er kunden i ringen igen — og det ville ingen opdage, fordi skærmen
       ser pæn ud med demo-data. */
    for (const sti of SKAERME_DER_IKKE_MAA_BLOKERE) {
      const kilde = readFileSync(new URL(`../${sti}`, import.meta.url), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "");
      assert.doesNotMatch(kilde, /if \(!k\) return <Datatilstand/,
        `${sti} blokerer igen på manglende nøgletal — en ny kunde kan ikke oprette sin første post.`);
      assert.match(kilde, /blokerer\(/, `${sti} kalder ikke blokerer().`);
      assert.match(kilde, /\{k && \(/,
        `${sti} tegner nøgletalsrækken uden at tjekke at der ER nøgletal.`);
    }
  });
});

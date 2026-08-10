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
import { TILSTAND, dataTilstand, erAfvist, vaerste } from "../src/fleet/datatilstand.js";

const AFVIST_FEJL = { code: "PERMISSION_DENIED", message: "PERMISSION_DENIED: Permission denied" };
const NETVAERKSFEJL = { code: "NETWORK_ERROR", message: "Failed to fetch" };

describe("dataTilstand skiller de tre tilstande", () => {
  it("kalder det demo når der ikke er nogen database", () => {
    const t = dataTilstand({ harDb: false, harBruger: false, miljoe: "demo" });
    assert.equal(t.art, TILSTAND.demo);
    assert.equal(t.visDemo, true, "demo-mode er netop det tilfælde hvor demo-data er det rigtige svar");
  });

  it("kalder det uautentificeret når der er en database men ingen bruger", () => {
    const t = dataTilstand({ harDb: true, harBruger: false, miljoe: "dev" });
    assert.equal(t.art, TILSTAND.uautentificeret);
  });

  it("er ok når der er en bruger og ingen fejl", () => {
    const t = dataTilstand({ harDb: true, harBruger: true, miljoe: "dev" });
    assert.equal(t.art, TILSTAND.ok);
    assert.equal(t.visDemo, false);
  });
});

describe("En afvisning bærer aldrig tal med sig", () => {
  it("kalder en permission-denied for naegtet — ikke forbindelse", () => {
    const t = dataTilstand({ harDb: true, harBruger: true, miljoe: "prod", fejl: AFVIST_FEJL });
    assert.equal(
      t.art, TILSTAND.naegtet,
      "en afvist læsning er reglerne der virker, ikke et netværksproblem"
    );
  });

  it("viser ALDRIG demo-data ved en afvisning", () => {
    for (const miljoe of ["demo", "dev", "prod"]) {
      const t = dataTilstand({ harDb: true, harBruger: true, miljoe, fejl: AFVIST_FEJL });
      assert.equal(
        t.visDemo, false,
        `${miljoe}: opdigtede tal oven på en afvisning er den fejl filen findes for at rette`
      );
    }
  });

  it("skelner en almindelig fejl fra en afvisning", () => {
    const t = dataTilstand({ harDb: true, harBruger: true, miljoe: "dev", fejl: NETVAERKSFEJL });
    assert.equal(t.art, TILSTAND.forbindelse);
    assert.equal(t.visDemo, false, "heller ikke en netværksfejl må fylde skærmen med tal");
  });
});

describe("Stilladset er gated på dev", () => {
  it("viser demo-data ved uautentificeret i dev", () => {
    const t = dataTilstand({ harDb: true, harBruger: false, miljoe: "dev" });
    assert.equal(t.visDemo, true, "uden det ville dev-appen være tom indtil login findes");
  });

  it("viser IKKE demo-data ved uautentificeret i produktion", () => {
    const t = dataTilstand({ harDb: true, harBruger: false, miljoe: "prod" });
    assert.equal(
      t.visDemo, false,
      "en uautentificeret besøgende i produktion skal møde login-skærmen, ikke opdigtede KPI'er"
    );
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

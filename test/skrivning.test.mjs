/* test/skrivning.test.mjs
 * Valideringen før den første skrivning.
 *
 * ⚠ DEN HER PRØVE HANDLER OM ÉN TING: at valideKoeretoej() SPEJLER
 * firebase.rules.json og ikke afgør noget selv. Er de to uenige, er reglerne
 * rigtige — og så lover formularen enten noget serveren afviser, eller, værre,
 * tillader noget serveren skulle have stoppet.
 *
 * Reglernes side prøves i test/rules.division.test.mjs, hvor de kan afvises af
 * en rigtig emulator. Her prøves klientens side, og de to skal give samme svar
 * på de samme poster.
 *
 * Koer: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  valideKoeretoej, byggKoeretoej, GRAENSE, harFelt, FELT, ALLE_ARTER,
} from "../src/fleet/flaade.js";
import { tolkFejl, SKRIV, skrivBesked } from "../src/fleet/skriv-regler.js";

const god = {
  art: "lastbil", status: "aktiv", kaldenavn: "Bil 900", navn: "Volvo FH 500",
  registrering: "DE 90 000", hjemsted: "Kolding",
  laengdeMm: "6200", driftPrKmOere: "342", kmStand: "120000", naesteServiceKm: "125000",
};

test("En fuldt udfyldt enhed er gyldig", () => {
  assert.deepEqual(valideKoeretoej(god), {});
});

test("De felter reglerne kræver, kræves også her", async (t) => {
  await t.test("tom nummerplade afvises", () => {
    /* Den er den man slår op på. Bil 104 havde to i prototypen — en tom er
       samme fejl, bare stille. */
    assert.ok(valideKoeretoej({ ...god, registrering: "" }).registrering);
    assert.ok(valideKoeretoej({ ...god, registrering: "   " }).registrering);
  });

  await t.test("tomt kaldenavn, model og hjemsted afvises", () => {
    for (const felt of ["kaldenavn", "navn", "hjemsted"]) {
      assert.ok(valideKoeretoej({ ...god, [felt]: "" })[felt], felt);
    }
  });

  await t.test("længdegrænserne er de samme som i reglerne", () => {
    /* GRAENSE er skrevet så et menneske kan sammenligne med regelfilen. */
    assert.equal(GRAENSE.kaldenavn, 60);
    assert.equal(GRAENSE.navn, 120);
    assert.equal(GRAENSE.registrering, 20);
    assert.equal(GRAENSE.hjemsted, 60);
    assert.ok(valideKoeretoej({ ...god, hjemsted: "x".repeat(61) }).hjemsted);
    assert.deepEqual(valideKoeretoej({ ...god, hjemsted: "x".repeat(60) }), {});
  });

  await t.test("ukendt art og status afvises", () => {
    assert.ok(valideKoeretoej({ ...god, art: "helikopter" }).art);
    assert.ok(valideKoeretoej({ ...god, status: "parkeret" }).status);
  });

  await t.test("negative og ikke-numeriske kilometer afvises", () => {
    assert.ok(valideKoeretoej({ ...god, kmStand: "-1" }).kmStand);
    assert.ok(valideKoeretoej({ ...god, kmStand: "hundrede" }).kmStand);
    assert.ok(valideKoeretoej({ ...god, laengdeMm: "0" }).laengdeMm);
  });
});

test("Hjemsted er ikke en enum", () => {
  /* ⚠ MED VILJE, og det skal blive sådan. Kolding og Aalborg er DENNE
     tenants steder; en anden vognmand har andre. Et katalog her ville betyde
     at et nyt depot krævede en kodeændring. */
  assert.deepEqual(valideKoeretoej({ ...god, hjemsted: "Padborg" }), {});
  assert.deepEqual(valideKoeretoej({ ...god, hjemsted: "Hirtshals Havn" }), {});
});

test("Afgang kræver en årsag, men sletter ikke", () => {
  /* Posten bliver stående — der hænger indberetninger og omkostningshistorik
     på id'et. Men en bil der bare forsvandt ud af drift, kan ingen forklare
     et halvt år senere. */
  for (const status of ["solgt", "skrottet"]) {
    assert.ok(valideKoeretoej({ ...god, status }).afgangAarsag, status);
    assert.deepEqual(
      valideKoeretoej({ ...god, status, afgangAarsag: "Solgt til Padborg Transport" }), {}
    );
  }
  const ud = byggKoeretoej({ ...god, status: "solgt", afgangAarsag: "Solgt" });
  assert.ok(Number.isFinite(ud.afgangMs), "afgangMs skal sættes");
  assert.equal(ud.afgangAarsag, "Solgt");
});

test("Division må aldrig sendes med et køretøj", () => {
  /* Beslutning 19. Reglerne afviser feltet med .validate: false — kom det
     med, ville hele skrivningen fejle med permission-denied, og brugeren
     ville få en adgangsfejl for noget der er en programfejl hos os. */
  assert.ok(valideKoeretoej({ ...god, division: "gods" }).division);
  for (const art of ALLE_ARTER) {
    const ud = byggKoeretoej({ ...god, art, saeder: "0" });
    assert.equal("division" in ud, false, `${art} fik en division med`);
  }
});

test("Arten styrer hvilke felter der sendes", async (t) => {
  await t.test("en trailer får ingen kilometerstand", () => {
    /* Et felt der ikke findes, er ikke et tomt felt. Sendes det som null,
       vises det som "—" og ligner en mangel nogen bør udfylde. */
    const ud = byggKoeretoej({ ...god, art: "trailer" });
    assert.equal("kmStand" in ud, false);
    assert.equal("naesteServiceKm" in ud, false);
    assert.equal(harFelt("trailer", FELT.kmStand), false);
  });

  await t.test("en bus får sæder, en lastbil får ikke", () => {
    const bus = byggKoeretoej({ ...god, art: "bus", saeder: "52" });
    assert.equal(bus.saeder, 52);
    assert.equal("saeder" in byggKoeretoej(god), false);
  });

  await t.test("tal sendes som tal, ikke som strenge", () => {
    /* Formularen giver strenge. Reglerne kræver isNumber(), og en streng
       ville blive afvist med permission-denied — en adgangsfejl for et
       typeproblem. */
    const ud = byggKoeretoej(god);
    for (const f of ["laengdeMm", "driftPrKmOere", "kmStand", "naesteServiceKm"]) {
      assert.equal(typeof ud[f], "number", f);
    }
  });
});

test("Servicemålet må ikke ligge bag kilometerstanden", () => {
  /* Ikke en regel på serveren — den kan ikke se to felter mod hinanden uden
     en .validate på forældrenoden. Her er den en hjælp, og teksten spørger
     frem for at spærre. */
  const f = valideKoeretoej({ ...god, kmStand: "200000", naesteServiceKm: "150000" });
  assert.match(f.naesteServiceKm, /bag kilometerstanden/);
});

test("En afvist skrivning er ikke en netværksfejl", async (t) => {
  const naegtet = { code: "PERMISSION_DENIED", message: "permission_denied" };
  const nede = { code: "NETWORK_ERROR", message: "unavailable" };

  await t.test("permission-denied bliver til naegtet, ikke forbindelse", () => {
    /* Oversættes den til "prøv igen", får brugeren at vide at systemet er i
       stykker — og han prøver igen, og igen. Reglerne VIRKER. */
    assert.equal(tolkFejl(naegtet), SKRIV.naegtet);
    assert.notEqual(tolkFejl(naegtet), SKRIV.forbindelse);
  });

  await t.test("en netværksfejl bliver til forbindelse", () => {
    assert.equal(tolkFejl(nede), SKRIV.forbindelse);
  });

  await t.test("havde vi ikke valideret først, er afvisningen formentlig formen", () => {
    /* RTDB skelner ikke en fejlet .validate fra en afvist permission i
       fejlkoden. Har vi selv tjekket formen, er en afvisning næsten altid
       adgang; har vi ikke, er den næsten altid formen. */
    assert.equal(tolkFejl(naegtet, { formentligGyldig: false }), SKRIV.ugyldig);
  });

  await t.test("hver tilstand har sin egen tekst", () => {
    for (const art of [SKRIV.naegtet, SKRIV.forbindelse, SKRIV.ugyldig, SKRIV.demo]) {
      assert.ok(skrivBesked(art), art);
    }
    /* Og de tre fejltekster må ikke være ens — det var hele pointen. */
    const tekster = new Set([SKRIV.naegtet, SKRIV.forbindelse, SKRIV.ugyldig].map(skrivBesked));
    assert.equal(tekster.size, 3);
  });
});

test("Skrivelaget har ingen sletning", () => {
  /* Regnskabsdata hardslettes ikke. Reglerne håndhæver det med
     newData.exists(), men der skal heller ikke findes en vej til det i
     klienten — en funktion der findes, bliver kaldt.
     ⚠ Proeven laeser skriv.js som TEKST. Filen kan ikke importeres i Node:
     den henter firebase.js, som laeser import.meta.env. Det er praecis derfor
     politikken ligger i skriv-regler.js — se noten der. */
  const kode = readFileSync(new URL("../src/fleet/skriv.js", import.meta.url), "utf8");
  for (const navn of ["slet", "fjern", "remove"]) {
    assert.doesNotMatch(kode, new RegExp("export (async )?function " + navn + "\b"),
      `skriv.js eksporterer ${navn}()`);
  }
  assert.doesNotMatch(kode, /.remove()/, "skriv.js kalder .remove()");
  assert.doesNotMatch(kode, /set(s*nulls*)/, "skriv.js skriver null");
});

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

/* ══════════════════════════════════════════════════════════════════════
   Facility og Indkøb — samme aftale som Flåde
   ══════════════════════════════════════════════════════════════════════ */
import {
  valideAktiv, byggAktiv, valideFejl, byggFejl, valideLokation,
} from "../src/fleet/facility.js";
import { valideIndkoeb, byggIndkoeb } from "../src/fleet/leverandoerer.js";
import { oereFraKroner, kronerFraOere } from "../src/fleet/format.js";

const ctxF = { lokationer: [{ id: "lok-a" }], zoner: [{ id: "zo-a" }], personale: [{ id: "p1" }] };

test("Et anlæg skal stå på en lokation der findes", () => {
  const a = { navn: "Port 1", art: "port", status: "idrift", lokationId: "lok-a" };
  assert.deepEqual(valideAktiv(a, ctxF), {});
  assert.ok(valideAktiv({ ...a, lokationId: "nope" }, ctxF).lokationId);
  assert.ok(valideAktiv({ ...a, lokationId: "" }, ctxF).lokationId);
});

test("Et anlæg der MÅLES i en zone, skal have en", () => {
  /* Uden zone kan Klima ikke vise hvad køleanlægget faktisk holder — og så
     står anlægget i listen uden at nogen kan se om det virker. */
  const koel = { navn: "Køl 1", art: "koeleanlaeg", status: "idrift", lokationId: "lok-a" };
  assert.ok(valideAktiv(koel, ctxF).zoneId);
  assert.deepEqual(valideAktiv({ ...koel, zoneId: "zo-a" }, ctxF), {});
  /* En port måles ikke — feltet må ikke kræves dér. */
  assert.deepEqual(valideAktiv({ ...koel, art: "port" }, ctxF), {});
});

test("Udstyrsarten 'facility' findes ikke", () => {
  /* ⚠ SAMME FELTNAVN, TO VOKABULARER. opgave.art er facility|vaerksted;
     aktiv.art er udstyrstypen. Blandes de, forsvinder anlægget ud af enhver
     liste der grupperer på art. */
  assert.ok(valideAktiv(
    { navn: "P", art: "facility", status: "idrift", lokationId: "lok-a" }, ctxF).art);
});

test("Et facility-anlæg får aldrig en division", () => {
  /* Facility er FÆLLES — porten er den samme uanset hvem der kører igennem
     den. Reglerne afviser feltet. */
  const ud = byggAktiv({ navn: "P", art: "port", status: "idrift", lokationId: "lok-a" });
  assert.equal("division" in ud, false);
});

test("En fejlmelding kræver alvor, og alvoren er et VALG", () => {
  /* Den afgør om lokationen står Kritisk i overblikket, og det kan ingen
     regel regne sig frem til bagefter. */
  const f = { aktivId: "fa-a", status: "ny", beskrivelse: "Porten står stille" };
  const ctx = { aktiver: [{ id: "fa-a" }] };
  assert.ok(valideFejl(f, ctx).alvor);
  assert.deepEqual(valideFejl({ ...f, alvor: "hoej" }, ctx), {});
  assert.ok(valideFejl({ ...f, alvor: "kritisk" }, ctx).alvor);
  assert.ok(valideFejl({ ...f, alvor: "lav", aktivId: "nope" }, ctx).aktivId);
});

test("Meldetidspunktet sættes ved oprettelsen og flytter sig ikke", () => {
  /* En fejl der "blev meldt" da nogen sidst rettede i den, kan ikke bruges
     til at måle svartid. */
  const ud = byggFejl({ aktivId: "a", status: "ny", alvor: "lav", beskrivelse: "x", meldtMs: 1234 });
  assert.equal(ud.meldtMs, 1234);
  assert.ok(Number.isFinite(byggFejl({ aktivId: "a", status: "ny", alvor: "lav", beskrivelse: "x" }).meldtMs));
});

test("En lokation kræver navn, type, sted og et helt areal", () => {
  const l = { navn: "Hal B", type: "lager", sted: "Kolding", arealM2: "12450" };
  assert.deepEqual(valideLokation(l), {});
  assert.ok(valideLokation({ ...l, type: "garage" }).type);
  assert.ok(valideLokation({ ...l, arealM2: "12450,5" }).arealM2);
  /* ⚠ sted er IKKE en enum — et nyt depot må ikke kræve en kodeændring. */
  assert.deepEqual(valideLokation({ ...l, sted: "Padborg" }), {});
});

test("En indkøbspris indtastes i kroner og gemmes som hele øre", async (t) => {
  const ctxI = { leverandoerer: [{ id: "lv-a" }] };
  const god = {
    division: "gods", dato: 1e12, leverandoerId: "lv-a", vare: "Slange",
    antal: "12", prisKr: "18,50", kategori: "reservedele", fakturastatus: "modtaget",
  };

  await t.test("18,50 bliver til 1850", () => {
    /* ⚠ HELE BESLUTNING 2. En float ender som 1849,999 i en sum over hundrede
       linjer, og så går afstemningen ikke op med en øre ingen kan forklare. */
    assert.deepEqual(valideIndkoeb(god, ctxI), {});
    assert.equal(byggIndkoeb(god).prisPrEnhedOere, 1850);
    assert.equal(oereFraKroner("0,05"), 5);
    assert.equal(kronerFraOere(1850), "18,50");
  });

  await t.test("en pris der ikke er et beløb, afvises", () => {
    assert.ok(valideIndkoeb({ ...god, prisKr: "atten halvtreds" }, ctxI).prisKr);
    assert.ok(valideIndkoeb({ ...god, prisKr: "" }, ctxI).prisKr);
  });

  await t.test("tre nuller for meget fanges", () => {
    /* Ikke en forretningsregel — et loft der fanger en tastefejl. */
    assert.match(valideIndkoeb({ ...god, prisKr: "18500000000" }, ctxI).prisKr, /tre nuller/);
  });

  await t.test("division er påkrævet og kan ikke arves fra bilen", () => {
    /* Beslutning 19 forbyder feltet på et køretøj, så der er intet at arve. */
    assert.ok(valideIndkoeb({ ...god, division: "" }, ctxI).division);
    assert.match(valideIndkoeb({ ...god, division: "" }, ctxI).division, /arves/);
  });

  await t.test("linjens beløb sendes ALDRIG med", () => {
    /* Det beregnes af antal × pris. To kilder til samme tal kan drive fra
       hinanden, og reglerne afviser feltet. */
    const ud = byggIndkoeb({ ...god, beloebOere: 22200 });
    assert.equal("beloebOere" in ud, false);
  });

  await t.test("momsen står for sig og er også hele øre", () => {
    const ud = byggIndkoeb({ ...god, momsKr: "4,63" });
    assert.equal(ud.momsOere, 463);
    assert.equal(Number.isInteger(ud.momsOere), true);
  });

  await t.test("en ukendt leverandør afvises", () => {
    assert.ok(valideIndkoeb({ ...god, leverandoerId: "lv-nope" }, ctxI).leverandoerId);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   Medarbejderen — personen, ikke loginnet
   ══════════════════════════════════════════════════════════════════════ */
import { valideMedarbejder, byggMedarbejder } from "../src/fleet/personale.js";

const person = {
  navn: "Lars Aage", status: "aktiv", ansaettelsesform: "fastansat",
  funktioner: { chauffoer: true }, stationeret: "Kolding",
};

test("En medarbejder skal have mindst én funktion", () => {
  /* ⚠ IKKE EN REGEL PÅ SERVEREN — RTDB kan ikke kræve "mindst ét barn". Det
     her er derfor den eneste kontrol, og den er værd at have: en medarbejder
     uden funktion kan ikke disponeres, tælles ikke i bemandingsplanen, og
     står i listen som en person ingen kan bruge til noget. */
  assert.deepEqual(valideMedarbejder(person), {});
  assert.ok(valideMedarbejder({ ...person, funktioner: {} }).funktioner);
  assert.ok(valideMedarbejder({ ...person, funktioner: null }).funktioner);
});

test("Funktioner gemmes som et MAP, ikke et array", () => {
  /* funktioner/{chauffoer:true} kan indekseres og forespørges ("hvem er
     mekanikere"); et array kan ikke. Reglerne afviser et array, fordi RTDB
     gemmer det som 0,1,2-nøgler der ikke matcher funktionsmønsteret. */
  const ud = byggMedarbejder({ ...person, funktioner: { chauffoer: true, mekaniker: true } });
  assert.equal(Array.isArray(ud.funktioner), false);
  assert.deepEqual(ud.funktioner, { chauffoer: true, mekaniker: true });
});

test("Kun valgte funktioner sendes med", () => {
  /* `false` betyder fravalgt, og et map fuldt af false ville se ud som om
     personen havde alle funktioner slået fra frem for ikke at have dem. */
  const ud = byggMedarbejder({ ...person, funktioner: { chauffoer: true, mekaniker: false } });
  assert.equal("mekaniker" in ud.funktioner, false);
});

test("En fratrådt medarbejder skal have en dato", () => {
  /* Posten bliver stående — der hænger reservationer og indberetninger på
     personId'et — men uden datoen kan ingen sige hvornår ansvaret ophørte. */
  assert.ok(valideMedarbejder({ ...person, status: "fratraadt" }).fratraadtIso);
  assert.deepEqual(
    valideMedarbejder({ ...person, status: "fratraadt", fratraadtIso: "2026-01-31" }), {}
  );
});

test("Formularen sender ALDRIG uid", () => {
  /* ⚠ uid ER HVEM DER GJORDE NOGET. personId er hvem det handler om, og det
     er nøglen. Uid sættes af den funktion der opretter loginnet — bytter man
     om, holder ejerskabstjekket i reglerne op med at virke, fordi
     data.child('oprettetAf').val() === auth.uid sammenligner med et uid og
     et personId aldrig matcher. Beslutning 18. */
  const ud = byggMedarbejder({ ...person, uid: "uid-lars" });
  assert.equal("uid" in ud, false);
});

test("En medarbejder får aldrig en division", () => {
  /* Beslutning 19. Lars med C+D stod som "faelles"; han er en person med
     fire kompetencer, og de står i kompetencer/ hvor de kan udløbe. */
  assert.ok(valideMedarbejder({ ...person, division: "faelles" }).division);
  assert.equal("division" in byggMedarbejder(person), false);
});

/* ══════════════════════════════════════════════════════════════════════
   Brugeroprettelse — klientsiden af det funktionen håndhæver
   ══════════════════════════════════════════════════════════════════════ */
import {
  valideNyBruger, nytLoesen, MINDSTE_KODE, tolkBrugerfejl, BRUGERSVAR,
  erGyldigMail,
} from "../src/fleet/brugere-regler.js";

const nyBruger = {
  navn: "Lars Aage", email: "lars@vognmand.dk", rolle: "chauffoer",
  kode: "etMegetLangtLoesen1",
};

test("En ny bruger kræver navn, gyldig mail og en kendt rolle", () => {
  assert.deepEqual(valideNyBruger(nyBruger), {});
  assert.ok(valideNyBruger({ ...nyBruger, navn: "" }).navn);
  assert.ok(valideNyBruger({ ...nyBruger, email: "lars-at-vognmand" }).email);
  assert.ok(valideNyBruger({ ...nyBruger, rolle: "direktoer" }).rolle);
});

test("Kodekravet er det SAMME tal som funktionen håndhæver", () => {
  /* ⚠ STÅR DE TO FORSKELLIGE STEDER, afviser serveren en adgangskode
     formularen godtog — og brugeren får en fejl han ikke kan handle på.

     ⚠ OG PRØVEN HER LÆSTE EFTER TALLET 12 SOM TEKST i functions/index.js.
     Den holdt tallet i sync — og sagde intet om mailmønsteret to linjer
     længere oppe, som var drevet. Et tal der holdes i sync af en prøve, er
     stadig to tal. Nu importerer funktionen konstanten, og prøven læser
     efter DEN. */
  assert.equal(MINDSTE_KODE, 12);
  const kode = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
  assert.match(kode, /from "\.\/delt\/brugere-regler\.js"/,
    "funktionen importerer ikke de delte brugerregler — så er de to ude af sync.");
  assert.doesNotMatch(kode, /kode\.length < \d/,
    "funktionen har igen sit eget tal for kodelængden.");
  assert.ok(valideNyBruger({ ...nyBruger, kode: "eeeeeeeeeee" }).kode, "11 tegn skal afvises");
  assert.deepEqual(valideNyBruger({ ...nyBruger, kode: "eeeeeeeeeeee" }), {}, "12 skal gå");
});

test("⚠ EN .com-ADRESSE SKAL KUNNE OPRETTES", () => {
  /* Det kunne den ikke. Serveren stod med {2} hvor klienten havde {2,} —
     et topdomæne på NØJAGTIG to tegn — så jorn@vognmand.dk gik igennem og
     jorn@vognmand.com blev afvist med "Ugyldig mailadresse". Det ramte både
     opretbruger og kundeadmin; de deler opretKonto().

     ⚠ HVORFOR INGEN OPDAGEDE DET: prøven ovenfor prøvede kun
     "lars-at-vognmand" — en adresse uden krøllet a. Et mailmønster fejler
     ikke på det grove. Det fejler på det almindelige, og .dk virkede. */
  for (const m of ["lars@vognmand.dk", "lars@vognmand.com", "a@b.info", "x@y.co.uk"]) {
    assert.ok(erGyldigMail(m), `${m} skal godtages`);
    assert.deepEqual(valideNyBruger({ ...nyBruger, email: m }), {}, `${m} skal godtages`);
  }
  for (const m of ["lars-at-vognmand", "lars@vognmand", "@vognmand.dk", "lars @vognmand.dk", "", null]) {
    assert.equal(erGyldigMail(m), false, `${m} skal afvises`);
  }
});

test("⚠ MAILMØNSTERET STÅR ÉT STED", () => {
  /* Det stod FIRE steder: her, i functions/index.js, inline i ejerkonsollens
     førsteadmin-formular og i dev-brugere.js. De fire var ikke ens — to af
     dem afviste adresser de to andre godtog.

     Prøven læser filerne som tekst, ligesom demo-kilder.test.mjs. En kopi
     nummer to opdages ikke ved at kigge på den; den opdages den dag en kunde
     ikke kan oprettes. */
  const filer = [
    "../functions/index.js",
    "../src/moduler/udbyder/Konsol.jsx",
    "../src/moduler/opsaetning/Brugere.jsx",
    "../src/fleet/dev-brugere.js",
    "../scripts/opret-kunde.mjs",
  ];
  for (const f of filer) {
    const tekst = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.doesNotMatch(tekst, /\[\^\s@\]/,
      `${f} har sin egen kopi af mailmønsteret. Der er ét, og det står i ` +
      "brugere-regler.js — kopierne var uenige om .com.");
  }
});

test("Det genererede løsen er langt nok og uden forvekslelige tegn", () => {
  /* l, I, 1, O og 0 forveksles når nogen læser koden op i telefonen — og
     det er præcis sådan den bliver overleveret, indtil der er en
     invitationsmail. */
  for (let i = 0; i < 20; i++) {
    const k = nytLoesen();
    assert.ok(k.length >= MINDSTE_KODE, `${k} er for kort`);
    assert.doesNotMatch(k, /[lI1O0]/, `${k} indeholder et forveksleligt tegn`);
  }
  assert.notEqual(nytLoesen(), nytLoesen(), "to løsener må ikke være ens");
});

test("En afvist handling er ikke en netværksfejl", async (t) => {
  await t.test("permission-denied bliver til naegtet", () => {
    /* Kontrollen VIRKER. "Prøv igen" ville lære brugeren at systemet er i
       stykker — samme skel som dataTilstand() og skriv-regler.js laver. */
    const r = tolkBrugerfejl({ code: "functions/permission-denied", message: "Kræver brugere.skriv." });
    assert.equal(r.art, BRUGERSVAR.naegtet);
    assert.equal(r.besked, "Kræver brugere.skriv.");
  });

  await t.test("already-exists er sin egen tilstand", () => {
    /* Den bliver ikke bedre af at prøve igen, og den er ikke en fejl hos os. */
    assert.equal(tolkBrugerfejl({ code: "functions/already-exists" }).art, BRUGERSVAR.optaget);
  });

  await t.test("invalid-argument er formen, ikke adgangen", () => {
    assert.equal(tolkBrugerfejl({ code: "functions/invalid-argument" }).art, BRUGERSVAR.ugyldig);
    assert.equal(tolkBrugerfejl({ code: "functions/failed-precondition" }).art, BRUGERSVAR.ugyldig);
  });

  await t.test("alt andet er forbindelsen", () => {
    assert.equal(tolkBrugerfejl({ code: "functions/internal" }).art, BRUGERSVAR.forbindelse);
    assert.equal(tolkBrugerfejl(new Error("nede")).art, BRUGERSVAR.forbindelse);
  });
});

test("Klienten sender aldrig en tenant — og aldrig en BRUGERS perms", () => {
  /* Funktionen ignorerer tenanten alligevel — men et felt der ser ud til at
     betyde noget og bliver ignoreret, er værre end intet felt. Og en admin
     hos kunde A der selv måtte oplyse tenanten, kunne oprette en
     administrator hos kunde B.

     ⚠ PRØVEN ER SNÆVRET IND MED BESLUTNING 31b, IKKE LEMPET.
     Den forbød `perms` nogen steder i filen. Grunden var: en BRUGERS
     permissions udledes af hans rolle, og kunne klienten sende en liste,
     kunne en admin give sig selv noget der ikke stod i noget preset.

     Den grund holder. Men `skrivRolle()` sender en liste — det er en ROLLES
     indhold, ikke en brugers, og det er hele beslutning 31b. Serveren
     validerer den mod ALLE_PERMS og spærrer mod at låse sig ude.

     Prøven ser derfor på hver eksporteret handling for sig. */
  const kilde = readFileSync(new URL("../src/fleet/brugere.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  assert.doesNotMatch(kilde, /tenant\s*[:,]/, "brugere.js sender en tenant med.");

  /* De tre BRUGER-handlinger må ikke bære en perms-liste. */
  for (const navn of ["opretBruger", "skiftRolle", "spaerLogin"]) {
    const i = kilde.indexOf(`export const ${navn}`);
    assert.ok(i > 0, `${navn} findes ikke — er funktionen døbt om?`);
    const naeste = kilde.indexOf("export const", i + 1);
    const krop = naeste < 0 ? kilde.slice(i) : kilde.slice(i, naeste);
    assert.doesNotMatch(krop, /perms\s*[:,]/,
      `${navn} sender perms med — en brugers permissions kommer fra rollen.`);
  }

  /* ⚠ OG DEN ENE DER MÅ, SENDER EN ROLLE MED. Uden rollenavnet ville
     serveren ikke vide hvad listen hørte til. */
  assert.match(kilde, /skrivRolle = \(\{ rolle, perms \}\)/,
    "skrivRolle sender ikke både rolle og perms");
});

test("Funktionsnavnene i klienten matcher dem der er udrullet", () => {
  /* ⚠ SMÅ BOGSTAVER. En 2. generations funktion bliver til en Cloud
     Run-tjeneste, og et tjenestenavn må kun være småt. Stemmer navnene ikke,
     får man 404 fra en funktion man kan se i konsollen. */
  const klient = readFileSync(new URL("../src/fleet/brugere.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
  for (const navn of ["opretbruger", "skiftrolle", "spaerlogin", "rolleskriv"]) {
    assert.match(klient, new RegExp(`"${navn}"`), `klienten kender ikke ${navn}`);
    assert.match(server, new RegExp(`export const ${navn} = onCall`), `serveren har ikke ${navn}`);
  }
});

test("En slettet konto er ikke en netværksfejl", () => {
  /* ⚠ INDEKSET KAN OVERLEVE SIN KONTO. Slettes en bruger i Firebase-konsollen,
     bliver rækken under tenants/<t>/brugere stående — konsollen ved intet om
     den. Før dette blev auth.getUser()'s fejl til `internal` og dermed til
     "prøv igen", og kontoen kommer aldrig tilbage. Det er nøjagtig den
     fejltilstand hele skellet i denne fil er skrevet imod.
     Det ER sket: en admin oprettede sig selv og slettede kontoen i konsollen. */
  const r = tolkBrugerfejl({ code: "functions/not-found", message: "Kontoen findes ikke længere." });
  assert.equal(r.art, BRUGERSVAR.forsvundet);
  assert.notEqual(r.art, BRUGERSVAR.forbindelse);

  const server = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
  assert.match(server, /auth\/user-not-found/,
    "funktionen fanger ikke en slettet konto — så bliver den til `internal`.");
  assert.match(server, /HttpsError\(\s*[\r\n\s]*"not-found"/,
    "funktionen svarer ikke not-found på en slettet konto.");
  assert.match(server, /brugere\/\$\{maalUid\}`\)\.remove\(\)/,
    "den døde indeksrække ryddes ikke — så er fælden der stadig næste gang.");
});

test("Moduler og rabat gemmes hver for sig", () => {
  /* ⚠ TO KNAPPER, OG DET ER EN BESLUTNING — ikke en forglemmelse.
     De to felter i en modulrække skriver til hver sin funktion og har hver
     sin virkning i TID: et modulskift gælder i samme sekund og kan lukke
     kunden ude af sine egne data (beslutning 33), mens en rabat først gælder
     fra næste opgørelse og aldrig bagud.

     Lægges de sammen til ét kald, udløser en tastet procent et modulskift —
     eller et fravalg udløser en rabatændring ingen havde til hensigt. Og
     kvitteringen ville sige "Gemt" om to ting hvoraf den ene ikke skete.

     Prøven læser skærmen som tekst: samme greb som lint'en på useKpi og
     skriv.js, og af samme grund — komponenten kan ikke indlæses i Node. */
  const kilde = readFileSync(new URL("../src/moduler/udbyder/Konsol.jsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  const i = kilde.indexOf("function Moduler(");
  const slut = kilde.indexOf("function Rabat(");
  assert.ok(i > 0 && slut > i, "fandt ikke Moduler-komponenten");
  const krop = kilde.slice(i, slut);

  assert.match(krop, /saetModuler\(\{/, "Moduler gemmer ikke modullisten.");
  assert.match(krop, /saetAbonnement\(\{/, "Moduler gemmer ikke rabatterne.");

  /* De to kald må ikke stå i SAMME funktion. */
  for (const navn of ["gemModuler", "gemRabat"]) {
    const j = krop.indexOf(`const ${navn} = async`);
    assert.ok(j > 0, `${navn} findes ikke — er de to lagt sammen til én knap?`);
    const f = krop.slice(j, krop.indexOf("};", j));
    const antal = (f.match(/saetModuler\(|saetAbonnement\(/g) || []).length;
    assert.equal(antal, 1, `${navn} kalder to funktioner. Én knap, én skrivning.`);
  }

  /* Hver knap er slået fra indtil netop dens egen ting er ændret — det er
     dét der gør tilbagemeldingen ærlig: man kan SE hvad der ikke blev gemt. */
  assert.match(krop, /disabled=\{!modulerAendret/, "modulknappen lyser altid.");
  assert.match(krop, /disabled=\{!rabatAendret/, "rabatknappen lyser altid.");
});

test("Rabat pr. modul står ÉT sted i skærmen", () => {
  /* De samme ti moduler listet to gange på én skærm er en liste man skal
     holde styr på med øjnene — og to steder at rette samme tal. */
  const kilde = readFileSync(new URL("../src/moduler/udbyder/Konsol.jsx", import.meta.url), "utf8");
  const rabat = kilde.slice(kilde.indexOf("function Rabat("), kilde.indexOf("function Foersteadmin("));
  assert.doesNotMatch(rabat, /VALGFRIE_MODULER\.map/,
    "Rabat-kortet tegner en modulliste igen. Den hører i Moduler-kortet.");
  assert.doesNotMatch(rabat, /rabatModulBps:/,
    "Rabat-kortet skriver modulrabatter. Det gør Moduler-kortet.");
});

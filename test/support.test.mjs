/* test/support.test.mjs
 * Support. BESLUTNING 23, korrigeret af BESLUTNING 24.
 *
 * Ingen emulator.
 *
 * ⚠ DEN VIGTIGSTE TEST I FILEN er at en kundes claim ikke kan læse en anden
 * tenants sag. Support er det FØRSTE der krydser tenant-grænsen, og punkt 1 i
 * den låste rækkefølge er tenant-isolation. maaLaeseSag() er reglen skrevet
 * som en funktion, netop så skelnen kan køres frem for at blive læst.
 *
 * Koer: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SUPPORT_KATEGORI, SUPPORT_PRIORITET, SUPPORT_STATUS, SUPPORT_KONTEKST,
  KONTEKSTFELTER, SUPPORT_NUMMER, SUPPORT_SERIE, AUDITUDTRAEK,
  ADGANG_VARIGHED, ADGANG_TYPE,
  maaLaeseSag, harSupportPerm, kontekstFilter, udtraekVindue, klipUdtraek,
  kanGiveAdgang, byggBevilling, adgangAktiv, adgangResterendeMin,
  PERM_SUPPORT_LAES, PERM_ADGANG_GIV,
} from "../src/fleet/support.js";
import {
  DEMO_SUPPORTSAGER, DEMO_TENANTS, DEMO_BEVILLINGER, DEMO_AUDITUDTRAEK,
  demoSupportsag, demoIndeksFor, demoBeskeder, demoUdtraek,
} from "../src/fleet/demo-support.js";

const MIN = 60000;
const kunde = (tenant) => ({ uid: "u1", tenant, perms: "|support.opret|" });
const supporter = { uid: "s1", tenant: "fleetcontrol", perms: `|${PERM_SUPPORT_LAES}|` };
const admin = (tenant) => ({ uid: "a1", tenant, perms: `|${PERM_ADGANG_GIV}|support.opret|` });

/* ══════════════════════════════════════════════════════════════════════
   TENANT-GRÆNSEN
   ══════════════════════════════════════════════════════════════════════ */
describe("Tenant-isolationen holder", () => {
  const demoSag = DEMO_SUPPORTSAGER.find((s) => s.tenantId === "demo");
  const nordiskSag = DEMO_SUPPORTSAGER.find((s) => s.tenantId === "nordisk");

  it("har sager i mere end én tenant, så grænsen kan ses virke", () => {
    assert.ok(demoSag && nordiskSag,
      "med kun én tenant ville maaLaeseSag se rigtig ud uanset hvad den gjorde");
  });

  it("lader kunden læse sin egen sag", () => {
    assert.equal(maaLaeseSag(demoSag, kunde("demo")), true);
    assert.equal(maaLaeseSag(nordiskSag, kunde("nordisk")), true);
  });

  /* Den afgørende. */
  it("nægter kunden en ANDEN tenants sag", () => {
    assert.equal(maaLaeseSag(nordiskSag, kunde("demo")), false);
    assert.equal(maaLaeseSag(demoSag, kunde("nordisk")), false);
  });

  it("lader support læse begge — men kun med support.laes", () => {
    assert.equal(maaLaeseSag(demoSag, supporter), true);
    assert.equal(maaLaeseSag(nordiskSag, supporter), true);
    const udenPerm = { uid: "s2", tenant: "fleetcontrol", perms: "" };
    assert.equal(maaLaeseSag(demoSag, udenPerm), false);
  });

  /* Fejler lukket. */
  it("nægter når noget mangler", () => {
    assert.equal(maaLaeseSag(demoSag, null), false);
    assert.equal(maaLaeseSag(null, supporter), false);
    assert.equal(maaLaeseSag({ tenantId: null }, kunde("demo")), false);
    assert.equal(maaLaeseSag({}, { tenant: undefined, perms: "" }), false);
  });

  it("lader en tom perms-streng være uden adgang", () => {
    assert.equal(harSupportPerm({ perms: "" }, PERM_SUPPORT_LAES), false);
    assert.equal(harSupportPerm({ perms: "|support.laesx|" }, PERM_SUPPORT_LAES), false);
    assert.equal(harSupportPerm({ perms: [PERM_SUPPORT_LAES] }, PERM_SUPPORT_LAES), true);
  });

  /* Indeksnoden er det kunden kan LISTE. Den må kun indeholde egne sager. */
  it("giver hver tenant et indeks med kun dens egne sager", () => {
    for (const t of Object.keys(DEMO_TENANTS)) {
      for (const id of demoIndeksFor(t)) {
        assert.equal(demoSupportsag(id).tenantId, t, `indekset for ${t} lækker en anden sag`);
      }
    }
    const alle = Object.keys(DEMO_TENANTS).flatMap(demoIndeksFor);
    assert.equal(new Set(alle).size, alle.length, "en sag står i to indekser");
    assert.equal(alle.length, DEMO_SUPPORTSAGER.length, "en sag mangler i sit indeks");
  });
});

/* ══════════════════════════════════════════════════════════════════════
   KONTEKSTEN — en ny kanal ud af systemet
   ══════════════════════════════════════════════════════════════════════ */
describe("Konteksten er en allowliste", () => {
  it("slipper kun kendte felter igennem", () => {
    const { tilladt, afvist } = kontekstFilter({
      kunde: "DEMO", modul: "Flåde", password: "hemmeligt",
      token: "eyJ…", kundenavn: "Kolding Kommune",
    });
    assert.deepEqual(Object.keys(tilladt).sort(), ["kunde", "modul"]);
    assert.deepEqual(afvist.sort(), ["kundenavn", "password", "token"]);
  });

  /* En blokliste dækker det man kom i tanke om; en allowliste dækker resten. */
  it("afviser et felt ingen har tænkt på", () => {
    const { afvist } = kontekstFilter({ sessionsNoegle: "abc", cprNummer: "…" });
    assert.deepEqual(afvist.sort(), ["cprNummer", "sessionsNoegle"]);
  });

  it("har hverken IP-adresse eller mail på listen", () => {
    assert.equal(KONTEKSTFELTER.includes("ip"), false);
    assert.equal(KONTEKSTFELTER.includes("email"), false);
    assert.equal(KONTEKSTFELTER.includes("mail"), false);
  });

  it("dækker præcis de felter beslutning 23 nævner", () => {
    assert.deepEqual([...KONTEKSTFELTER].sort(), [
      "browser", "brugerId", "fejlId", "kunde", "modul", "side", "tidspunkt", "version",
    ]);
    for (const f of KONTEKSTFELTER) assert.ok(SUPPORT_KONTEKST[f], `${f} mangler en label`);
  });

  it("bærer ingen forbudte felter i demo-sættet", () => {
    for (const s of DEMO_SUPPORTSAGER) {
      const { afvist } = kontekstFilter(s.kontekst || {});
      assert.deepEqual(afvist, [], `${s.nummer} bærer ${afvist.join(", ")}`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════
   BESLUTNING 24 — udtræk, ikke adgang
   ══════════════════════════════════════════════════════════════════════ */
describe("Auditudtrækket er bundet af en fast grænse", () => {
  const fejl = new Date(2026, 7, 18, 9, 14).getTime();

  it("er ±5 minutter og højst 50 poster", () => {
    assert.equal(AUDITUDTRAEK.minutterFoer, 5);
    assert.equal(AUDITUDTRAEK.minutterEfter, 5);
    assert.equal(AUDITUDTRAEK.maksPoster, 50);
  });

  it("beregner vinduet omkring fejltidspunktet", () => {
    const v = udtraekVindue(fejl);
    assert.equal(v.fra, fejl - 5 * MIN);
    assert.equal(v.til, fejl + 5 * MIN);
    assert.equal(udtraekVindue(null), null);
  });

  it("klipper poster uden for vinduet væk", () => {
    const poster = [
      { ms: fejl - 30 * MIN, handling: "login" },
      { ms: fejl - 2 * MIN, handling: "laes" },
      { ms: fejl, handling: "aendre" },
      { ms: fejl + 20 * MIN, handling: "laes" },
    ];
    const ud = klipUdtraek(poster, fejl);
    assert.equal(ud.poster.length, 2);
    assert.deepEqual(ud.poster.map((p) => p.handling), ["laes", "aendre"]);
  });

  /* Et loft der kan hæves af den der rammer det, er ikke et loft. */
  it("afkorter ved 50 poster og SIGER det", () => {
    const poster = Array.from({ length: 80 }, (_, i) => ({ ms: fejl + i * 100, handling: "laes" }));
    const ud = klipUdtraek(poster, fejl);
    assert.equal(ud.poster.length, 50);
    assert.equal(ud.afkortet, true, "et udtræk der er skåret i stilhed, læses som hele billedet");
  });

  it("siger fra når der ikke er noget fejltidspunkt", () => {
    const ud = klipUdtraek([{ ms: fejl }], null);
    assert.deepEqual(ud.poster, []);
    assert.equal(ud.vindue, null);
  });

  it("sorterer på tid", () => {
    const ud = klipUdtraek([
      { ms: fejl + MIN, handling: "b" }, { ms: fejl - MIN, handling: "a" },
    ], fejl);
    assert.deepEqual(ud.poster.map((p) => p.handling), ["a", "b"]);
  });

  /* Udtrækket må ikke bære det auditposten selv holder ude. */
  it("bærer ingen fritekst eller ip i demo-sættet", () => {
    for (const poster of Object.values(DEMO_AUDITUDTRAEK)) {
      for (const p of poster) {
        for (const forbudt of ["ip", "foer", "efter", "begrundelse", "note"]) {
          assert.equal(forbudt in p, false, `udtrækket bærer "${forbudt}"`);
        }
      }
    }
  });

  it("bliver faktisk klippet et sted i demo-sættet", () => {
    const sag = DEMO_SUPPORTSAGER.find((s) => DEMO_AUDITUDTRAEK[s.id]?.length && s.fejlMs);
    assert.ok(sag);
    assert.ok(demoUdtraek(sag).poster.length < DEMO_AUDITUDTRAEK[sag.id].length,
      "uden en klippet post kan grænsen ikke ses virke");
  });
});

/* ══════════════════════════════════════════════════════════════════════
   SUPPORTADGANG
   ══════════════════════════════════════════════════════════════════════ */
describe("Supportadgang er kundestyret og udløber selv", () => {
  const sag = DEMO_SUPPORTSAGER.find((s) => s.tenantId === "demo");

  it("lader kundens administrator bevilge", () => {
    assert.equal(kanGiveAdgang(admin("demo"), sag).ok, true);
  });

  /* Den der har brug for adgangen, må ikke være den der bevilger den —
     samme argument som beslutning 5. */
  it("nægter support at give sig selv adgang", () => {
    const svar = kanGiveAdgang(supporter, sag);
    assert.equal(svar.ok, false);
    assert.match(svar.aarsag, /kan ikke give sig selv/i);
  });

  it("nægter en anden tenants administrator", () => {
    assert.equal(kanGiveAdgang(admin("nordisk"), sag).ok, false);
  });

  it("nægter en kunde uden supportadgang.giv", () => {
    const svar = kanGiveAdgang(kunde("demo"), sag);
    assert.equal(svar.ok, false);
    assert.match(svar.aarsag, /supportadgang\.giv/);
  });

  it("kræver et formål", () => {
    assert.throws(
      () => byggBevilling({ sag, bruger: admin("demo"), varighed: "t4", type: "readOnly", formaal: "  " }),
      /formål/i
    );
  });

  it("afviser ukendt varighed og type", () => {
    const b = { sag, bruger: admin("demo"), formaal: "x" };
    assert.throws(() => byggBevilling({ ...b, varighed: "t99", type: "readOnly" }), /varighed/);
    assert.throws(() => byggBevilling({ ...b, varighed: "t4", type: "fuld" }), /adgangstype/);
  });

  it("sætter et udløb af den valgte varighed", () => {
    const nu = 1_700_000_000_000;
    const b = byggBevilling(
      { sag, bruger: admin("demo"), varighed: "t4", type: "readOnly", formaal: "Undersøge fejl" },
      nu
    );
    assert.equal(b.udloeberMs, nu + 4 * 3600000);
    assert.equal(b.tenantId, sag.tenantId);
    assert.equal(b.sagsnummer, sag.nummer);
    assert.equal(b.tilbagekaldtMs, null);
  });

  /* Et lagret aktiv-flag ville blive stående sandt den dag en oprydning
     fejler. aktiv er derfor AFLEDT af udløbstidspunktet. */
  it("afleder aktiv af tiden, ikke af et flag", () => {
    const nu = 1_700_000_000_000;
    const b = { udloeberMs: nu + 60000, tilbagekaldtMs: null };
    assert.equal(adgangAktiv(b, nu), true);
    assert.equal(adgangAktiv(b, nu + 120000), false, "adgangen skal udløbe af sig selv");
    assert.equal(adgangAktiv({ ...b, tilbagekaldtMs: nu }, nu), false);
    assert.equal(adgangAktiv(null, nu), false);
    assert.equal(adgangResterendeMin(b, nu + 120000), 0);
  });

  it("har både en aktiv og en udløbet bevilling i demo-sættet", () => {
    const bev = Object.values(DEMO_BEVILLINGER);
    assert.ok(bev.some((b) => adgangAktiv(b)));
    assert.ok(bev.some((b) => !adgangAktiv(b)), "at adgangen udløber skal kunne ses");
    for (const b of bev) assert.ok(b.formaal?.trim(), "en bevilling uden formål kan ikke revideres");
  });

  it("tilbyder de fire varigheder og read only som standard", () => {
    assert.deepEqual(Object.keys(ADGANG_VARIGHED), ["t1", "t4", "t8", "t24"]);
    assert.equal(ADGANG_TYPE.readOnly.skriv, false);
    assert.equal(ADGANG_TYPE.begraensetSkriv.skriv, true);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   NUMMERSERIEN
   ══════════════════════════════════════════════════════════════════════ */
describe("Sagsnummeret følger beslutning 8", () => {
  it("er SUP-ÅÅÅÅ-NNNNN med fem cifre", () => {
    for (const s of DEMO_SUPPORTSAGER) {
      assert.match(s.nummer, SUPPORT_NUMMER, `${s.nummer} har ikke fem cifre`);
    }
    /* Prototypen skrev SUP-2026-1024 med fire. Ét format uden undtagelser. */
    assert.equal(SUPPORT_NUMMER.test("SUP-2026-1024"), false);
    assert.equal(SUPPORT_NUMMER.test("SUP-2026-01024"), true);
  });

  it("bruger en GLOBAL counter, ikke en pr. tenant", () => {
    assert.equal(SUPPORT_SERIE.rod, "support");
    assert.equal(SUPPORT_SERIE.praefiks, "SUP");
  });

  it("giver ingen to sager samme nummer på tværs af tenants", () => {
    const numre = DEMO_SUPPORTSAGER.map((s) => s.nummer);
    assert.equal(new Set(numre).size, numre.length);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   Demo-sættet
   ══════════════════════════════════════════════════════════════════════ */
describe("Demo-supportsagerne hænger sammen", () => {
  it("bruger kendte kategorier, prioriteter og statusser", () => {
    for (const s of DEMO_SUPPORTSAGER) {
      assert.ok(SUPPORT_KATEGORI[s.kategori], `${s.nummer}: ukendt kategori`);
      assert.ok(SUPPORT_PRIORITET[s.prioritet], `${s.nummer}: ukendt prioritet`);
      assert.ok(SUPPORT_STATUS[s.status], `${s.nummer}: ukendt status`);
      assert.ok(DEMO_TENANTS[s.tenantId], `${s.nummer}: ukendt tenant`);
    }
  });

  it("giver hver sag en tråd", () => {
    for (const s of DEMO_SUPPORTSAGER) {
      assert.ok(demoBeskeder(s.id).length > 0, `${s.nummer} har ingen beskeder`);
    }
  });

  it("dækker både åbne og lukkede statusser", () => {
    assert.ok(DEMO_SUPPORTSAGER.some((s) => SUPPORT_STATUS[s.status].aaben));
    assert.ok(DEMO_SUPPORTSAGER.some((s) => !SUPPORT_STATUS[s.status].aaben));
  });

  it("har en kritisk sag, så prioriteten kan ses virke", () => {
    assert.ok(DEMO_SUPPORTSAGER.some((s) => s.prioritet === "kritisk"));
  });
});

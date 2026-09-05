import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AARSAGSKODE, KILDE, REFERENCEART, planningReference } from "../src/fleet/planning-basic.js";
import {
  DEMO_DAGSPLAN, DEMO_FLEET_KILDE_KOERETOEJER, DEMO_PLANNING_BASIC,
  DEMO_WORKFORCE_KILDE,
} from "../src/fleet/demo-planning-basic.js";
import { projicerTransportbooking } from "../src/fleet/planning-adapters/booking.js";
import { fraFleetKoeretoej } from "../src/fleet/planning-adapters/fleet.js";
import { fraWorkforceMedarbejder } from "../src/fleet/planning-adapters/workforce.js";
import {
  erUnderstoettetAfFaellesReservationer, kontrollerKandidatModEksisterende,
  overlapperReservationskandidat, tilReservationskandidater,
} from "../src/fleet/planning-adapters/reservationer.js";
import { opretStatiskPlanningProvider, samlProviderSnapshots } from "../src/fleet/planning-adapters/providers.js";

const her = dirname(fileURLToPath(import.meta.url));
const rod = resolve(her, "..");
const kode = (svar, forventet) => svar.fund.some((f) => f.kode === forventet);

describe("Fleet- og Workforce-adaptere", () => {
  it("bevarer Fleet-køretøjets ejer-id og normaliserer kapacitet", () => {
    const kilde = DEMO_FLEET_KILDE_KOERETOEJER[0];
    const ressource = fraFleetKoeretoej(kilde);
    assert.deepEqual(ressource.reference, { kilde: KILDE.FLEET, art: REFERENCEART.KOERETOEJ, id: kilde.id });
    assert.equal(ressource.ejerKilde, KILDE.FLEET);
    assert.equal(ressource.koeretoej.kapacitet.kg, 900);
  });

  it("bevarer personId og eksponerer aldrig fraværsårsag eller note", () => {
    const person = DEMO_WORKFORCE_KILDE.personale[2];
    const ressource = fraWorkforceMedarbejder(person, {
      kompetencer: DEMO_WORKFORCE_KILDE.kompetencer,
      fravaer: DEMO_WORKFORCE_KILDE.fravaer,
      vagter: DEMO_WORKFORCE_KILDE.vagter,
    });
    assert.equal(ressource.reference.id, person.id);
    assert.equal(ressource.reference.kilde, KILDE.WORKFORCE);
    assert.equal(ressource.tilgaengelighed.fravaer.length, 1);
    assert.equal("art" in ressource.tilgaengelighed.fravaer[0], false);
    assert.equal("note" in ressource.tilgaengelighed.fravaer[0], false);
    assert.doesNotMatch(JSON.stringify(ressource), /må aldrig adapteres/);
  });
});

describe("Bookingadapteren", () => {
  it("er en ren read-only projektion med eksisterende ejer-id'er", () => {
    const projektion = projicerTransportbooking({
      booking: { id: "bk-1", nummer: "BKG-DEMO", kundeId: "kunde-1" },
      etape: {
        id: "et-1", bookingId: "bk-1", tilstand: "reserveret",
        fra: 1000, til: 5000, etaMs: 4500, fraSted: "Fiktiv A", tilSted: "Fiktiv B",
        personId: "person-1", koeretoejIder: { "bil-1": true }, graenseovergange: [],
      },
      statushaendelser: [{ id: "h-1", type: "afgang", ms: 1200 }],
    });
    assert.equal(projektion.readOnly, true);
    assert.equal(projektion.reference.id, "et-1");
    assert.equal(projektion.medarbejderRefs[0].id, "person-1");
    assert.equal(projektion.koeretoejRefs[0].id, "bil-1");
    assert.ok(projektion.stop.length >= 2);
    assert.equal(typeof projektion.skriv, "undefined");
  });
});

describe("Reservationsadapteren", () => {
  it("producerer én kandidat pr. dokumenteret konkret ressourceinterval", () => {
    const svar = tilReservationskandidater(DEMO_DAGSPLAN);
    const forventet = DEMO_DAGSPLAN.ruter.reduce((n, r) => n + r.ressourcebrug.length, 0);
    assert.equal(svar.ok, true);
    assert.equal(svar.kandidater.length, forventet);
    for (const kandidat of svar.kandidater) {
      assert.ok(kandidat.fra < kandidat.til);
      assert.notEqual(kandidat.ressourceRef.art, REFERENCEART.TEAM);
      assert.equal(kandidat.kilde.type, KILDE.PLANNING);
    }
  });

  it("reserverer ikke kandidatteamets medlemmer automatisk", () => {
    const svar = tilReservationskandidater(DEMO_DAGSPLAN);
    const teamIder = new Set(DEMO_PLANNING_BASIC.ressourcer.filter((r) => r.reference.art === REFERENCEART.TEAM).map((r) => r.reference.id));
    assert.equal(svar.kandidater.some((k) => teamIder.has(k.ressourceId)), false);
  });

  it("bevarer et kortere dokumenteret udstyrsinterval", () => {
    const svar = tilReservationskandidater(DEMO_DAGSPLAN);
    const udstyr = svar.kandidater.find((k) => k.ressourceRef.id === "pb-udstyr-001");
    const rute = DEMO_DAGSPLAN.ruter[0];
    assert.ok(udstyr.fra > rute.fraMs);
    assert.ok(udstyr.til < rute.tilMs);
    assert.equal(erUnderstoettetAfFaellesReservationer(udstyr), false);
  });

  it("bruger halvåbne intervaller og den eksisterende rene konfliktkontrol", () => {
    const kandidat = {
      ressourceType: "medarbejder", ressourceId: "m-1", fra: 10, til: 20,
      kilde: { type: KILDE.PLANNING, id: "r-1" },
    };
    const nabo = { ressourceType: "medarbejder", ressourceId: "m-1", fra: 20, til: 30, kilde: { type: "manuel", id: "x" } };
    assert.equal(overlapperReservationskandidat(kandidat, nabo), false);
    assert.equal(kontrollerKandidatModEksisterende(kandidat, [nabo]).ok, true);
  });
});

describe("Providergrænsen", () => {
  it("samler Planning- og eksternt ejede objekter", () => {
    const planning = opretStatiskPlanningProvider({ id: "p", kilde: KILDE.PLANNING, snapshot: { ressourcer: [{ reference: planningReference(REFERENCEART.UDSTYR, "u-1"), ejerKilde: KILDE.PLANNING }] } });
    const fleet = opretStatiskPlanningProvider({ id: "f", kilde: KILDE.FLEET, snapshot: { ressourcer: [fraFleetKoeretoej(DEMO_FLEET_KILDE_KOERETOEJER[0])] } });
    const svar = samlProviderSnapshots([planning, fleet]);
    assert.equal(svar.ok, true);
    assert.equal(svar.snapshot.ressourcer.length, 2);
  });

  it("afviser dublerede typed references og uklart ejerskab", () => {
    const ressource = fraFleetKoeretoej(DEMO_FLEET_KILDE_KOERETOEJER[0]);
    const a = opretStatiskPlanningProvider({ id: "a", kilde: KILDE.FLEET, snapshot: { ressourcer: [ressource] } });
    const b = opretStatiskPlanningProvider({ id: "b", kilde: KILDE.FLEET, snapshot: { ressourcer: [ressource] } });
    assert.equal(kode(samlProviderSnapshots([a, b]), AARSAGSKODE.REFERENCE_DUBLET), true);
    const forkert = opretStatiskPlanningProvider({ id: "c", kilde: KILDE.PLANNING, snapshot: { ressourcer: [ressource] } });
    assert.equal(kode(samlProviderSnapshots([forkert]), AARSAGSKODE.REFERENCE_EJERSKAB_UKLART), true);
    const eksternDagsplan = opretStatiskPlanningProvider({ id: "d", kilde: KILDE.FLEET, snapshot: { dagsplaner: [{ id: "dp-ekstern" }] } });
    assert.equal(kode(samlProviderSnapshots([eksternDagsplan]), AARSAGSKODE.REFERENCE_EJERSKAB_UKLART), true);
  });
});

describe("Import- og sideeffektgrænser", () => {
  const nyeFiler = [
    "src/fleet/planning-basic.js", "src/fleet/planning-basic-validering.js",
    "src/fleet/demo-planning-basic.js", "src/fleet/planning-adapters/booking.js",
    "src/fleet/planning-adapters/fleet.js", "src/fleet/planning-adapters/workforce.js",
    "src/fleet/planning-adapters/reservationer.js", "src/fleet/planning-adapters/providers.js",
    "src/fleet/planning-basic-v2.js", "src/fleet/planning-basic-v2-kontrakt.js",
    "src/fleet/planning-basic-ruteskabeloner.js", "src/fleet/planning-basic-tidsberegning.js",
    "src/fleet/planning-basic-fremdrift.js", "src/fleet/demo-planning-basic-v2.js",
  ];

  const imports = (fil) => [...readFileSync(fil, "utf8").matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);

  function grafFra(start, sete = new Set()) {
    const fil = resolve(rod, start);
    if (sete.has(fil)) return sete;
    sete.add(fil);
    for (const imp of imports(fil)) {
      if (!imp.startsWith(".")) continue;
      let maal = resolve(dirname(fil), imp);
      if (!extname(maal)) maal += ".js";
      grafFra(maal, sete);
    }
    return sete;
  }

  it("kernen importerer kun valideringslaget og aldrig adaptere eller infrastruktur", () => {
    const kernefil = resolve(rod, "src/fleet/planning-basic.js");
    assert.deepEqual(imports(kernefil), ["./planning-basic-validering.js"]);
  });

  it("adapterernes transitive importgraf er fri for Firebase, permissions og booking-state", () => {
    const adaptere = nyeFiler.filter((f) => f.includes("planning-adapters/"));
    for (const adapter of adaptere) {
      const graf = [...grafFra(adapter)];
      for (const fil of graf) {
        assert.doesNotMatch(fil.replaceAll("\\", "/"), /firebase\.js|permissions\.js|booking-state\.js|\.jsx$/i, `${adapter} trækker ${fil} ind`);
        assert.doesNotMatch(readFileSync(fil, "utf8"), /from\s+["'][^"']*(firebase|permissions|booking-state|react)[^"']*["']/i, `${fil} har en forbudt import`);
      }
    }
  });

  it("ingen ny fil etablerer persistence eller eksterne kald", () => {
    for (const fil of nyeFiler) {
      const kilde = readFileSync(resolve(rod, fil), "utf8");
      assert.doesNotMatch(kilde, /kaldFunktion|httpsCallable|initializeApp|getDatabase|firebase\.|fetch\(/, fil);
      assert.doesNotMatch(kilde, /\b(?:db|ref)\s*\.\s*(?:set|update|push|remove)\s*\(/, fil);
    }
  });

  it("ingen eksisterende kildefil importerer Planning-kernen", () => {
    const src = resolve(rod, "src");
    const alle = [];
    const gaa = (mappe) => {
      for (const navn of readdirSync(mappe)) {
        const fil = join(mappe, navn);
        if (statSync(fil).isDirectory()) gaa(fil);
        else if (/\.(js|jsx)$/.test(navn)) alle.push(fil);
      }
    };
    gaa(src);
    const nye = new Set(nyeFiler.map((f) => resolve(rod, f)));
    for (const fil of alle.filter((f) => !nye.has(f))) assert.doesNotMatch(readFileSync(fil, "utf8"), /planning-basic/, fil);
  });
});

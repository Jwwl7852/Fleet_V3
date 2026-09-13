import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  anvendUnitBevaegelse,
  bindendeBookingerForUnit,
  bygWarehouseUnitbevaegelse,
  kanSelvstaendigUdlevere,
  lagerBelægningPrOmraade,
  normaliserUnitKode,
  sammenlignOperation,
  senesteUnitBevaegelser,
  slaaUnitOp,
  valideUnitBevaegelse,
  vareEjer,
  vareEjerforhold,
} from "../src/fleet/warehouse-unit.js";

test("gamle varer er fortsat kundegods, mens egne varer ikke får kundeafregning", () => {
  assert.equal(vareEjerforhold({ kundeId: "k1" }), "kunde");
  assert.deepEqual(vareEjer({ kundeId: "k1" }, [{ id: "k1", navn: "Kunde 1" }]), {
    ejerforhold: "kunde", label: "Kunde 1", kundeId: "k1",
  });
  assert.deepEqual(vareEjer({ ejerforhold: "egen", kundeId: null }), {
    ejerforhold: "egen", label: "Egen virksomhed", kundeId: null,
  });
});

test("QR-opslag genbruger råt unit-id og opretter aldrig en ukendt unit", () => {
  const units = [{ id: "MDT-101", pladsId: "modtagelse" }];
  assert.equal(normaliserUnitKode("  MDT-101\r\n"), "MDT-101");
  assert.equal(slaaUnitOp(units, "MDT-101").unit, units[0]);
  const ukendt = slaaUnitOp(units, "MDT-999");
  assert.equal(ukendt.ok, false);
  assert.equal(ukendt.art, "ukendt");
  assert.match(ukendt.besked, /ikke oprettet/i);
});

test("reservation ændrer ikke placering; fysisk udlevering og retur gør", () => {
  const unit = { id: "MDT-101", status: "ledig", pladsId: "p1", hjemPladsId: "p9" };
  assert.deepEqual(anvendUnitBevaegelse(unit, { art: "reservation" }), unit);
  assert.deepEqual(anvendUnitBevaegelse(unit, { art: "udlevering", fraPladsId: "p1" }), {
    ...unit, status: "udlaant", pladsId: null,
  });
  assert.deepEqual(anvendUnitBevaegelse(unit, { art: "retur", tilPladsId: "modtagelse" }), {
    ...unit, status: "ledig", pladsId: "modtagelse",
  });
});

test("retur kræver den faktiske modtagelsesplads og flytning kræver to forskellige pladser", () => {
  const ctx = { units: ["MDT-101"], pladser: ["p1", "p2"] };
  assert.equal(valideUnitBevaegelse({
    art: "retur", unitId: "MDT-101", operationId: "retur-0001",
  }, ctx).tilPladsId, "Vælg en destinationslokation.");
  assert.equal(valideUnitBevaegelse({
    art: "flytning", unitId: "MDT-101", fraPladsId: "p1", tilPladsId: "p1", operationId: "flyt-0001",
  }, ctx).tilPladsId, "Vælg en anden lokation.");
  assert.deepEqual(valideUnitBevaegelse({
    art: "flytning", unitId: "MDT-101", fraPladsId: "p1", tilPladsId: "p2", operationId: "flyt-0002",
  }, ctx), {});
});

test("idempotensnøgler er gyldige RTDB child keys", () => {
  const ctx = { units: ["MDT-101"], pladser: ["p1"] };
  assert.deepEqual(valideUnitBevaegelse({
    art: "retur", unitId: "MDT-101", operationId: "retur_0001", tilPladsId: "p1",
  }, ctx), {});
  assert.match(valideUnitBevaegelse({
    art: "retur", unitId: "MDT-101", operationId: "retur.0001", tilPladsId: "p1",
  }, ctx).operationId, /idempotensnøgle/);
});

test("serverhændelsen får serverfakta og en fast WAREHOUSE-kilde", () => {
  const bygget = bygWarehouseUnitbevaegelse({
    operationId: "flyt-0003", unitId: "MDT-101", art: "flytning",
    fraPladsId: "p1", tilPladsId: "p2", tidspunktMs: 1234, udfoertAf: "u1",
  });
  assert.equal(bygget.ok, true);
  assert.equal(bygget.bevaegelse.kilde, "warehouse");
  assert.equal(bygget.bevaegelse.tidspunktMs, 1234);
  assert.equal(bygget.bevaegelse.udfoertAf, "u1");
});

test("den fælles bevægelse kan komme fra begge moduler, men ikke fra en fri tekst", () => {
  const grundlag = {
    operationId: "flyt-0004", unitId: "MDT-101", art: "flytning",
    fraPladsId: "p1", tilPladsId: "p2", tidspunktMs: 1234, udfoertAf: "u1",
  };
  assert.equal(bygWarehouseUnitbevaegelse({ ...grundlag, kilde: "unitbooking" }).bevaegelse.kilde, "unitbooking");
  assert.equal(bygWarehouseUnitbevaegelse({ ...grundlag, kilde: "andet" }).ok, false);
});

test("aktiv booking spærrer selvstændig WAREHOUSE-udlevering", () => {
  const unit = { id: "MDT-101", pladsId: "p1" };
  const bookinger = [
    { id: "b1", kasseId: "MDT-101", tilstand: "booket" },
    { id: "b2", kasseId: "MDT-101", tilstand: "returneret" },
  ];
  assert.deepEqual(bindendeBookingerForUnit(bookinger, unit.id).map((b) => b.id), ["b1"]);
  assert.equal(kanSelvstaendigUdlevere(unit, bookinger).ok, false);
  assert.match(kanSelvstaendigUdlevere(unit, bookinger).besked, /UNIT Booking/);
  assert.equal(kanSelvstaendigUdlevere({ id: "MDT-102", pladsId: "p1" }, bookinger).ok, true);
});

test("idempotens skelner genafspilning fra operationId-konflikt", () => {
  const gemt = {
    eventId: "e1", unitId: "MDT-101", art: "flytning", fraPladsId: "p1", tilPladsId: "p2",
  };
  assert.deepEqual(sammenlignOperation(gemt, { ...gemt, eventId: undefined }), {
    art: "gentaget", eventId: "e1",
  });
  assert.equal(sammenlignOperation(gemt, { ...gemt, tilPladsId: "p3" }).art, "konflikt");
  assert.deepEqual(sammenlignOperation(null, gemt), { art: "ny" });
});

test("unit-historik er uforanderlig og sorteres uden at ændre input", () => {
  const input = [
    { id: "e1", unitId: "MDT-101", tidspunktMs: 10 },
    { id: "e2", unitId: "MDT-102", tidspunktMs: 30 },
    { id: "e3", unitId: "MDT-101", tidspunktMs: 20 },
  ];
  assert.deepEqual(senesteUnitBevaegelser(input, "MDT-101").map((e) => e.id), ["e3", "e1"]);
  assert.deepEqual(input.map((e) => e.id), ["e1", "e2", "e3"]);
});

test("belægning opgøres pr. lager og zone fra faktiske pladser", () => {
  assert.deepEqual(lagerBelægningPrOmraade([
    { id: "p1", hal: "Hovedlager", zone: "Modtagelse", status: "aktiv" },
    { id: "p2", hal: "Hovedlager", zone: "Modtagelse", status: "aktiv" },
    { id: "p3", hal: "Hovedlager", zone: "Karantæne", status: "karantaene" },
  ], { p1: { optaget: true } }), [
    { lager: "Hovedlager", zone: "Karantæne", pladser: 1, optaget: 0, spaerret: 1, belaegningPct: 0 },
    { lager: "Hovedlager", zone: "Modtagelse", pladser: 2, optaget: 1, spaerret: 0, belaegningPct: 50 },
  ]);
});

test("callable binder unit, historik og eventuel booking i én transaktion", () => {
  const kilde = readFileSync("functions/index.js", "utf8");
  const start = kilde.indexOf("export const unitlagerhandling");
  const slut = kilde.indexOf("export const bevaegelseskriv", start);
  const blok = kilde.slice(start, slut);
  assert.ok(blok.includes("rod.transaction("));
  assert.ok(blok.includes("ny.unitbevaegelser"));
  assert.ok(blok.includes("ny.kasser"));
  assert.ok(blok.includes("ny.kasseudlaan"));
  assert.ok(blok.includes("bindendeBookingerForUnit"));
  assert.ok(blok.includes("kraevUnitlagerskriv(req, kilde)"));
  assert.ok(!blok.includes("req.data?.tenant"));
  assert.ok(!blok.includes("req.data?.uid"));
});

test("unitoprettelse registrerer identitet og faktisk modtagelse atomisk", () => {
  const kilde = readFileSync("functions/index.js", "utf8");
  const start = kilde.indexOf("export const unitlageropret");
  const slut = kilde.indexOf("export const unitlagerhandling", start);
  const blok = kilde.slice(start, slut);
  assert.ok(blok.includes("rod.transaction("));
  assert.ok(blok.includes("ny.kasser"));
  assert.ok(blok.includes("ny.kassetyper"));
  assert.ok(blok.includes("ny.unitbevaegelser"));
  assert.ok(blok.includes('art: "modtagelse"'));
  assert.ok(blok.includes('kilde: "warehouse"'));
});

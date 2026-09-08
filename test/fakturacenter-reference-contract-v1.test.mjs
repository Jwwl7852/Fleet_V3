import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as kontrakt from "../src/fleet/fakturacenter-intake.js";

import {
  anvendFakturafordelingV1,
  beregnFaktiskOmkostningV1,
  bygFakturafordelingV1,
  bygReferencedestinationV1,
  FAKTURAART,
  FAKTURAVINDUE,
  FORDELING_KONTRAKT_VERSION,
  FORDELING_STATUS,
  KONTRAKT_FEJLKODE,
  matchReferencedestinationV1,
  REFERENCE_KONTRAKT_VERSION,
  validérFakturafordelingssætV1,
} from "../src/fleet/fakturacenter-intake.js";
import {
  referencedestinationerFraFleetV1,
} from "../src/fleet/fakturacenter-adapters/fleet.js";
import {
  referencedestinationerFraFacilityV1,
} from "../src/fleet/fakturacenter-adapters/facility.js";
import {
  referencedestinationerFraProcureV1,
} from "../src/fleet/fakturacenter-adapters/procure.js";
import * as fleetAdapter from "../src/fleet/fakturacenter-adapters/fleet.js";
import * as facilityAdapter from "../src/fleet/fakturacenter-adapters/facility.js";
import * as procureAdapter from "../src/fleet/fakturacenter-adapters/procure.js";

const TENANT = "tenant-syntetisk-a";
const NU = Date.UTC(2026, 8, 7, 10, 0, 0);

function destinationsinput(overrides = {}) {
  return {
    kontraktVersion: 1,
    proveniens: "autoritative",
    tenantId: TENANT,
    modul: "fleet",
    destinationId: "opgave-demo-1",
    veyroReference: "FLT-2026-00481",
    bestillingsnummer: "PO-FLT-00481",
    destinationstype: "vaerkstedsopgave",
    navn: "Syntetisk værkstedsopgave",
    operationelStatus: "afsluttet",
    leverandoer: { id: "leverandoer-demo-1", cvr: null, navn: "Syntetisk Værksted" },
    enhedsreferencer: {
      id: "enhed-demo-1",
      interntNummer: "ENH-0042",
      registreringsnummer: "DE MO 42",
      stelSerieNummer: "SYNTH-VIN-00042",
      navn: "Syntetisk enhed",
      kundereferencer: ["Nordrute Ø"],
    },
    referencer: ["SAG-Ø-123"],
    fakturastatus: FAKTURAVINDUE.aaben,
    oprettetMs: NU - 10_000,
    aendretMs: NU,
    forventetNettoOere: 125_000,
    lokation: "Syntetisk depot",
    koststeder: ["KST-DEMO"],
    ...overrides,
  };
}

function fordelinginput(overrides = {}) {
  return {
    kontraktVersion: 1,
    tenantId: TENANT,
    fordelingId: "fordeling-demo-1",
    fakturaId: "faktura-demo-1",
    intakeId: null,
    modul: "fleet",
    destinationId: "opgave-demo-1",
    nettoOere: 125_000,
    dokumenttype: FAKTURAART.faktura,
    status: FORDELING_STATUS.kladde,
    idempotensnoegle: "idem-demo-0001",
    tidspunktMs: NU,
    aktoerId: "bruger-demo-1",
    korrelationsId: "request-demo-0001",
    revisionsaarsagskode: null,
    revisionsaarsag: null,
    erstatterFordelingId: null,
    ...overrides,
  };
}

function kontekst(destination, overrides = {}) {
  return {
    aktuelTenantId: TENANT,
    harAdgang: true,
    aktoerId: "bruger-demo-1",
    destination,
    ...overrides,
  };
}

describe("Referencedestination V1", () => {
  test("er eksplicit versionsstyret, fail-closed og tenantafgrænset", () => {
    assert.equal(REFERENCE_KONTRAKT_VERSION, 1);
    assert.equal(bygReferencedestinationV1(destinationsinput()).ok, true);
    assert.equal(bygReferencedestinationV1(destinationsinput({ kontraktVersion: undefined })).fejl,
      KONTRAKT_FEJLKODE.referenceVersionMangler);
    assert.equal(bygReferencedestinationV1(destinationsinput({ kontraktVersion: 2 })).fejl,
      KONTRAKT_FEJLKODE.referenceVersionUkendt);
    assert.equal(bygReferencedestinationV1(destinationsinput({ modul: "finance" })).fejl,
      KONTRAKT_FEJLKODE.modulUgyldigt);
    assert.equal(bygReferencedestinationV1(destinationsinput({ fakturastatus: "ukendt" })).fejl,
      KONTRAKT_FEJLKODE.fakturavindueUgyldigt);
    assert.equal(bygReferencedestinationV1(destinationsinput(), {
      aktuelTenantId: "tenant-syntetisk-b",
    }).fejl, KONTRAKT_FEJLKODE.crossTenant);
  });

  test("afviser tomme eller ustabile id'er og usikre estimater", () => {
    for (const destinationId of ["", " med mellemrum ", "sti/demo", {}, null]) {
      assert.equal(bygReferencedestinationV1(destinationsinput({ destinationId })).fejl,
        KONTRAKT_FEJLKODE.destinationIdUgyldigt);
    }
    assert.equal(bygReferencedestinationV1(destinationsinput({ leverandoer: { id: "" } })).fejl,
      KONTRAKT_FEJLKODE.leverandoerIdUgyldigt);
    for (const forventetNettoOere of [1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, "125000", -1]) {
      assert.equal(bygReferencedestinationV1(destinationsinput({ forventetNettoOere })).fejl,
        KONTRAKT_FEJLKODE.estimatUgyldigt);
    }
  });

  test("matcher eksakte tokens uden danske eller numeriske kollisioner", () => {
    const ø = bygReferencedestinationV1(destinationsinput({
      destinationId: "opgave-demo-oe",
      veyroReference: "SAG-Ø-123",
      referencer: [],
    })).destination;
    const oe = bygReferencedestinationV1(destinationsinput({
      destinationId: "opgave-demo-oe-latin",
      veyroReference: "SAG-OE-123",
      referencer: [],
    })).destination;
    const resultat = matchReferencedestinationV1({
      aktuelTenantId: TENANT,
      reference: "Faktura: SAG-Ø-123",
      destinationer: [ø, oe],
    });
    assert.equal(resultat.ok, true);
    assert.deepEqual(resultat.destinationer.map((d) => d.destinationId), ["opgave-demo-oe"]);
    assert.equal(matchReferencedestinationV1({
      aktuelTenantId: TENANT,
      reference: "912345",
      destinationer: [bygReferencedestinationV1(destinationsinput({
        veyroReference: "1234",
      })).destination],
    }).destinationer.length, 0);
  });

  test("cross-tenant opslag afvises samlet uden at lække kandidater", () => {
    const andenTenant = bygReferencedestinationV1(destinationsinput({
      tenantId: "tenant-syntetisk-b",
    })).destination;
    const resultat = matchReferencedestinationV1({
      aktuelTenantId: TENANT,
      reference: "FLT-2026-00481",
      destinationer: [andenTenant],
    });
    assert.equal(resultat.ok, false);
    assert.equal(resultat.fejl, KONTRAKT_FEJLKODE.crossTenant);
    assert.deepEqual(resultat.destinationer, []);
  });

  test("de tre read-only adaptere leverer samme V1-form uden mutation", () => {
    const grundlag = {
      tenantId: TENANT,
      id: "destination-demo-1",
      navn: "Syntetisk destination",
      operationelStatus: "afsluttet",
      fakturastatus: FAKTURAVINDUE.delvis,
      datoMs: NU,
      oprettetMs: NU - 1,
      aendretMs: NU,
      veyroReference: "VEY-2026-0001",
      leverandoer: { id: "leverandoer-demo-1", navn: "Syntetisk leverandør" },
      referencer: ["VEY-2026-0001"],
      enhed: null,
      aktiv: null,
      lokation: "Syntetisk lokation",
      koststeder: ["KST-DEMO"],
      estimatNettoOere: 100,
      ordreNettoOere: 100,
    };
    const før = structuredClone(grundlag);
    const destinationer = [
      referencedestinationerFraFleetV1([grundlag])[0],
      referencedestinationerFraFacilityV1([grundlag])[0],
      referencedestinationerFraProcureV1([grundlag])[0],
    ];
    assert.deepEqual(destinationer.map((d) => d.modul), ["fleet", "facility", "procure"]);
    assert.ok(destinationer.every((d) => d.kontraktVersion === 1 && Object.isFrozen(d)));
    assert.deepEqual(destinationer.map((d) => Object.keys(d).sort()),
      [Object.keys(destinationer[0]).sort(), Object.keys(destinationer[0]).sort(),
        Object.keys(destinationer[0]).sort()]);
    assert.deepEqual(grundlag, før);
  });
});

describe("Fakturafordeling V1", () => {
  test("validerer version, enums, tenant, id'er, sikre øre og fortegn", () => {
    assert.equal(FORDELING_KONTRAKT_VERSION, 1);
    assert.equal(bygFakturafordelingV1(fordelinginput()).ok, true);
    const cases = [
      [{ kontraktVersion: undefined }, KONTRAKT_FEJLKODE.fordelingVersionMangler],
      [{ kontraktVersion: 2 }, KONTRAKT_FEJLKODE.fordelingVersionUkendt],
      [{ modul: "finance" }, KONTRAKT_FEJLKODE.modulUgyldigt],
      [{ status: "betalt" }, KONTRAKT_FEJLKODE.fordelingStatusUgyldig],
      [{ fordelingId: "" }, KONTRAKT_FEJLKODE.fordelingIdUgyldigt],
      [{ fakturaId: null, intakeId: null }, KONTRAKT_FEJLKODE.fakturaEllerIntakeIdMangler],
      [{ nettoOere: 1.5 }, KONTRAKT_FEJLKODE.beloebUgyldigt],
      [{ nettoOere: Number.MAX_SAFE_INTEGER + 1 }, KONTRAKT_FEJLKODE.beloebUgyldigt],
      [{ nettoOere: -1 }, KONTRAKT_FEJLKODE.fortegnUgyldigt],
      [{ dokumenttype: FAKTURAART.kreditnota, nettoOere: 1 }, KONTRAKT_FEJLKODE.fortegnUgyldigt],
      [{ dokumenttype: FAKTURAART.kreditnota, nettoOere: -1 }, null],
    ];
    for (const [ændring, fejl] of cases) {
      const resultat = bygFakturafordelingV1(fordelinginput(ændring));
      assert.equal(resultat.fejl, fejl, JSON.stringify(ændring));
    }
    assert.equal(bygFakturafordelingV1(fordelinginput(), {
      aktuelTenantId: "tenant-syntetisk-b",
    }).fejl, KONTRAKT_FEJLKODE.crossTenant);
  });

  test("kræver revisionsårsag ved genåbning eller tilbageførsel", () => {
    assert.equal(bygFakturafordelingV1(fordelinginput({
      status: FORDELING_STATUS.tilbagefoert,
    })).fejl, KONTRAKT_FEJLKODE.revisionsaarsagMangler);
    assert.equal(bygFakturafordelingV1(fordelinginput({
      status: FORDELING_STATUS.tilbagefoert,
      revisionsaarsagskode: "FAKTURA_GENÅBNET",
      revisionsaarsag: "Syntetisk genåbning",
    })).ok, true);
  });

  test("lukket fakturavindue afviser nye fordelinger og cross-tenant kobling", () => {
    const lukket = bygReferencedestinationV1(destinationsinput({
      fakturastatus: FAKTURAVINDUE.lukket,
    })).destination;
    const åben = bygReferencedestinationV1(destinationsinput()).destination;
    assert.equal(anvendFakturafordelingV1([], fordelinginput(), kontekst(lukket)).fejl,
      KONTRAKT_FEJLKODE.destinationLukket);
    assert.equal(anvendFakturafordelingV1([], fordelinginput({
      tenantId: "tenant-syntetisk-b",
    }), kontekst(åben)).fejl, KONTRAKT_FEJLKODE.crossTenant);
    assert.equal(anvendFakturafordelingV1([], fordelinginput(),
      kontekst(åben, { aktoerId: "anden-demo-bruger" })).fejl,
    KONTRAKT_FEJLKODE.aktoerMismatch);
    assert.equal(anvendFakturafordelingV1([], fordelinginput(),
      kontekst(åben, { harAdgang: false })).fejl,
    KONTRAKT_FEJLKODE.adgangAfvist);
  });

  test("samlet nettobeløb skal være fuldt fordelt før kontrol", () => {
    const første = fordelinginput({
      fordelingId: "fordeling-a", nettoOere: 60_000, status: FORDELING_STATUS.kladde,
      idempotensnoegle: "idem-a", korrelationsId: "request-a",
    });
    const anden = fordelinginput({
      fordelingId: "fordeling-b", nettoOere: 64_999, status: FORDELING_STATUS.kladde,
      idempotensnoegle: "idem-b", korrelationsId: "request-b",
    });
    assert.equal(validérFakturafordelingssætV1({
      aktuelTenantId: TENANT,
      forventetFakturaId: "faktura-demo-1",
      fakturaNettoOere: 125_000,
      dokumenttype: FAKTURAART.faktura,
      fordelinger: [første, anden],
    }).fejl, KONTRAKT_FEJLKODE.fordelingUfuldstaendig);
    assert.equal(validérFakturafordelingssætV1({
      aktuelTenantId: TENANT,
      forventetFakturaId: "faktura-demo-1",
      fakturaNettoOere: 125_000,
      dokumenttype: FAKTURAART.faktura,
      fordelinger: [første, { ...anden, nettoOere: 65_000 }],
    }).ok, true);
  });

  test("idempotens genbruger samme payload og afviser konflikt", () => {
    const destination = bygReferencedestinationV1(destinationsinput()).destination;
    const første = anvendFakturafordelingV1([], fordelinginput(), kontekst(destination));
    assert.equal(første.ok, true);
    assert.equal(første.historik.length, 1);
    const igen = anvendFakturafordelingV1(første.historik, fordelinginput(), kontekst(destination));
    assert.equal(igen.ok, true);
    assert.equal(igen.genbrugt, true);
    assert.equal(igen.historik.length, 1);
    const konflikt = anvendFakturafordelingV1(første.historik,
      fordelinginput({ nettoOere: 124_999 }), kontekst(destination));
    assert.equal(konflikt.ok, false);
    assert.equal(konflikt.fejl, KONTRAKT_FEJLKODE.idempotensKonflikt);
    assert.equal(konflikt.historik.length, 1);
  });

  test("gentagen kontrol giver ingen dobbelt omkostning eller historik", () => {
    const destination = bygReferencedestinationV1(destinationsinput()).destination;
    const kladde = anvendFakturafordelingV1([], fordelinginput(), kontekst(destination));
    const første = anvendFakturafordelingV1(kladde.historik, fordelinginput({
      status: FORDELING_STATUS.kontrolleret,
      idempotensnoegle: "idem-demo-0002",
      korrelationsId: "request-demo-0002",
      tidspunktMs: NU + 1,
    }), kontekst(destination));
    const gentaget = anvendFakturafordelingV1(første.historik, fordelinginput({
      status: FORDELING_STATUS.kontrolleret,
      idempotensnoegle: "idem-demo-0003",
      korrelationsId: "request-demo-0003",
      tidspunktMs: NU + 2,
    }), kontekst(destination));
    assert.equal(gentaget.fejl, KONTRAKT_FEJLKODE.fordelingAlleredeKontrolleret);
    assert.equal(gentaget.historik.length, 2);
    assert.equal(beregnFaktiskOmkostningV1(første.historik, {
      aktuelTenantId: TENANT,
      modul: "fleet",
      destinationId: "opgave-demo-1",
    }).nettoOere, 125_000);
  });

  test("kladder påvirker ikke omkostning, kreditnotaer trækker fra, og genåbning genberegner", () => {
    const destination = bygReferencedestinationV1(destinationsinput()).destination;
    const kladde = anvendFakturafordelingV1([], fordelinginput({
      status: FORDELING_STATUS.kladde,
    }), kontekst(destination));
    assert.equal(beregnFaktiskOmkostningV1(kladde.historik, {
      aktuelTenantId: TENANT, modul: "fleet", destinationId: "opgave-demo-1",
    }).nettoOere, 0);

    const faktura = anvendFakturafordelingV1(kladde.historik,
      fordelinginput({ status: FORDELING_STATUS.kontrolleret, tidspunktMs: NU + 1,
        idempotensnoegle: "idem-kontrol", korrelationsId: "request-kontrol" }),
      kontekst(destination));
    const kreditKladde = anvendFakturafordelingV1(faktura.historik, fordelinginput({
      fordelingId: "fordeling-kredit-1",
      fakturaId: "kreditnota-demo-1",
      nettoOere: -25_000,
      dokumenttype: FAKTURAART.kreditnota,
      idempotensnoegle: "idem-kredit",
      korrelationsId: "request-kredit",
      tidspunktMs: NU + 2,
    }), kontekst(destination));
    const kredit = anvendFakturafordelingV1(kreditKladde.historik, fordelinginput({
      status: FORDELING_STATUS.kontrolleret,
      fordelingId: "fordeling-kredit-1",
      fakturaId: "kreditnota-demo-1",
      nettoOere: -25_000,
      dokumenttype: FAKTURAART.kreditnota,
      idempotensnoegle: "idem-kredit-kontrol",
      korrelationsId: "request-kredit-kontrol",
      tidspunktMs: NU + 3,
    }), kontekst(destination));
    assert.equal(beregnFaktiskOmkostningV1(kredit.historik, {
      aktuelTenantId: TENANT, modul: "fleet", destinationId: "opgave-demo-1",
    }).nettoOere, 100_000);

    const tilbageført = anvendFakturafordelingV1(kredit.historik, fordelinginput({
      status: FORDELING_STATUS.tilbagefoert,
      idempotensnoegle: "idem-tilbagefoer",
      korrelationsId: "request-tilbagefoer",
      tidspunktMs: NU + 4,
      revisionsaarsagskode: "FAKTURA_GENÅBNET",
      revisionsaarsag: "Syntetisk faktura genåbnet",
    }), kontekst(destination));
    assert.equal(tilbageført.ok, true);
    assert.equal(beregnFaktiskOmkostningV1(tilbageført.historik, {
      aktuelTenantId: TENANT, modul: "fleet", destinationId: "opgave-demo-1",
    }).nettoOere, -25_000);
    assert.equal(kredit.historik.length, 4);
    assert.equal(tilbageført.historik.length, 5);
  });

  test("input og append-only historik muteres ikke", () => {
    const destination = bygReferencedestinationV1(destinationsinput()).destination;
    const input = fordelinginput();
    const inputFør = structuredClone(input);
    const historik = Object.freeze([]);
    const resultat = anvendFakturafordelingV1(historik, input, kontekst(destination));
    assert.deepEqual(input, inputFør);
    assert.equal(historik.length, 0);
    assert.ok(Object.isFrozen(resultat.historik));
    assert.ok(Object.isFrozen(resultat.historik[0]));

    const mutabelFortid = structuredClone(resultat.historik);
    const medKredit = anvendFakturafordelingV1(mutabelFortid, fordelinginput({
      fordelingId: "fordeling-kredit-mutation",
      fakturaId: "kreditnota-mutation",
      nettoOere: -1,
      dokumenttype: FAKTURAART.kreditnota,
      idempotensnoegle: "idem-kredit-mutation",
      korrelationsId: "request-kredit-mutation",
      tidspunktMs: NU + 1,
    }), kontekst(destination));
    assert.equal(medKredit.ok, true);
    mutabelFortid[0].fordeling.nettoOere = 1;
    assert.equal(medKredit.historik[0].fordeling.nettoOere, 125_000);
    assert.ok(Object.isFrozen(medKredit.historik[0].fordeling));
  });
});

describe("Reference Contract V1 review-regressioner", () => {
  test("adskiller eksisterende intern modulenum fra integrationsenum V1", () => {
    assert.deepEqual(kontrakt.MODUL, {
      fleet: "FLEET", facility: "FACILITY", procure: "PROCURE",
    });
    assert.deepEqual(kontrakt.REFERENCE_MODUL_V1, {
      fleet: "fleet", facility: "facility", procure: "procure",
    });
    assert.equal(kontrakt.tilReferenceModulV1("FLEET"), "fleet");
    assert.equal(kontrakt.fraReferenceModulV1("procure"), "PROCURE");
    assert.equal(kontrakt.tilReferenceModulV1("fleet"), null);
  });

  test("afviser ukendte kontraktfelter og forkert typede valgfrie felter", () => {
    assert.equal(bygReferencedestinationV1(destinationsinput({ hemmeligtEkstra: true })).fejl,
      KONTRAKT_FEJLKODE.feltUkendt);
    assert.equal(bygReferencedestinationV1(destinationsinput({ bestillingsnummer: 42 })).fejl,
      KONTRAKT_FEJLKODE.bestillingsnummerUgyldigt);
    assert.equal(bygReferencedestinationV1(destinationsinput({ referencer: "SAG-1" })).fejl,
      KONTRAKT_FEJLKODE.referenceUgyldig);
    assert.equal(bygReferencedestinationV1(destinationsinput({ enhed: [] })).fejl,
      KONTRAKT_FEJLKODE.feltUkendt);
    assert.equal(bygFakturafordelingV1(fordelinginput({ ekstra: true })).fejl,
      KONTRAKT_FEJLKODE.feltUkendt);
    assert.equal(bygFakturafordelingV1(fordelinginput({ intakeId: 42 })).fejl,
      KONTRAKT_FEJLKODE.intakeIdUgyldigt);
  });

  test("afviser ukendte nested felter før værdifejl og bevarer specifikke ID-fejl", () => {
    const ukendtLeverandoerfelt = destinationsinput({
      leverandoer: {
        ...destinationsinput().leverandoer,
        id: "",
        ukendtFelt: true,
      },
    });
    assert.equal(bygReferencedestinationV1(ukendtLeverandoerfelt).fejl,
      KONTRAKT_FEJLKODE.feltUkendt);

    const ukendtEnhedsfelt = destinationsinput({
      enhedsreferencer: {
        ...destinationsinput().enhedsreferencer,
        id: "",
        ukendtFelt: true,
      },
    });
    assert.equal(bygReferencedestinationV1(ukendtEnhedsfelt).fejl,
      KONTRAKT_FEJLKODE.feltUkendt);

    assert.equal(bygReferencedestinationV1(destinationsinput({
      leverandoer: { ...destinationsinput().leverandoer, id: "" },
    })).fejl, KONTRAKT_FEJLKODE.leverandoerIdUgyldigt);
    assert.equal(bygReferencedestinationV1(destinationsinput({
      enhedsreferencer: { ...destinationsinput().enhedsreferencer, id: "" },
    })).fejl, KONTRAKT_FEJLKODE.enhedIdUgyldigt);
  });

  test("afviser null, streng, ukendt og fremtidig version fail-closed", () => {
    for (const kontraktVersion of [null, "1", 0, 2, 999]) {
      assert.equal(bygReferencedestinationV1(destinationsinput({ kontraktVersion })).fejl,
        KONTRAKT_FEJLKODE.referenceVersionUkendt);
      assert.equal(bygFakturafordelingV1(fordelinginput({ kontraktVersion })).fejl,
        KONTRAKT_FEJLKODE.fordelingVersionUkendt);
    }
  });

  test("håndhæver længdegrænser for id'er, navne, referencer og arrays", () => {
    assert.equal(bygReferencedestinationV1(destinationsinput({ destinationId: `d${"x".repeat(128)}` })).fejl,
      KONTRAKT_FEJLKODE.vaerdiForLang);
    assert.equal(bygReferencedestinationV1(destinationsinput({ navn: "n".repeat(201) })).fejl,
      KONTRAKT_FEJLKODE.vaerdiForLang);
    assert.equal(bygReferencedestinationV1(destinationsinput({ veyroReference: "V".repeat(129) })).fejl,
      KONTRAKT_FEJLKODE.vaerdiForLang);
    assert.equal(bygReferencedestinationV1(destinationsinput({
      referencer: Array.from({ length: 21 }, (_, i) => `REF-${i}`),
    })).fejl, KONTRAKT_FEJLKODE.vaerdiForLang);
    assert.equal(matchReferencedestinationV1({
      aktuelTenantId: TENANT, reference: "R".repeat(129), destinationer: [],
    }).fejl, KONTRAKT_FEJLKODE.vaerdiForLang);
  });

  test("bevarer Unicode NFC og adskiller alle eksakte danske kundereferencer", () => {
    const værdier = ["Æ-123", "AE-123", "Ø-123", "OE-123", "Å-123", "AA-123", "A-123", "O-123", "123"];
    const normaliserede = værdier.map(kontrakt.normaliserKundereference);
    assert.equal(new Set(normaliserede).size, værdier.length);
    assert.equal(kontrakt.normaliserKundereference("A\u030A-001"),
      kontrakt.normaliserKundereference("Å-001"));
    assert.notEqual(kontrakt.normaliserKundereference("Ø-123"),
      kontrakt.normaliserKundereference("OE-123"));
    assert.notEqual(kontrakt.normaliserReference("00123"), kontrakt.normaliserReference("123"));
    assert.equal(matchReferencedestinationV1({
      aktuelTenantId: TENANT,
      reference: "Faktura 912345",
      destinationer: [bygReferencedestinationV1(destinationsinput({ veyroReference: "1234" })).destination],
    }).destinationer.length, 0);
  });

  test("måler referencegrænser efter trim og NFC-normalisering", () => {
    const composed = "Å".repeat(128);
    const decomposed = "A\u030A".repeat(128);
    const composedResultat = bygReferencedestinationV1(destinationsinput({
      veyroReference: composed,
    }));
    const decomposedResultat = bygReferencedestinationV1(destinationsinput({
      veyroReference: `  ${decomposed}  `,
    }));
    assert.equal(composedResultat.ok, true);
    assert.equal(decomposedResultat.ok, true);
    assert.equal(decomposedResultat.destination.veyroReference, composed);
    assert.equal(bygReferencedestinationV1(destinationsinput({
      veyroReference: "A\u030A".repeat(129),
    })).fejl, KONTRAKT_FEJLKODE.vaerdiForLang);

    const forskellige = ["Æ-123", "AE-123", "Ø-123", "OE-123", "Å-123", "AA-123"]
      .map(kontrakt.normaliserKundereference);
    assert.equal(new Set(forskellige).size, forskellige.length);
    assert.notEqual(kontrakt.normaliserKundereference("00123"),
      kontrakt.normaliserKundereference("123"));
    assert.equal(matchReferencedestinationV1({
      aktuelTenantId: TENANT,
      reference: "Følgeseddel 912345",
      destinationer: [bygReferencedestinationV1(destinationsinput({
        veyroReference: "1234",
      })).destination],
    }).destinationer.length, 0);
  });

  test("kræver én fakturaidentitet, ens intake-provenance og unikke fordelings-id'er", () => {
    const grundlag = {
      aktuelTenantId: TENANT,
      forventetFakturaId: "faktura-demo-1",
      fakturaNettoOere: 125_000,
      dokumenttype: FAKTURAART.faktura,
    };
    const a = fordelinginput({ status: FORDELING_STATUS.kladde, nettoOere: 60_000,
      fordelingId: "fordeling-a", idempotensnoegle: "idem-a", korrelationsId: "req-a" });
    const andenFaktura = fordelinginput({ status: FORDELING_STATUS.kladde, nettoOere: 65_000,
      fordelingId: "fordeling-b", fakturaId: "faktura-anden", idempotensnoegle: "idem-b",
      korrelationsId: "req-b" });
    assert.equal(validérFakturafordelingssætV1({ ...grundlag, fordelinger: [a, andenFaktura] }).fejl,
      KONTRAKT_FEJLKODE.blandetFakturaIdentitet);
    const intakeA = { ...a, intakeId: "intake-a" };
    const intakeB = { ...andenFaktura, fakturaId: "faktura-demo-1", intakeId: "intake-b" };
    assert.equal(validérFakturafordelingssætV1({ ...grundlag, fordelinger: [intakeA, intakeB] }).fejl,
      KONTRAKT_FEJLKODE.blandetFakturaIdentitet);
    assert.equal(validérFakturafordelingssætV1({ ...grundlag,
      fordelinger: [a, { ...andenFaktura, fakturaId: "faktura-demo-1", fordelingId: "fordeling-a" }],
    }).fejl, KONTRAKT_FEJLKODE.fordelingIdKonflikt);
  });

  test("afviser nul, accepterer safe-integer-grænsen og stopper sum-overflow", () => {
    assert.equal(bygFakturafordelingV1(fordelinginput({ nettoOere: 0 })).fejl,
      KONTRAKT_FEJLKODE.beloebUgyldigt);
    assert.equal(bygFakturafordelingV1(fordelinginput({
      status: FORDELING_STATUS.kladde, nettoOere: Number.MAX_SAFE_INTEGER,
    })).ok, true);
    const første = fordelinginput({ status: FORDELING_STATUS.kladde,
      fordelingId: "max-a", nettoOere: Number.MAX_SAFE_INTEGER,
      idempotensnoegle: "idem-max-a", korrelationsId: "req-max-a" });
    const anden = fordelinginput({ status: FORDELING_STATUS.kladde,
      fordelingId: "max-b", nettoOere: 1,
      idempotensnoegle: "idem-max-b", korrelationsId: "req-max-b" });
    assert.equal(validérFakturafordelingssætV1({ aktuelTenantId: TENANT,
      forventetFakturaId: "faktura-demo-1", fakturaNettoOere: Number.MAX_SAFE_INTEGER,
      dokumenttype: FAKTURAART.faktura, fordelinger: [første, anden],
    }).fejl, KONTRAKT_FEJLKODE.omkostningOverflow);
  });

  test("en ny fordeling skal starte som kladde", () => {
    const destination = bygReferencedestinationV1(destinationsinput()).destination;
    const resultat = anvendFakturafordelingV1([], fordelinginput({
      status: FORDELING_STATUS.kontrolleret,
    }), kontekst(destination));
    assert.equal(resultat.fejl, KONTRAKT_FEJLKODE.tilstandsovergangUgyldig);
  });

  test("håndhæver kladde → kontrolleret → tilbagefoert med stigende tid", () => {
    const destination = bygReferencedestinationV1(destinationsinput()).destination;
    const kladde = anvendFakturafordelingV1([], fordelinginput({
      status: FORDELING_STATUS.kladde,
    }), kontekst(destination));
    assert.equal(kladde.ok, true);
    const sammeTid = anvendFakturafordelingV1(kladde.historik, fordelinginput({
      status: FORDELING_STATUS.kontrolleret, idempotensnoegle: "idem-kontrol",
      korrelationsId: "req-kontrol",
    }), kontekst(destination));
    assert.equal(sammeTid.fejl, KONTRAKT_FEJLKODE.haendelsesraekkefoelgeUgyldig);
    const kontrol = anvendFakturafordelingV1(kladde.historik, fordelinginput({
      status: FORDELING_STATUS.kontrolleret, tidspunktMs: NU + 1,
      idempotensnoegle: "idem-kontrol", korrelationsId: "req-kontrol",
    }), kontekst(destination));
    assert.equal(kontrol.ok, true);
    const tilbage = anvendFakturafordelingV1(kontrol.historik, fordelinginput({
      status: FORDELING_STATUS.tilbagefoert, tidspunktMs: NU + 2,
      idempotensnoegle: "idem-tilbage", korrelationsId: "req-tilbage",
      revisionsaarsagskode: "FAKTURA_GENÅBNET", revisionsaarsag: "Syntetisk rettelse",
    }), kontekst(destination));
    assert.equal(tilbage.ok, true);
    const dobbelt = anvendFakturafordelingV1(tilbage.historik, fordelinginput({
      status: FORDELING_STATUS.tilbagefoert, tidspunktMs: NU + 3,
      idempotensnoegle: "idem-tilbage-2", korrelationsId: "req-tilbage-2",
      revisionsaarsagskode: "FAKTURA_GENÅBNET", revisionsaarsag: "Syntetisk rettelse igen",
    }), kontekst(destination));
    assert.equal(dobbelt.fejl, KONTRAKT_FEJLKODE.tilbagefoerselUgyldig);
    const nyKladde = anvendFakturafordelingV1(tilbage.historik, fordelinginput({
      status: FORDELING_STATUS.kladde, fordelingId: "fordeling-demo-2",
      erstatterFordelingId: "fordeling-demo-1", tidspunktMs: NU + 3,
      idempotensnoegle: "idem-ny-revision", korrelationsId: "req-ny-revision",
    }), kontekst(destination));
    assert.equal(nyKladde.ok, true);
    const nyKontrol = anvendFakturafordelingV1(nyKladde.historik, fordelinginput({
      status: FORDELING_STATUS.kontrolleret, fordelingId: "fordeling-demo-2",
      erstatterFordelingId: "fordeling-demo-1", tidspunktMs: NU + 4,
      idempotensnoegle: "idem-ny-kontrol", korrelationsId: "req-ny-kontrol",
    }), kontekst(destination));
    assert.equal(nyKontrol.ok, true);
    assert.equal(beregnFaktiskOmkostningV1(nyKontrol.historik, {
      aktuelTenantId: TENANT, modul: "fleet", destinationId: "opgave-demo-1",
    }).nettoOere, 125_000);
    const gammelKontrolIgen = anvendFakturafordelingV1(nyKontrol.historik, fordelinginput({
      status: FORDELING_STATUS.kontrolleret, tidspunktMs: NU + 5,
      idempotensnoegle: "idem-gammel-igen", korrelationsId: "req-gammel-igen",
    }), kontekst(destination));
    assert.equal(gammelKontrolIgen.fejl, KONTRAKT_FEJLKODE.tilstandsovergangUgyldig);
  });

  test("afviser tilbageførsel uden kontrol og kontrol efter tilbageførsel", () => {
    const destination = bygReferencedestinationV1(destinationsinput()).destination;
    const direkte = anvendFakturafordelingV1([], fordelinginput({
      status: FORDELING_STATUS.tilbagefoert,
      revisionsaarsagskode: "FAKTURA_GENÅBNET", revisionsaarsag: "Syntetisk rettelse",
    }), kontekst(destination));
    assert.equal(direkte.fejl, KONTRAKT_FEJLKODE.tilstandsovergangUgyldig);
  });

  test("idempotent replay sker før kontrol af et senere lukket fakturavindue", () => {
    const åben = bygReferencedestinationV1(destinationsinput()).destination;
    const kladde = anvendFakturafordelingV1([], fordelinginput({ status: FORDELING_STATUS.kladde }),
      kontekst(åben));
    const lukket = bygReferencedestinationV1(destinationsinput({
      fakturastatus: FAKTURAVINDUE.lukket,
    })).destination;
    const replay = anvendFakturafordelingV1(kladde.historik,
      fordelinginput({ status: FORDELING_STATUS.kladde }), kontekst(lukket));
    assert.equal(replay.ok, true);
    assert.equal(replay.genbrugt, true);
    assert.equal(replay.historik.length, 1);
  });

  test("idempotensscopet indeholder tenant og operationstype", () => {
    assert.equal(kontrakt.idempotensIdentitetV1({ tenantId: TENANT,
      operationstype: "fordeling-oprettet", idempotensnoegle: "idem-1" }),
    JSON.stringify([TENANT, "fordeling-oprettet", "idem-1"]));
    assert.notEqual(kontrakt.idempotensIdentitetV1({ tenantId: "tenant",
      operationstype: "fordeling-oprettet", idempotensnoegle: "fordeling-oprettet:idem" }),
    kontrakt.idempotensIdentitetV1({ tenantId: "tenant:fordeling-oprettet",
      operationstype: "fordeling-oprettet", idempotensnoegle: "idem" }));
    assert.throws(() => kontrakt.idempotensIdentitetV1({ tenantId: TENANT,
      operationstype: "ukendt", idempotensnoegle: "idem-1" }),
    (fejl) => fejl.code === KONTRAKT_FEJLKODE.idempotensscopeUgyldigt);
  });

  test("semantisk ens payload er uafhængig af objektnøglerækkefølge", () => {
    const destination = bygReferencedestinationV1(destinationsinput()).destination;
    const input = fordelinginput({ status: FORDELING_STATUS.kladde });
    const omvendt = Object.fromEntries(Object.entries(input).reverse());
    const første = anvendFakturafordelingV1([], input, kontekst(destination));
    const replay = anvendFakturafordelingV1(første.historik, omvendt, kontekst(destination));
    assert.equal(replay.ok, true);
    assert.equal(replay.genbrugt, true);
  });

  test("idempotenskonflikt dækker aktør, destination, dokumenttype og beløb", () => {
    const destination = bygReferencedestinationV1(destinationsinput()).destination;
    const grund = fordelinginput({ status: FORDELING_STATUS.kladde });
    const første = anvendFakturafordelingV1([], grund, kontekst(destination));
    for (const ændring of [
      { aktoerId: "bruger-demo-2" },
      { destinationId: "opgave-demo-2" },
      { dokumenttype: FAKTURAART.kreditnota, nettoOere: -125_000 },
      { nettoOere: 124_999 },
    ]) {
      const input = { ...grund, ...ændring };
      const ctx = kontekst(destination, { aktoerId: input.aktoerId });
      assert.equal(anvendFakturafordelingV1(første.historik, input, ctx).fejl,
        KONTRAKT_FEJLKODE.idempotensKonflikt);
    }
  });

  test("ændret tenant eller operationstype afvises stabilt ved retry", () => {
    const destination = bygReferencedestinationV1(destinationsinput()).destination;
    const grund = fordelinginput({ status: FORDELING_STATUS.kladde });
    const første = anvendFakturafordelingV1([], grund, kontekst(destination));
    assert.equal(anvendFakturafordelingV1(første.historik, {
      ...grund, status: FORDELING_STATUS.kontrolleret, operationstype: "fordeling-kontrolleret",
    }, kontekst(destination)).fejl, KONTRAKT_FEJLKODE.idempotensscopeUgyldigt);
    assert.equal(anvendFakturafordelingV1(første.historik, {
      ...grund, tenantId: "tenant-syntetisk-b",
    }, kontekst(destination)).fejl, KONTRAKT_FEJLKODE.crossTenant);
  });

  test("revisionsårsag kræver kode, længde og fravær af kontroltegn", () => {
    const fælles = { status: FORDELING_STATUS.tilbagefoert,
      revisionsaarsagskode: "FAKTURA_GENÅBNET" };
    assert.equal(bygFakturafordelingV1(fordelinginput({ ...fælles,
      revisionsaarsag: "x".repeat(501),
    })).fejl, KONTRAKT_FEJLKODE.vaerdiForLang);
    assert.equal(bygFakturafordelingV1(fordelinginput({ ...fælles,
      revisionsaarsag: "Ugyldig\u0000tekst",
    })).fejl, KONTRAKT_FEJLKODE.revisionsaarsagUgyldig);
    assert.equal(bygFakturafordelingV1(fordelinginput({
      status: FORDELING_STATUS.tilbagefoert, revisionsaarsag: "Syntetisk rettelse",
    })).fejl, KONTRAKT_FEJLKODE.revisionsaarsagUgyldig);
    assert.equal(bygFakturafordelingV1(fordelinginput({
      status: FORDELING_STATUS.tilbagefoert, revisionsaarsagskode: "UKENDT_KODE",
      revisionsaarsag: "Syntetisk rettelse",
    })).fejl, KONTRAKT_FEJLKODE.revisionsaarsagUgyldig);
  });

  test("den eksplicitte emissionsgrænse konverterer kun intern prototypefordeling til V1", () => {
    const resultat = kontrakt.emitFakturafordelingV1({
      fordelingId: "intern-fordeling-1", modul: "FLEET",
      destinationId: "opgave-demo-1", nettoOere: 125_000,
    }, {
      aktuelTenantId: TENANT, tenantId: TENANT, fakturaId: "faktura-demo-1",
      dokumenttype: FAKTURAART.faktura, status: FORDELING_STATUS.kladde,
      idempotensnoegle: "idem-emission", tidspunktMs: NU,
      aktoerId: "bruger-demo-1", korrelationsId: "req-emission",
    });
    assert.equal(resultat.ok, true);
    assert.equal(resultat.fordeling.modul, "fleet");
    assert.equal(resultat.fordeling.fordelingId, "intern-fordeling-1");
    assert.equal(kontrakt.emitFakturafordelingV1({
      fordelingId: "intern-fordeling-2", modul: "fleet",
      destinationId: "opgave-demo-1", nettoOere: 1,
    }, {
      aktuelTenantId: TENANT, tenantId: TENANT, fakturaId: "faktura-demo-1",
      dokumenttype: FAKTURAART.faktura, status: FORDELING_STATUS.kladde,
      idempotensnoegle: "idem-emission-2", tidspunktMs: NU,
      aktoerId: "bruger-demo-1", korrelationsId: "req-emission-2",
    }).fejl, KONTRAKT_FEJLKODE.modulUgyldigt);
  });

  test("resultatwrappers og alle nested snapshots er deep-frozen", () => {
    const destinationResultat = bygReferencedestinationV1(destinationsinput());
    assert.ok(Object.isFrozen(destinationResultat));
    assert.ok(Object.isFrozen(destinationResultat.destination));
    assert.ok(Object.isFrozen(destinationResultat.destination.leverandoer));
    assert.ok(Object.isFrozen(destinationResultat.destination.leverandoer.navnevarianter));
    assert.ok(Object.isFrozen(destinationResultat.destination.enhedsreferencer));
    assert.ok(Object.isFrozen(destinationResultat.destination.enhedsreferencer.kundereferencer));
    const fordelingResultat = bygFakturafordelingV1(fordelinginput({ status: FORDELING_STATUS.kladde }));
    assert.ok(Object.isFrozen(fordelingResultat));
    const anvendt = anvendFakturafordelingV1([], fordelingResultat.fordeling,
      kontekst(destinationResultat.destination));
    assert.ok(Object.isFrozen(anvendt));
    assert.ok(Object.isFrozen(anvendt.historik));
    assert.ok(Object.isFrozen(validérFakturafordelingssætV1({
      aktuelTenantId: TENANT, forventetFakturaId: "faktura-demo-1",
      fakturaNettoOere: 125_000, dokumenttype: FAKTURAART.faktura,
      fordelinger: [fordelinginput({ status: FORDELING_STATUS.kladde })],
    })));
    assert.ok(Object.isFrozen(beregnFaktiskOmkostningV1(anvendt.historik, {
      aktuelTenantId: TENANT, modul: "fleet", destinationId: "opgave-demo-1",
    })));
  });

  test("alle adaptere er felt-for-felt symmetriske og markerer provenance", () => {
    const kilde = {
      tenantId: TENANT, id: "destination-demo-1", veyroReference: "VEY-2026-0001",
      oprettetMs: NU - 1, aendretMs: NU, navn: "Syntetisk destination",
      operationelStatus: "afsluttet", fakturastatus: FAKTURAVINDUE.aaben,
      leverandoer: { id: "leverandoer-demo-1", cvr: null, navn: "Syntetisk leverandør" },
      referencer: ["EKSTRA-1"], enhed: { id: "enhed-demo-1", kundereferencer: [] },
      aktiv: { id: "enhed-demo-1", kundereferencer: [] }, lokation: "Syntetisk lokation",
      koststeder: ["KST-DEMO"], estimatNettoOere: 100, ordreNettoOere: 100,
    };
    const [fleet, facility, procure] = [referencedestinationerFraFleetV1,
      referencedestinationerFraFacilityV1, referencedestinationerFraProcureV1]
      .map((adapter) => adapter([structuredClone(kilde)])[0]);
    const sammenlignelig = (d) => ({ ...d, modul: null, destinationstype: null });
    assert.deepEqual(sammenlignelig(fleet), sammenlignelig(facility));
    assert.deepEqual(sammenlignelig(fleet), sammenlignelig(procure));
    assert.equal(fleet.proveniens, kontrakt.REFERENCE_PROVENIENS.autoritative);
  });

  test("alle autoritative og demo-adapterkollektioner er immutable", () => {
    const autoritativKilde = {
      tenantId: TENANT, id: "destination-frossen-1", veyroReference: "VEY-2026-FROSSEN",
      oprettetMs: NU - 1, aendretMs: NU, navn: "Syntetisk destination",
      operationelStatus: "afsluttet", fakturastatus: FAKTURAVINDUE.aaben,
      leverandoer: { id: "leverandoer-frossen-1", cvr: null, navn: "Syntetisk leverandør" },
      referencer: ["EKSTRA-FROSSEN"], enhed: { id: "enhed-frossen-1", kundereferencer: [] },
      aktiv: { id: "enhed-frossen-1", kundereferencer: [] }, lokation: "Syntetisk lokation",
      koststeder: ["KST-FROSSEN"], estimatNettoOere: 100, ordreNettoOere: 100,
    };
    const legacyKilde = {
      tenantId: TENANT, id: "legacy-frossen-1", navn: "Syntetisk legacy",
      operationelStatus: "afsluttet", fakturastatus: FAKTURAVINDUE.aaben,
      datoMs: NU, leverandoer: { id: "leverandoer-frossen-1", navn: "Syntetisk" },
      referencer: ["LEGACY-FROSSEN"], enhed: null, aktiv: null, koststeder: [],
    };
    const adaptere = [
      [referencedestinationerFraFleetV1, autoritativKilde],
      [referencedestinationerFraFacilityV1, autoritativKilde],
      [referencedestinationerFraProcureV1, autoritativKilde],
      [fleetAdapter.destinationerFraFleetDemoLegacy, legacyKilde],
      [facilityAdapter.destinationerFraFacilityDemoLegacy, legacyKilde],
      [procureAdapter.destinationerFraProcureDemoLegacy, legacyKilde],
    ];

    for (const [adapter, kilde] of adaptere) {
      const andenKilde = structuredClone(kilde);
      andenKilde.id = `${andenKilde.id}-2`;
      if (andenKilde.veyroReference) andenKilde.veyroReference = `${andenKilde.veyroReference}-2`;
      if (andenKilde.referencer?.length) andenKilde.referencer = [`${andenKilde.referencer[0]}-2`];
      const input = [structuredClone(kilde), andenKilde];
      const før = structuredClone(input);
      const resultat = adapter(input);
      assert.equal(Object.isFrozen(resultat), true);
      assert.equal(Object.isFrozen(resultat[0]), true);
      assert.equal(Object.isFrozen(resultat[0].leverandoer), true);
      assert.throws(() => resultat.push(resultat[0]), TypeError);
      assert.throws(() => resultat.pop(), TypeError);
      assert.throws(() => resultat.splice(0, 1), TypeError);
      assert.throws(() => resultat.sort((a, b) =>
        b.destinationId.localeCompare(a.destinationId)), TypeError);
      assert.throws(() => { resultat[0] = null; }, TypeError);
      assert.deepEqual(input, før);
    }
  });

  test("produktionsadaptere afviser skjult fallback, demo-adaptere markerer den", () => {
    const legacy = {
      tenantId: TENANT, id: "legacy-demo-1", navn: "Syntetisk legacy",
      operationelStatus: "afsluttet", fakturastatus: FAKTURAVINDUE.aaben,
      datoMs: NU, leverandoer: { id: "leverandoer-demo-1", navn: "Syntetisk" },
      referencer: ["LEGACY-REF-1"], enhed: null, aktiv: null, koststeder: [],
    };
    for (const adapter of [referencedestinationerFraFleetV1,
      referencedestinationerFraFacilityV1, referencedestinationerFraProcureV1]) {
      assert.throws(() => adapter([legacy]), (fejl) =>
        fejl.code === KONTRAKT_FEJLKODE.proveniensUgyldig
        || fejl.code === KONTRAKT_FEJLKODE.veyroReferenceUgyldig);
    }
    for (const [adapter, source] of [
      [fleetAdapter.destinationerFraFleetDemoLegacy, legacy],
      [facilityAdapter.destinationerFraFacilityDemoLegacy, legacy],
      [procureAdapter.destinationerFraProcureDemoLegacy, legacy],
    ]) {
      assert.equal(adapter([source])[0].proveniens, kontrakt.REFERENCE_PROVENIENS.demoLegacy);
    }
  });

  test("reduceren afviser adversarial og modstridende historik", () => {
    const destination = bygReferencedestinationV1(destinationsinput()).destination;
    const kladde = anvendFakturafordelingV1([], fordelinginput({ status: FORDELING_STATUS.kladde }),
      kontekst(destination));
    const kontrol = anvendFakturafordelingV1(kladde.historik, fordelinginput({
      status: FORDELING_STATUS.kontrolleret, tidspunktMs: NU + 1,
      idempotensnoegle: "idem-kontrol", korrelationsId: "req-kontrol",
    }), kontekst(destination));
    const kopi = structuredClone(kontrol.historik);
    kopi.push({ ...kopi[1], sekvens: 3 });
    const reduceret = beregnFaktiskOmkostningV1(kopi, {
      aktuelTenantId: TENANT, modul: "fleet", destinationId: "opgave-demo-1",
    });
    assert.equal(reduceret.ok, false);
  });

  test("reduceren stopper ved overflow i stedet for at returnere forkert beløb", () => {
    const destination = bygReferencedestinationV1(destinationsinput()).destination;
    const tilføjKontrolleret = (historik, overrides) => {
      const kladdeInput = fordelinginput({ status: FORDELING_STATUS.kladde, ...overrides });
      const kladde = anvendFakturafordelingV1(historik, kladdeInput, kontekst(destination));
      return anvendFakturafordelingV1(kladde.historik, {
        ...kladdeInput,
        status: FORDELING_STATUS.kontrolleret,
        operationstype: "fordeling-kontrolleret",
        idempotensnoegle: `${kladdeInput.idempotensnoegle}-kontrol`,
        korrelationsId: `${kladdeInput.korrelationsId}-kontrol`,
        tidspunktMs: kladdeInput.tidspunktMs + 1,
      }, kontekst(destination));
    };
    const maks = tilføjKontrolleret([], {
      fordelingId: "fordeling-maks", fakturaId: "faktura-maks",
      nettoOere: Number.MAX_SAFE_INTEGER, idempotensnoegle: "idem-maks",
      korrelationsId: "req-maks", tidspunktMs: NU,
    });
    const plusEn = tilføjKontrolleret(maks.historik, {
      fordelingId: "fordeling-plus-en", fakturaId: "faktura-plus-en",
      nettoOere: 1, idempotensnoegle: "idem-plus-en",
      korrelationsId: "req-plus-en", tidspunktMs: NU + 2,
    });
    assert.equal(beregnFaktiskOmkostningV1(plusEn.historik, {
      aktuelTenantId: TENANT, modul: "fleet", destinationId: "opgave-demo-1",
    }).fejl, KONTRAKT_FEJLKODE.omkostningOverflow);
  });
});

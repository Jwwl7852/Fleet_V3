import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import * as intakeDomæne from "../src/fleet/fakturacenter-intake.js";

import {
  accepterForretningsadvarsler,
  AFLAESNING_STATUS,
  beskrivMasseResultat,
  bygAflæsning,
  bygIntake,
  bygMailboxKontrakt,
  bygOpbevaringsKontrakt,
  bygVeyroMailKontrakt,
  DOKUMENTTYPE,
  dokumenttypeFraFilnavn,
  DUBLET_STATUS,
  effektivAflæsning,
  erAabenForFaktura,
  FAKTURACENTER_SEKTIONER,
  FAKTURAART,
  FAKTURAVINDUE,
  findDubletter,
  foreslåKreditnotaKobling,
  genåbnFaktura,
  INTAKE_KILDE,
  INTAKE_STATUS,
  klassificérMailMedFlereFiler,
  KONTROL_STATUS,
  kontrolleretOmkostning,
  markérKontrolleret,
  masseKontrollér,
  MATCHNIVEAU,
  matchFaktura,
  MODUL,
  normaliserEnhedsnummer,
  normaliserKundereference,
  normaliserNavn,
  normaliserReference,
  normaliserRegistreringsnummer,
  normaliserStelSerie,
  referenceTokens,
  retAflæsning,
  skiftFakturavindue,
  TEKNISK_FEJLKODE,
  validérFordeling,
  validérKontrolregler,
  vurderVeyroAfsender,
} from "../src/fleet/fakturacenter-intake.js";
import { destinationerFraFleet } from "../src/fleet/fakturacenter-adapters/fleet.js";
import { destinationerFraFacility } from "../src/fleet/fakturacenter-adapters/facility.js";
import { destinationerFraProcure } from "../src/fleet/fakturacenter-adapters/procure.js";
import {
  DEMO_DESTINATIONER,
  DEMO_FACILITY_KILDE,
  DEMO_FAKTURACENTER_SCENARIER,
  DEMO_FLEET_KILDE,
  DEMO_KONTROLREGLER,
  DEMO_MAILBOX,
  DEMO_OPBEVARING,
  DEMO_PROCURE_KILDE,
  DEMO_TENANT_ID,
  DEMO_VEYRO_MAIL,
} from "../src/fleet/demo-fakturacenter-intake.js";

const SHA = "a".repeat(64);
const NU = Date.UTC(2026, 8, 5, 12, 0, 0);
const scenarie = (nr) => DEMO_FAKTURACENTER_SCENARIER.find((s) => s.nummer === nr);
const handlingskontekst = (overrides = {}) => ({
  aktuelTenantId: DEMO_TENANT_ID,
  brugerId: "demo-bruger",
  tidspunktMs: NU,
  harAdgang: true,
  harModulSkriveadgang: true,
  destinationer: DEMO_DESTINATIONER,
  ...overrides,
});

describe("negative regressionsprober fra kvalitetsreviewet", () => {
  test("ukendte eksplicitte sikkerhedsniveauer fejler lukket", () => {
    for (const sikkerhedsniveau of ["", "balancerett", "FLEKSIBEL", null, 2, {}, []]) {
      const resultat = matchFaktura({
        tenantId: DEMO_TENANT_ID,
        aflæsning: scenarie(3).aflæsning,
        destinationer: DEMO_DESTINATIONER,
        sikkerhedsniveau,
      });
      assert.equal(resultat.ok, false);
      assert.equal(resultat.fejl, "MATCH_LEVEL_INVALID");
      assert.equal(resultat.placering, null);
    }
  });

  test("danske bogstaver skaber ikke falske referencekollisioner", () => {
    for (const dansk of ["Ø-123", "Å-123", "Æ-123"]) {
      assert.notEqual(normaliserReference(dansk), normaliserReference("123"));
    }
    assert.equal(normaliserReference("ø-123"), normaliserReference("Ø-123"));
    assert.notEqual(normaliserReference("Ø-123"), normaliserReference("OE-123"));
    assert.notEqual(normaliserReference("000123"), normaliserReference("123"));
    assert.equal(normaliserReference("REF - 123"), normaliserReference("ref-123"));
    assert.notEqual(normaliserReference("1234"), normaliserReference("912345"));
  });

  test("estimatforskel er neutral og blokerer ikke et eksakt match", () => {
    const match = scenarie(10).match;
    assert.equal(match.placering?.destinationId, "procure-ordre-4001");
    assert.ok(!match.advarsler.includes("beloeb-afviger-statistisk"));
  });

  test("lukket destination kan ikke vælges manuelt eller kontrolleres", () => {
    assert.equal(typeof intakeDomæne.vælgManuelDestination, "function");
    const lukket = DEMO_DESTINATIONER.find((d) => d.fakturastatus === FAKTURAVINDUE.lukket);
    const valg = intakeDomæne.vælgManuelDestination(scenarie(13).faktura, lukket,
      handlingskontekst({ destinationer: [lukket] }));
    assert.equal(valg.ok, false);
    assert.equal(valg.fejl, "DESTINATION_CLOSED");

    const medLukketFordeling = {
      ...scenarie(11).faktura,
      fordelinger: [{
        fordelingId: "lukket-fordeling", destinationId: lukket.destinationId,
        modul: lukket.modul, nettoOere: scenarie(11).faktura.nettoOere,
      }],
      uløsteAdvarsler: [],
    };
    const kontrol = markérKontrolleret(medLukketFordeling,
      handlingskontekst({ destinationer: [lukket] }));
    assert.equal(kontrol.ok, false);
    assert.ok(kontrol.blokeringer.includes("DESTINATION_CLOSED"));
  });

  test("genåbning af destination kræver komplet betroet kontekst", () => {
    const lukket = DEMO_DESTINATIONER.find((d) => d.fakturastatus === FAKTURAVINDUE.lukket);
    for (const mangler of ["aktuelTenantId", "brugerId", "tidspunktMs", "harModulSkriveadgang"]) {
      const kontekst = handlingskontekst({ begrundelse: "Syntetisk sen faktura" });
      delete kontekst[mangler];
      const resultat = skiftFakturavindue(lukket, FAKTURAVINDUE.aaben, kontekst);
      assert.equal(resultat.ok, false, mangler);
    }
    assert.equal(skiftFakturavindue(lukket, FAKTURAVINDUE.aaben,
      handlingskontekst({ aktuelTenantId: "tenant-demo-anden", begrundelse: "Syntetisk" })).fejl,
    TEKNISK_FEJLKODE.crossTenant);
    const genåbnet = skiftFakturavindue(lukket, FAKTURAVINDUE.aaben,
      handlingskontekst({ begrundelse: "Syntetisk sen faktura" }));
    assert.equal(genåbnet.ok, true);
    assert.equal(genåbnet.destination.fakturastatus, FAKTURAVINDUE.aaben);
    assert.equal(genåbnet.destination.fakturahistorik.at(-1).brugerId, "demo-bruger");
  });

  test("kontrol er tenantafgrænset og kan ikke gentages", () => {
    const klar = { ...scenarie(11).faktura, uløsteAdvarsler: [] };
    for (const mangler of ["aktuelTenantId", "brugerId", "tidspunktMs", "harAdgang"]) {
      const kontekst = handlingskontekst();
      delete kontekst[mangler];
      assert.equal(markérKontrolleret(klar, kontekst).ok, false, mangler);
    }
    const crossTenant = markérKontrolleret(klar,
      handlingskontekst({ aktuelTenantId: "tenant-demo-anden" }));
    assert.equal(crossTenant.ok, false);
    assert.ok(crossTenant.blokeringer.includes(TEKNISK_FEJLKODE.crossTenant));
    const første = markérKontrolleret(klar, handlingskontekst());
    assert.equal(første.ok, true);
    const anden = markérKontrolleret(første.faktura, handlingskontekst({ tidspunktMs: NU + 1 }));
    assert.equal(anden.ok, false);
    assert.ok(anden.blokeringer.includes("INVOICE_ALREADY_CONTROLLED"));
    assert.equal(anden.faktura.historik.length, første.faktura.historik.length);
  });

  test("fordeling bruger sikre øreheltal, unikke id'er og eksplicit kreditfortegn", () => {
    assert.equal(validérFordeling(0, [{
      fordelingId: "nul", destinationId: "d", modul: MODUL.fleet, nettoOere: 0,
    }], FAKTURAART.faktura).ok, true);
    assert.equal(validérFordeling(1, [{
      fordelingId: "en", destinationId: "d", modul: MODUL.fleet, nettoOere: 1,
    }], FAKTURAART.faktura).ok, true);
    assert.equal(validérFordeling(Number.MAX_SAFE_INTEGER, [{
      fordelingId: "maks", destinationId: "d", modul: MODUL.fleet,
      nettoOere: Number.MAX_SAFE_INTEGER,
    }], FAKTURAART.faktura).ok, true);
    for (const ugyldig of [NaN, Infinity, 1.2, "1", Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(validérFordeling(ugyldig, [], FAKTURAART.faktura).ok, false);
    }
    assert.equal(validérFordeling(2, [
      { fordelingId: "samme", destinationId: "d1", modul: MODUL.fleet, nettoOere: 1 },
      { fordelingId: "samme", destinationId: "d2", modul: MODUL.procure, nettoOere: 1 },
    ], FAKTURAART.faktura).fejl, "ALLOCATION_ID_DUPLICATE");
    assert.equal(validérFordeling(100, [{
      fordelingId: "negativ", destinationId: "d", modul: MODUL.fleet, nettoOere: -100,
    }], FAKTURAART.faktura).ok, false);
    assert.equal(validérFordeling(-100, [{
      fordelingId: "kredit", destinationId: "d", modul: MODUL.fleet, nettoOere: -100,
    }], FAKTURAART.kreditnota).ok, true);
    assert.equal(validérFordeling(-100, [{
      fordelingId: "forkert", destinationId: "d", modul: MODUL.fleet, nettoOere: 100,
    }], FAKTURAART.kreditnota).ok, false);
    assert.equal(validérFordeling(100, [{
      fordelingId: "for-meget", destinationId: "d", modul: MODUL.fleet, nettoOere: 101,
    }], FAKTURAART.faktura).fejl, "ALLOCATION_EXCEEDS_NET_AMOUNT");
  });

  test("brugerrettelser valideres pr. felttype", () => {
    const læst = bygAflæsning({ fakturanummer: "DEMO-1", nettoOere: 100, valuta: "DKK" },
      { tenantId: DEMO_TENANT_ID });
    for (const ændringer of [
      { nettoOere: 1.5 }, { nettoOere: Number.MAX_SAFE_INTEGER + 1 },
      { fakturanummer: {} }, { fakturadato: "2026-99-99" },
      { valuta: "EUR" }, { ordreOpgaveNumre: ["DEMO", 2] }, { ukendtFelt: "x" },
    ]) {
      const resultat = retAflæsning(læst, ændringer, handlingskontekst());
      assert.equal(resultat.ok, false, JSON.stringify(ændringer));
    }
    assert.equal(læst.original.nettoOere, 100);
    assert.equal(retAflæsning(læst, { nettoOere: 200 },
      handlingskontekst({ aktuelTenantId: "tenant-demo-anden" })).fejl,
    TEKNISK_FEJLKODE.crossTenant);
  });

  test("lokal filvalidering afviser tomme, store, ukendte og MIME-konflikter", async () => {
    assert.equal(typeof intakeDomæne.behandlLokalePrototypeFiler, "function");
    const fil = (name, type, bytes, size = bytes.length) => ({
      name, type, size, arrayBuffer: async () => Uint8Array.from(bytes).buffer,
    });
    const [tom, stor, ukendt, konflikt] = await intakeDomæne.behandlLokalePrototypeFiler([
      fil("tom.pdf", "application/pdf", [], 0),
      fil("stor.pdf", "application/pdf", [1], 25 * 1024 * 1024 + 1),
      fil("ukendt.exe", "application/octet-stream", [1]),
      fil("forkert.pdf", "image/png", [1]),
    ]);
    assert.deepEqual([tom.status, stor.status, ukendt.status, konflikt.status],
      ["afvist", "afvist", "afvist", "afvist"]);
  });

  test("lokal SHA-256 er stabil og dublet sættes på hold", async () => {
    const fil = (name) => ({
      name, type: "application/pdf", size: 3,
      arrayBuffer: async () => new TextEncoder().encode("abc").buffer,
    });
    const resultater = await intakeDomæne.behandlLokalePrototypeFiler([
      fil("første-æøå.pdf"), fil("anden.pdf"),
    ]);
    assert.equal(resultater[0].sha256,
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    assert.equal(resultater[0].status, "klar-lokal-prototype");
    assert.equal(resultater[1].status, "mulig-dublet");
    assert.equal(resultater[1].fejl, "LOCAL_FILE_DUPLICATE_HASH");
  });

  test("mailkontrakter er validerede og fail-closed", () => {
    const ugyldige = [
      bygVeyroMailKontrakt({ tenantId: "", routeId: "r", kanaltype: "veyro-mail" }),
      bygVeyroMailKontrakt({ tenantId: DEMO_TENANT_ID, routeId: "", kanaltype: "veyro-mail" }),
      bygVeyroMailKontrakt({ tenantId: DEMO_TENANT_ID, routeId: "r", kanaltype: "imap" }),
      bygVeyroMailKontrakt({ tenantId: DEMO_TENANT_ID, routeId: "r", kanaltype: "veyro-mail", aktiveretMs: NU }),
      bygVeyroMailKontrakt({ tenantId: DEMO_TENANT_ID, routeId: "r", kanaltype: "veyro-mail", ukendtAfsender: "gæt" }),
      bygMailboxKontrakt({ tenantId: DEMO_TENANT_ID, kanaltype: "mailbox-forbindelse", aktiveretMs: NU, mapper: [] }),
      bygMailboxKontrakt({ tenantId: DEMO_TENANT_ID, kanaltype: "imap", aktiveretMs: NU, mapper: ["Demo"] }),
    ];
    assert.ok(ugyldige.every((r) => r.ok === false));
    const god = bygVeyroMailKontrakt({
      tenantId: DEMO_TENANT_ID, routeId: "demo-route", kanaltype: "veyro-mail",
      aktiveretMs: NU,
      registreredeAfsendere: [" Demo@Syntetisk.Invalid "], ukendtAfsender: "afvis",
      maksAntalVedhaeftninger: 10, maksBytesPrFil: 25 * 1024 * 1024,
    });
    assert.equal(god.ok, true);
    assert.equal(vurderVeyroAfsender(god.kontrakt, "demo@syntetisk.invalid").handling, "accepter");
  });

  test("multi-mail kan klassificeres og opdeles med bevaret bundle-reference", () => {
    assert.equal(typeof intakeDomæne.klassificérMailbundleFil, "function");
    assert.equal(typeof intakeDomæne.opdelMailbundleTilKladder, "function");
    let bundle = scenarie(17).mailbundle;
    bundle = intakeDomæne.klassificérMailbundleFil(bundle, bundle.filer[0].filId, "faktura",
      handlingskontekst()).bundle;
    bundle = intakeDomæne.klassificérMailbundleFil(bundle, bundle.filer[1].filId, "bilag",
      handlingskontekst()).bundle;
    bundle = intakeDomæne.klassificérMailbundleFil(bundle, bundle.filer[2].filId, "ignoreret",
      handlingskontekst()).bundle;
    const kladder = intakeDomæne.opdelMailbundleTilKladder(bundle, handlingskontekst());
    assert.equal(kladder.ok, true);
    assert.equal(kladder.kladder.length, 1);
    assert.equal(kladder.kladder[0].oprindeligMailbundleId, bundle.mailbundleId);
    assert.deepEqual(kladder.kladder[0].bilagFilIder, [bundle.filer[1].filId]);
  });
});

describe("handlingskontekst, idempotens og synligt masseudvalg", () => {
  test("genåbning af faktura og accept af advarsel afviser manglende auditkontekst", () => {
    for (const mangler of ["aktuelTenantId", "brugerId", "tidspunktMs", "harAdgang"]) {
      const kontekst = handlingskontekst({ begrundelse: "Syntetisk begrundelse" });
      delete kontekst[mangler];
      assert.equal(genåbnFaktura(scenarie(18).faktura, kontekst).ok, false, `genåbn:${mangler}`);
      assert.equal(accepterForretningsadvarsler(scenarie(10).faktura, kontekst).ok,
        false, `accept:${mangler}`);
    }
  });

  test("gentagen advarselsaccept er sikkert afvist uden ekstra historik", () => {
    const første = accepterForretningsadvarsler(scenarie(10).faktura,
      handlingskontekst({ begrundelse: "Syntetisk kontrolleret leverandørkonflikt" }));
    assert.equal(første.ok, true);
    const anden = accepterForretningsadvarsler(første.faktura,
      handlingskontekst({ tidspunktMs: NU + 1, begrundelse: "Gentaget" }));
    assert.equal(anden.ok, false);
    assert.equal(anden.fejl, "NO_WARNINGS");
    assert.equal(anden.faktura.historik.length, første.faktura.historik.length);
  });

  test("skjulte markeringer behandles ikke og rapporteres pr. faktura", () => {
    const synlig = { ...scenarie(11).faktura, uløsteAdvarsler: [] };
    const skjult = { ...scenarie(20).faktura, uløsteAdvarsler: [] };
    const resultat = masseKontrollér([synlig, skjult],
      [synlig.fakturaId, skjult.fakturaId], () => handlingskontekst(), {
        synligeIder: [synlig.fakturaId],
      });
    assert.equal(resultat.resultater.find((r) => r.fakturaId === synlig.fakturaId).status,
      "lykkedes");
    const afvist = resultat.resultater.find((r) => r.fakturaId === skjult.fakturaId);
    assert.equal(afvist.status, "afvist");
    assert.equal(afvist.fakturanummer, skjult.fakturanummer);
    assert.deepEqual(afvist.blokeringer, ["SELECTION_NOT_VISIBLE"]);
    assert.equal(resultat.fakturaer.find((f) => f.fakturaId === skjult.fakturaId), skjult);
  });

  test("manuelt match kræver tenant, adgang og åben destination og registrerer oprindelse", () => {
    const kandidat = scenarie(6).match.kandidater[0];
    assert.equal(intakeDomæne.vælgManuelDestination(scenarie(6).faktura, kandidat, {
      ...handlingskontekst(), aktuelTenantId: "tenant-demo-anden",
    }).fejl, TEKNISK_FEJLKODE.crossTenant);
    const valgt = intakeDomæne.vælgManuelDestination(scenarie(6).faktura, kandidat,
      handlingskontekst());
    assert.equal(valgt.ok, true);
    assert.equal(valgt.faktura.matchOprindelse, intakeDomæne.MATCH_OPRINDELSE.manuel);
    assert.equal(valgt.faktura.historik.at(-1).handling, "destination-manuelt-valgt");
  });
});

describe("lokal filprototype", () => {
  const fil = (name, type, tekstindhold) => {
    const bytes = new TextEncoder().encode(tekstindhold);
    return { name, type, size: bytes.length, arrayBuffer: async () => bytes.buffer };
  };

  test("alle tilladte filfamilier og flere filer behandles deterministisk", async () => {
    const filer = [
      fil("faktura-æøå.pdf", "application/pdf", "pdf"),
      fil("foto.jpg", "image/jpeg", "jpg"),
      fil("foto.jpeg", "image/jpeg", "jpeg"),
      fil("foto.png", "image/png", "png"),
      fil("faktura.xml", "application/xml", "xml"),
      fil("faktura.oioubl.xml", "application/oioubl+xml", "oioubl"),
    ];
    const resultater = await intakeDomæne.behandlLokalePrototypeFiler(filer);
    assert.equal(resultater.length, 6);
    assert.ok(resultater.every((resultat) => resultat.status === "klar-lokal-prototype"));
    assert.equal(resultater[0].filnavn, "faktura-æøå.pdf");
    assert.equal(new Set(resultater.map((resultat) => resultat.sha256)).size, 6);
  });

  test("eksisterende sessionshash sætter en ny fil på dublethold", async () => {
    const første = await intakeDomæne.behandlLokalePrototypeFiler([
      fil("første.png", "image/png", "samme"),
    ]);
    const anden = await intakeDomæne.behandlLokalePrototypeFiler([
      fil("anden.png", "image/png", "samme"),
    ], [første[0].sha256]);
    assert.equal(anden[0].status, "mulig-dublet");
  });
});

describe("alle 20 syntetiske scenarier har særskilt domæneadfærd", () => {
  test("match-, fordelings- og undtagelsesscenarier matcher deres kontrakt", () => {
    assert.equal(scenarie(1).match.placering.modul, MODUL.procure);
    assert.equal(scenarie(2).match.placering.modul, MODUL.fleet);
    assert.equal(scenarie(3).match.trin, "enhed");
    assert.equal(scenarie(4).match.placering.modul, MODUL.facility);
    assert.equal(scenarie(5).match.årsag, "en-aaben-leverandoeropgave");
    assert.equal(scenarie(6).match.kandidater.length, 3);
    assert.equal(scenarie(7).match.årsag, "flere-enheder-eller-opgaver");
    assert.equal(scenarie(8).match.kandidater[0].fakturastatus, FAKTURAVINDUE.lukket);
    assert.equal(scenarie(9).match.oprindelse, intakeDomæne.MATCH_OPRINDELSE.ikkePlaceret);
    assert.ok(scenarie(10).match.advarsler.includes("leverandoer-afviger"));
    assert.equal(validérFordeling(scenarie(11).faktura.nettoOere,
      scenarie(11).faktura.fordelinger, FAKTURAART.faktura).ok, true);
    assert.equal(validérFordeling(scenarie(12).faktura.nettoOere,
      scenarie(12).faktura.fordelinger, FAKTURAART.faktura).fordeltOere, 619999);
    assert.equal(scenarie(13).match.årsag, "sen-faktura-til-lukket-destination");
    assert.equal(scenarie(14).faktura.dubletstatus, DUBLET_STATUS.mistænkt);
    assert.equal(scenarie(15).faktura.kreditForFakturanummer, scenarie(11).faktura.fakturanummer);
    assert.equal(scenarie(16).faktura.ugyldigtDokument, true);
    assert.equal(scenarie(17).match.kandidater.length, 0);
    assert.equal(scenarie(17).aflæsning.original.leverandoerCvr, null);
    assert.equal(scenarie(17).mailbundle.filer.length, 3);
    assert.equal(scenarie(18).faktura.låst, true);
    assert.equal(scenarie(19).faktura.historik.at(-1).handling, "genaabnet");
    assert.equal(scenarie(20).masseEksempel.length, 2);
  });

  test("blandet massefixture giver én succes og én reel afvisning", () => {
    const fakturaer = scenarie(20).masseEksempel;
    const ider = fakturaer.map((faktura) => faktura.fakturaId);
    const resultat = masseKontrollér(fakturaer, ider, () => handlingskontekst(), {
      synligeIder: ider,
    });
    assert.deepEqual(resultat.resultater.map((r) => r.status).sort(), ["afvist", "lykkedes"]);
    assert.ok(resultat.resultater.find((r) => !r.ok).blokeringer.includes("DUPLICATE_UNRESOLVED"));
  });

  test("matchoprindelse er struktureret for automatisk, forslag og ingen placering", () => {
    assert.equal(scenarie(1).match.oprindelse, intakeDomæne.MATCH_OPRINDELSE.automatisk);
    assert.equal(scenarie(6).match.oprindelse, intakeDomæne.MATCH_OPRINDELSE.foreslaaet);
    assert.equal(scenarie(9).match.oprindelse, intakeDomæne.MATCH_OPRINDELSE.ikkePlaceret);
  });
});

describe("adaptersymmetri", () => {
  test("FLEET, FACILITY og PROCURE leverer samme read-only topniveaukontrakt", () => {
    const destinationer = [
      destinationerFraFleet([DEMO_FLEET_KILDE[0]])[0],
      destinationerFraFacility([DEMO_FACILITY_KILDE[0]])[0],
      destinationerFraProcure([DEMO_PROCURE_KILDE[0]])[0],
    ];
    const nøglesæt = destinationer.map((destination) => Object.keys(destination).sort());
    assert.deepEqual(nøglesæt[1], nøglesæt[0]);
    assert.deepEqual(nøglesæt[2], nøglesæt[0]);
    assert.ok(destinationer.every(Object.isFrozen));
  });
});

describe("intake- og dokumentkontrakten", () => {
  test("alle aftalte dokumenttyper kan klassificeres uden eksterne kald", () => {
    assert.equal(dokumenttypeFraFilnavn("demo.pdf", "application/pdf"), DOKUMENTTYPE.digitalPdf);
    assert.equal(dokumenttypeFraFilnavn("demo-scan.pdf", "application/pdf"), DOKUMENTTYPE.scannetPdf);
    assert.equal(dokumenttypeFraFilnavn("demo.jpg", "image/jpeg"), DOKUMENTTYPE.jpg);
    assert.equal(dokumenttypeFraFilnavn("demo.png", "image/png"), DOKUMENTTYPE.png);
    assert.equal(dokumenttypeFraFilnavn("demo.xml", "application/xml"), DOKUMENTTYPE.xml);
    assert.equal(dokumenttypeFraFilnavn("demo.oioubl.xml", "application/oioubl+xml"), DOKUMENTTYPE.oioubl);
    assert.equal(dokumenttypeFraFilnavn("demo.exe", "application/octet-stream"), null);
  });

  test("intake kræver tenant, SHA-256, tilladt MIME og strukturerede fejlkoder", () => {
    const god = bygIntake({
      intakeId: "demo-intake", tenantId: DEMO_TENANT_ID, kilde: INTAKE_KILDE.dragDrop,
      modtagetMs: NU, dokumenttype: DOKUMENTTYPE.digitalPdf, originaltFilnavn: "demo.pdf",
      mimeType: "application/pdf", stoerrelse: 42, sha256: SHA,
      status: INTAKE_STATUS.modtaget, dubletstatus: DUBLET_STATUS.ikkeKontrolleret,
      aflaesningsstatus: AFLAESNING_STATUS.afventer, fakturaId: null,
      fejlkoder: ["DEMO_STRUCTURED_ERROR"],
    });
    assert.equal(god.ok, true);
    assert.equal(god.intake.original.immutable, true);
    assert.ok(Object.isFrozen(god.intake.original));

    const dårlig = bygIntake({
      intakeId: "demo", tenantId: "", kilde: "ukendt", modtagetMs: 0,
      dokumenttype: "word", originaltFilnavn: "demo.exe", mimeType: "text/html",
      stoerrelse: 0, sha256: "nej", status: "ukendt", dubletstatus: "ukendt",
      aflaesningsstatus: "ukendt", fejlkoder: ["fritekst er ikke kode"],
    });
    assert.equal(dårlig.ok, false);
    assert.ok(dårlig.fejl.includes("tenant-id-mangler"));
    assert.ok(dårlig.fejl.includes("ugyldig-sha256"));
    assert.ok(dårlig.fejl.includes("mime-ikke-tilladt"));
  });

  test("oprindelig aflæsning overskrives aldrig af brugerrettelser", () => {
    const læst = bygAflæsning({
      fakturanummer: "DEMO-1", nettoOere: 10000, valuta: "DKK", land: "DK",
    }, { tenantId: DEMO_TENANT_ID });
    const rettet = retAflæsning(læst, { nettoOere: 12000, fakturanummer: "DEMO-1-R" }, {
      ...handlingskontekst(),
    });
    assert.equal(rettet.ok, true);
    assert.equal(rettet.aflæsning.original.nettoOere, 10000);
    assert.equal(effektivAflæsning(rettet.aflæsning).nettoOere, 12000);
    assert.deepEqual(rettet.aflæsning.rettelseshistorik[0].felter, ["fakturanummer", "nettoOere"]);
  });

  test("ulæseligt dokument bevares som manuel intake uden opdigtede felter", () => {
    const ulæselig = scenarie(16);
    assert.equal(ulæselig.intake.status, INTAKE_STATUS.manuel);
    assert.equal(ulæselig.intake.aflaesningsstatus, AFLAESNING_STATUS.ulæselig);
    assert.equal(ulæselig.intake.fakturaId, null);
    assert.equal(ulæselig.aflæsning.original.fakturanummer, null);
    assert.ok(ulæselig.intake.fejlkoder.includes(TEKNISK_FEJLKODE.ulæselig));
  });
});

describe("mail- og opbevaringskontrakter er neutrale og deaktiverede", () => {
  test("unik adresse er routing, mens afsenderpolitik afgøres særskilt", () => {
    const kontrakt = bygVeyroMailKontrakt({
      tenantId: DEMO_TENANT_ID, routeId: "demo-route",
      kanaltype: INTAKE_KILDE.veyroMail, aktiveretMs: NU,
      registreredeAfsendere: ["registreret@syntetisk.invalid"], ukendtAfsender: "karantaene",
    }).kontrakt;
    assert.equal(kontrakt.routingErIkkeAutentifikation, true);
    assert.equal(kontrakt.kræverProviderSignatur, true);
    assert.equal(kontrakt.implementeret, false);
    assert.equal(vurderVeyroAfsender(kontrakt, "registreret@syntetisk.invalid").handling, "accepter");
    assert.equal(vurderVeyroAfsender(kontrakt, "ukendt@syntetisk.invalid").handling, "karantaene");
  });

  test("mailbox-kontrakten er read-only, fremadrettet og gemmer ikke rå mailtekst", () => {
    const kontrakt = bygMailboxKontrakt({
      tenantId: DEMO_TENANT_ID, routeId: "demo-mailbox", kanaltype: INTAKE_KILDE.mailbox,
      aktiveretMs: NU, mapper: ["Demo/Invoice"],
    }).kontrakt;
    assert.equal(kontrakt.kunNyereEndAktivering, true);
    assert.equal(kontrakt.ændrerMailbox, false);
    assert.equal(kontrakt.gemmerRåMailtekst, false);
    assert.deepEqual(kontrakt.idempotens, ["stabilt-mail-id", "filhash"]);
    assert.equal(kontrakt.implementeret, false);
  });

  test("flere mulige fakturafiler bliver én manuel intake-sag", () => {
    const vurdering = klassificérMailMedFlereFiler([
      { filnavn: "demo-a.pdf" }, { filnavn: "demo-b.xml" }, { filnavn: "laes-mig.txt" },
    ]);
    assert.equal(vurdering.status, INTAKE_STATUS.manuel);
    assert.equal(vurdering.somEnIntakeSag, true);
    assert.equal(vurdering.filer.length, 2);
    assert.equal(vurdering.fejlkode, TEKNISK_FEJLKODE.flereMailfiler);
  });

  test("opbevaring kan udvides pr. land uden automatisk sletning", () => {
    const god = bygOpbevaringsKontrakt({
      land: "DK", dokumenttype: "faktura", minimumTilMs: NU, valgtTilMs: NU + 1000,
    });
    assert.equal(god.ok, true);
    assert.equal(god.kontrakt.automatiskSletningImplementeret, false);
    assert.equal(bygOpbevaringsKontrakt({
      minimumTilMs: NU + 1, valgtTilMs: NU,
    }).ok, false);
    assert.equal(DEMO_OPBEVARING.ok, true);
    assert.equal(DEMO_MAILBOX.implementeret, false);
    assert.equal(DEMO_VEYRO_MAIL.implementeret, false);
  });
});

describe("read-only adapterkontrakter", () => {
  test("FLEET projiceres uden at ændre kilden", () => {
    const før = structuredClone(DEMO_FLEET_KILDE[0]);
    const [destination] = destinationerFraFleet([DEMO_FLEET_KILDE[0]]);
    assert.equal(destination.modul, MODUL.fleet);
    assert.equal(destination.destinationId, DEMO_FLEET_KILDE[0].id);
    assert.ok(Object.isFrozen(destination));
    assert.deepEqual(DEMO_FLEET_KILDE[0], før);
  });

  test("FACILITY projicerer aktiv, lokation og reference", () => {
    const [destination] = destinationerFraFacility([DEMO_FACILITY_KILDE[0]]);
    assert.equal(destination.modul, MODUL.facility);
    assert.equal(destination.enhed.stelSerieNummer, "FAC-SERIE-0088");
    assert.match(destination.lokation, /Demo Lokation/);
  });

  test("PROCURE projicerer bestillingen til samme destinationskontrakt", () => {
    const [destination] = destinationerFraProcure([DEMO_PROCURE_KILDE[0]]);
    assert.equal(destination.modul, MODUL.procure);
    assert.deepEqual(destination.referencer, ["PROCURE-DEMO-4001"]);
    assert.equal(destination.forventetNettoOere, 150000);
  });
});

describe("deterministisk normalisering", () => {
  test("enhedsnummer og registreringsnummer tåler visningsseparatorer", () => {
    assert.equal(normaliserEnhedsnummer(" enh- 042 "), "ENH042");
    assert.equal(normaliserRegistreringsnummer("de mo 042"), "DEMO042");
  });

  test("stel-/serienummer normaliseres uden at ændre originalen", () => {
    const original = "fac-serie 0088";
    assert.equal(normaliserStelSerie(original), "FACSERIE0088");
    assert.equal(original, "fac-serie 0088");
  });

  test("navn og kundereference normaliseres stabilt", () => {
    assert.equal(normaliserNavn("  Démø   Øst! "), "demo ost");
    assert.equal(normaliserKundereference("Hal Demo-A"), "HALDEMOA");
    assert.notEqual(normaliserKundereference("Ø-123"), normaliserKundereference("OE-123"));
  });
});

describe("fælles tenantafgrænset matchkerne", () => {
  test("eksakt reference matcher tokenet, ikke et substring", () => {
    assert.deepEqual(referenceTokens("Reference 912345"), ["REFERENCE", "912345"]);
    assert.notEqual(normaliserReference("1234"), normaliserReference("912345"));
    const destination = {
      ...DEMO_DESTINATIONER[0], referencer: ["1234"],
      leverandoer: { id: null, cvr: null, navn: null, navnevarianter: [] },
    };
    const match = matchFaktura({
      tenantId: DEMO_TENANT_ID,
      aflæsning: bygAflæsning({ ordreOpgaveNumre: ["912345"] }),
      destinationer: [destination],
    });
    assert.equal(match.placering, null);
    assert.equal(match.kandidater.length, 0);
  });

  test("cross-tenant-reference lækker hverken kandidat eller placering", () => {
    const match = matchFaktura({
      tenantId: DEMO_TENANT_ID,
      aflæsning: bygAflæsning({ ordreOpgaveNumre: ["FLEET-DEMO-CROSS-TENANT"] }),
      destinationer: DEMO_DESTINATIONER,
    });
    assert.equal(match.placering, null);
    assert.equal(match.kandidater.length, 0);
  });

  test("eksakt PROCURE-reference placeres til kontrol", () => {
    assert.equal(scenarie(1).match.placering.modul, MODUL.procure);
    assert.equal(scenarie(1).match.årsag, "eksakt-entydig-reference");
    assert.equal(scenarie(1).match.kontrolstatus, KONTROL_STATUS.tilKontrol);
  });

  test("fremtidig FLEET-reference kan bruges uden ændring af FLEET-modellen", () => {
    assert.equal(scenarie(2).match.placering.modul, MODUL.fleet);
    assert.equal(scenarie(2).match.placering.destinationId, "fleet-opgave-2001");
  });

  test("eksakt reference vinder trods leverandør- og beløbsafvigelse", () => {
    const match = scenarie(10).match;
    assert.equal(match.placering.modul, MODUL.procure);
    assert.ok(match.advarsler.includes("leverandoer-afviger"));
    assert.ok(!match.advarsler.includes("beloeb-afviger-statistisk"));
  });

  test("flere eksakte referencer foreslår opdeling og vælger ikke vilkårligt", () => {
    const match = scenarie(12).match;
    assert.equal(match.placering, null);
    assert.equal(match.kandidater.length, 2);
    assert.equal(match.årsag, "flere-eksakte-referencer-foreslaar-opdeling");
  });

  test("FACILITY-serienummer finder den rigtige adapterdestination", () => {
    assert.equal(scenarie(4).match.trin, "enhed");
    assert.equal(scenarie(4).match.placering.modul, MODUL.facility);
    assert.equal(scenarie(4).match.fundetEnhed.id, "facility-aktiv-port-88");
  });
});

describe("enhedsbaserede sikkerhedsniveauer", () => {
  test("Forsigtig giver kun forslag", () => {
    const match = matchFaktura({
      tenantId: DEMO_TENANT_ID, aflæsning: scenarie(3).aflæsning,
      destinationer: DEMO_DESTINATIONER, sikkerhedsniveau: MATCHNIVEAU.forsigtig,
    });
    assert.equal(match.placering, null);
    assert.equal(match.kandidater.length, 1);
  });

  test("Balanceret kræver eksakt enhed, samme leverandør og én åben opgave", () => {
    const match = scenarie(3).match;
    assert.equal(match.placering.destinationId, "fleet-opgave-1001");
    assert.equal(match.trin, "enhed");
  });

  test("Balanceret placerer ikke ved leverandørkonflikt", () => {
    const læst = bygAflæsning({
      leverandoerId: "lev-demo-forkert", enhedsnumre: ["ENH-042"], nettoOere: 510000,
    });
    const match = matchFaktura({
      tenantId: DEMO_TENANT_ID, aflæsning: læst,
      destinationer: DEMO_DESTINATIONER, sikkerhedsniveau: MATCHNIVEAU.balanceret,
    });
    assert.equal(match.placering, null);
    assert.ok(match.advarsler.includes("leverandoer-afviger"));
  });

  test("Fleksibel kan placere entydig enhed, men viser leverandørkonflikten", () => {
    const læst = bygAflæsning({
      leverandoerId: "lev-demo-forkert", enhedsnumre: ["ENH-042"], nettoOere: 510000,
    });
    const match = matchFaktura({
      tenantId: DEMO_TENANT_ID, aflæsning: læst,
      destinationer: DEMO_DESTINATIONER, sikkerhedsniveau: MATCHNIVEAU.fleksibel,
    });
    assert.equal(match.placering.destinationId, "fleet-opgave-1001");
    assert.ok(match.advarsler.includes("leverandoer-afviger"));
  });

  test("dubleret internt enhedsnummer placeres aldrig automatisk", () => {
    const match = scenarie(7).match;
    assert.equal(match.placering, null);
    assert.equal(match.årsag, "flere-enheder-eller-opgaver");
    assert.equal(match.kandidater.length, 2);
  });

  test("fundet enhed uden åben opgave går til manuel behandling", () => {
    const match = scenarie(8).match;
    assert.equal(match.placering, null);
    assert.equal(match.årsag, "enhed-fundet-uden-aaben-opgave");
    assert.equal(match.fundetEnhed.interntNummer, "ENH-099");
  });
});

describe("leverandørfallback", () => {
  test("én åben leverandøropgave placeres til kontrol", () => {
    assert.equal(scenarie(5).match.årsag, "en-aaben-leverandoeropgave");
    assert.equal(scenarie(5).match.placering.destinationId, "fleet-opgave-eneste");
  });

  test("tre åbne leverandøropgaver vises uden automatisk valg", () => {
    const match = scenarie(6).match;
    assert.equal(match.placering, null);
    assert.equal(match.kandidater.length, 3);
    assert.deepEqual(new Set(match.kandidater.map((k) => k.modul)),
      new Set([MODUL.fleet, MODUL.facility, MODUL.procure]));
  });

  test("ukendt leverandør oprettes ikke af matchkernen", () => {
    const match = scenarie(9).match;
    assert.equal(match.placering, null);
    assert.equal(match.kandidater.length, 0);
    assert.equal(match.trin, "manuel");
  });
});

describe("operationel status og fakturavindue er adskilte", () => {
  test("afsluttet opgave kan fortsat være åben for faktura", () => {
    const destination = scenarie(1).match.placering;
    assert.equal(destination.operationelStatus, "modtaget");
    assert.equal(erAabenForFaktura(destination), true);
    const fleet = DEMO_DESTINATIONER.find((d) => d.destinationId === "fleet-opgave-1001");
    assert.equal(fleet.operationelStatus, "afsluttet");
    assert.equal(erAabenForFaktura(fleet), true);
  });

  test("sen faktura til lukket opgave vises, men placeres ikke", () => {
    assert.equal(scenarie(13).match.placering, null);
    assert.equal(scenarie(13).match.kandidater[0].fakturastatus, FAKTURAVINDUE.lukket);
  });

  test("genåbning af fakturavindue kræver moduladgang, begrundelse og revision", () => {
    const lukket = DEMO_DESTINATIONER.find((d) => d.destinationId === "fleet-opgave-lukket");
    assert.equal(skiftFakturavindue(lukket, FAKTURAVINDUE.aaben, {
      harModulSkriveadgang: true, brugerId: "demo-bruger", tidspunktMs: NU,
    }).ok, false);
    const genåbnet = skiftFakturavindue(lukket, FAKTURAVINDUE.delvis, {
      harModulSkriveadgang: true, brugerId: "demo-bruger", tidspunktMs: NU,
      aktuelTenantId: DEMO_TENANT_ID, begrundelse: "Syntetisk sen faktura",
    });
    assert.equal(genåbnet.ok, true);
    assert.equal(genåbnet.destination.operationelStatus, lukket.operationelStatus);
    assert.equal(genåbnet.destination.fakturahistorik.length, 1);
  });
});

describe("samlet og opdelt fordeling", () => {
  test("samlet match fordeler hele nettobeløbet", () => {
    const faktura = scenarie(11).faktura;
    assert.deepEqual(validérFordeling(faktura.nettoOere, faktura.fordelinger), {
      ok: true, fejl: null, fordeltOere: 480000,
    });
  });

  test("opdeling kan gå på tværs af moduler", () => {
    const faktura = scenarie(12).faktura;
    assert.equal(validérFordeling(faktura.nettoOere, faktura.fordelinger).ok, false);
    assert.equal(validérFordeling(faktura.nettoOere, faktura.fordelinger).fordeltOere, 619999);
    assert.deepEqual(new Set(faktura.fordelinger.map((f) => f.modul)),
      new Set([MODUL.fleet, MODUL.procure]));
  });

  test("ufuldstændig nettobeløbsfordeling kan aldrig kontrolleres", () => {
    const faktura = {
      ...scenarie(11).faktura,
      fordelinger: [{ ...scenarie(11).faktura.fordelinger[0], nettoOere: 479999 }],
      uløsteAdvarsler: [],
    };
    const fordeling = validérFordeling(faktura.nettoOere, faktura.fordelinger);
    assert.equal(fordeling.ok, false);
    assert.equal(fordeling.fejl, TEKNISK_FEJLKODE.ufuldstændigFordeling);
    assert.equal(markérKontrolleret(faktura, {
      ...handlingskontekst(),
    }).ok, false);
  });
});

describe("kontrol, låsning, advarsler og genåbning", () => {
  test("Markér som kontrolleret låser og registrerer egen historikpost", () => {
    const faktura = { ...scenarie(11).faktura, uløsteAdvarsler: [] };
    const resultat = markérKontrolleret(faktura, {
      ...handlingskontekst({ brugerId: "demo-kontrollant" }),
    });
    assert.equal(resultat.ok, true);
    assert.equal(resultat.faktura.kontrolstatus, KONTROL_STATUS.kontrolleret);
    assert.equal(resultat.faktura.låst, true);
    assert.equal(resultat.faktura.historik.at(-1).handling, "markeret-kontrolleret");
  });

  test("forretningsadvarsel kræver begrundelse og kan derefter kontrolleres", () => {
    const faktura = scenarie(10).faktura;
    assert.equal(accepterForretningsadvarsler(faktura, {
      ...handlingskontekst({ begrundelse: "" }),
    }).ok, false);
    const accepteret = accepterForretningsadvarsler(faktura, {
      ...handlingskontekst({ begrundelse: "Syntetisk reference er kontrolleret" }),
    });
    assert.equal(accepteret.ok, true);
    assert.deepEqual(accepteret.faktura.uløsteAdvarsler, []);
  });

  test("sikkerhedsfejl kan aldrig tilsidesættes", () => {
    const resultat = accepterForretningsadvarsler({
      ...scenarie(10).faktura, sikkerhedsfejl: true,
    }, {
      ...handlingskontekst({ begrundelse: "Forsøg" }),
    });
    assert.equal(resultat.ok, false);
    assert.equal(resultat.fejl, "HARD_BLOCKER_CANNOT_BE_OVERRIDDEN");
  });

  test("genåbning kræver adgang og begrundelse og fjerner låsen", () => {
    const låst = scenarie(18).faktura;
    assert.equal(genåbnFaktura(låst, {
      ...handlingskontekst({ begrundelse: "" }),
    }).ok, false);
    const resultat = genåbnFaktura(låst, {
      ...handlingskontekst({ begrundelse: "Syntetisk korrektion" }),
    });
    assert.equal(resultat.ok, true);
    assert.equal(resultat.faktura.låst, false);
    assert.equal(resultat.faktura.kontrolstatus, KONTROL_STATUS.genaabnet);
    assert.equal(resultat.faktura.historik.at(-1).begrundelse, "Syntetisk korrektion");
  });
});

describe("dubletter og kreditnotaer", () => {
  test("hash, kilde-id og fakturaidentitet er uafhængige dubletsignaler", () => {
    const eksisterende = [{
      fakturaId: "demo-eksisterende", tenantId: DEMO_TENANT_ID, sha256: SHA,
      kildeId: "demo-mail-id", fakturanummer: "DEMO-42", leverandoerCvr: "DEMO-CVR",
      nettoOere: 4200, fakturadato: "2026-08-01",
    }];
    const fund = findDubletter({
      tenantId: DEMO_TENANT_ID, sha256: SHA, kildeId: "demo-mail-id",
      fakturanummer: "DEMO-42", leverandoerCvr: "DEMO-CVR",
      nettoOere: 4200, fakturadato: "2026-08-01",
    }, eksisterende);
    assert.equal(fund.status, DUBLET_STATUS.mistænkt);
    assert.deepEqual(fund.fund[0].grunde,
      ["samme-filhash", "samme-kilde-id", "samme-fakturaidentitet"]);
    assert.equal(findDubletter({ tenantId: "anden", sha256: SHA }, eksisterende).fund.length, 0);
  });

  test("mistænkt dublet kan ikke markeres Kontrolleret", () => {
    const resultat = markérKontrolleret(scenarie(14).faktura, {
      ...handlingskontekst(),
    });
    assert.equal(resultat.ok, false);
    assert.ok(resultat.blokeringer.includes("DUPLICATE_UNRESOLVED"));
  });

  test("kreditnota foreslås koblet manuelt til originalfakturaen", () => {
    const kredit = {
      ...scenarie(15).faktura,
      fakturaart: FAKTURAART.kreditnota,
      kreditForFakturanummer: scenarie(11).faktura.fakturanummer,
    };
    const forslag = foreslåKreditnotaKobling(kredit, [scenarie(11).faktura]);
    assert.deepEqual(forslag, [{
      fakturaId: scenarie(11).faktura.fakturaId, kræverManuelKontrol: true,
    }]);
  });

  test("kontrolleret kreditnota modregnes, og genåbning genberegner statistikken", () => {
    const original = {
      ...scenarie(11).faktura, kontrolstatus: KONTROL_STATUS.kontrolleret,
    };
    const kredit = {
      ...scenarie(15).faktura, kontrolstatus: KONTROL_STATUS.kontrolleret,
      nettoOere: -30000,
    };
    assert.equal(kontrolleretOmkostning([original, kredit]), 450000);
    assert.equal(kontrolleretOmkostning([
      original, { ...kredit, kontrolstatus: KONTROL_STATUS.genaabnet },
    ]), 480000);
  });
});

describe("massekontrol", () => {
  test("kun eksplicit markerede behandles, med separat succes eller fejl", () => {
    const klar = { ...scenarie(11).faktura, uløsteAdvarsler: [] };
    const dublet = scenarie(14).faktura;
    const ikkeValgt = scenarie(9).faktura;
    const resultat = masseKontrollér(
      [klar, dublet, ikkeValgt],
      [klar.fakturaId, dublet.fakturaId],
      () => handlingskontekst(),
    );
    assert.equal(resultat.resultater.length, 2);
    assert.equal(resultat.resultater.find((r) => r.fakturaId === klar.fakturaId).ok, true);
    assert.equal(resultat.resultater.find((r) => r.fakturaId === dublet.fakturaId).ok, false);
    assert.equal(resultat.fakturaer.find((f) => f.fakturaId === ikkeValgt.fakturaId), ikkeValgt);
    assert.equal(resultat.fakturaer.find((f) => f.fakturaId === klar.fakturaId).historik.length, 1);
  });

  test("resultater får forståelige, stabile brugerstatusser", () => {
    assert.deepEqual(beskrivMasseResultat({ ok: true, blokeringer: [] }), {
      status: "Kontrolleret",
      forklaring: "Match og fuld nettofordeling er kontrolleret; fakturaen er låst.",
    });
    assert.equal(beskrivMasseResultat({
      ok: false, blokeringer: ["WARNINGS_UNRESOLVED"],
    }).status, "Kræver begrundelse");
    assert.equal(beskrivMasseResultat({
      ok: false, blokeringer: ["MATCH_REQUIRED"],
    }).status, "Mangler match eller fuld fordeling");
    assert.equal(beskrivMasseResultat({
      ok: false, blokeringer: ["ALLOCATION_INCOMPLETE"],
    }).status, "Mangler match eller fuld fordeling");
    assert.equal(beskrivMasseResultat({
      ok: false, blokeringer: ["DUPLICATE_UNRESOLVED"],
    }).status, "Afvist");
  });
});

describe("syntetiske scenarier og UI-afgrænsning", () => {
  test("alle 20 krævede scenarier findes én gang", () => {
    assert.equal(DEMO_FAKTURACENTER_SCENARIER.length, 20);
    assert.deepEqual(DEMO_FAKTURACENTER_SCENARIER.map((s) => s.nummer),
      Array.from({ length: 20 }, (_, i) => i + 1));
    assert.equal(new Set(DEMO_FAKTURACENTER_SCENARIER.map((s) => s.id)).size, 20);
  });

  test("kontrolregler har entydig prioritet og kan kræve to kontrollanter", () => {
    const resultat = validérKontrolregler(DEMO_KONTROLREGLER);
    assert.equal(resultat.ok, true);
    assert.equal(resultat.regler[0].antalKontrollanter, 2);
    assert.equal(validérKontrolregler([
      ...DEMO_KONTROLREGLER,
      { ...DEMO_KONTROLREGLER[0], id: "dublet-prioritet" },
    ]).ok, false);
  });

  test("UI er lokal, klikbar og tydeligt markeret som prototype", () => {
    const ui = readFileSync("src/moduler/oekonomi/Fakturacenter.jsx", "utf8");
    const dele = readFileSync("src/moduler/oekonomi/FakturacenterPrototypeDele.jsx", "utf8");
    const workspace = readFileSync("src/moduler/oekonomi/FakturacenterWorkspace.jsx", "utf8");
    const kontrakt = readFileSync("src/fleet/fakturacenter-intake.js", "utf8");
    const samletUi = ui + dele + workspace;
    assert.match(samletUi, /Lokal prototype · kun syntetiske data/);
    assert.match(samletUi, /onDrop=/);
    assert.match(samletUi, /PDF · JPG\/JPEG · PNG · XML · OIOUBL/);
    assert.match(samletUi, /Markér som kontrolleret/);
    for (const sektion of ["Ny i indbakken", "Kræver behandling", "Til kontrol",
      "Kontrollerede", "Mail og forbindelser", "Arkiv"]) {
      assert.match(samletUi + kontrakt, new RegExp(sektion));
    }
    assert.doesNotMatch(samletUi, /useListe|firebase\/|uploadFakturaDokument/);
    assert.match(samletUi, /Kontrol er ikke betalingsgodkendelse eller bogføring/);
    assert.doesNotMatch(samletUi, /Markér som (betalt|bogført)|Godkend betaling/i);
    assert.match(samletUi, /aria-current=/);
    assert.match(samletUi, /aria-pressed=/);
    assert.match(samletUi, /aria-selected=/);
    assert.match(samletUi, /aria-live="polite"/);
    assert.doesNotMatch(samletUi, /URL\.createObjectURL|localStorage|sessionStorage/);
  });

  test("navigationen har præcis de seks aftalte sektioner", () => {
    assert.deepEqual(FAKTURACENTER_SEKTIONER.map(({ label }) => label), [
      "Ny i indbakken",
      "Kræver behandling",
      "Til kontrol",
      "Kontrollerede",
      "Mail og forbindelser",
      "Arkiv",
    ]);
  });

  test("arbejdslisten har fast markeringskolonne, ens kortbredde og betinget handlingslinje", () => {
    const ui = readFileSync("src/moduler/oekonomi/Fakturacenter.jsx", "utf8");
    const css = readFileSync("src/moduler/oekonomi/FakturacenterIntake.css", "utf8");
    assert.match(ui, /valgteTilMasse\.length > 0 &&/);
    assert.match(ui, /Markér valgte som kontrolleret/);
    assert.match(ui, /Ryd valg/);
    assert.match(ui, /title=\{scenarie\.titel\}/);
    assert.match(ui, /fic-invoice-supplier/);
    assert.match(css, /\.fic-invoice\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*40px minmax\(0,\s*1fr\);[^}]*width:\s*100%;/s);
    assert.match(css, /\.fic-inbox-list\s*\{[^}]*overflow-x:\s*hidden;/s);
    assert.match(css, /\.fic-invoice-title[^}]*text-overflow:\s*ellipsis;/s);
    assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.fic-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(3,minmax\(0,1fr\)\);/);
    assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.fic-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\);/);
  });

  test("alle sektioner forklarer formål og prototypegrænse", () => {
    const ui = readFileSync("src/moduler/oekonomi/Fakturacenter.jsx", "utf8");
    for (const tekst of [
      "Fluebenet alene ændrer ingen status",
      "Dubletter, ulæselige dokumenter og uafklarede match",
      "Kontrol er ikke betalingsgodkendelse eller bogføring",
      "Låste fakturaer tæller som faktiske omkostninger",
      "Opsætning · ikke et behandlingstrin",
      "Permanent opbevaring er ikke implementeret",
    ]) assert.ok(ui.includes(tekst), `Mangler sektionsforklaring: ${tekst}`);
  });

  test("arbejdsbordet har en isoleret viewportkontrakt og tre interne scrollområder", () => {
    const ui = readFileSync("src/moduler/oekonomi/Fakturacenter.jsx", "utf8");
    const workspace = readFileSync("src/moduler/oekonomi/FakturacenterWorkspace.jsx", "utf8");
    const css = readFileSync("src/moduler/oekonomi/FakturacenterIntake.css", "utf8");
    assert.match(ui, /className="fic-workbench"/);
    assert.match(css, /#root:has\(\.fic-shell\)[^{]*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s);
    assert.match(css, /\.fic-shell\s*\{[^}]*height:\s*100%;[^}]*grid-template-rows:[^;]*minmax\(0,\s*1fr\);[^}]*overflow:\s*hidden;/s);
    assert.match(css, /\.fic-workspace\s*\{[^}]*grid-template-columns:\s*minmax\([^)]*\)\s+minmax\(0,\s*1fr\);[^}]*height:\s*100%;/s);
    assert.match(css, /\.fic-inbox-list\s*\{[^}]*overflow-y:\s*auto;/s);
    assert.match(css, /\.fic-document-panel[^}]*overflow-y:\s*auto;/s);
    assert.match(css, /\.fic-review-panel[^}]*overflow-y:\s*auto;/s);
    assert.match(workspace, /aria-label="Originaldokument · internt scrollområde"/);
    assert.match(workspace, /aria-label="Behandling · internt scrollområde"/);
  });

  test("paneloverskrifter og massehandling bliver i deres egne paneler", () => {
    const css = readFileSync("src/moduler/oekonomi/FakturacenterIntake.css", "utf8");
    assert.match(css, /\.fic-panel-head[^}]*position:\s*sticky;[^}]*top:\s*0;/s);
    assert.match(css, /\.fic-document-toolbar[^}]*position:\s*sticky;[^}]*top:\s*0;/s);
    assert.match(css, /\.fic-bulk\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0;/s);
  });

  test("små skærme har tilgængelig panelnavigation uden matchprocenter", () => {
    const ui = readFileSync("src/moduler/oekonomi/Fakturacenter.jsx", "utf8");
    const dele = readFileSync("src/moduler/oekonomi/FakturacenterPrototypeDele.jsx", "utf8");
    const workspace = readFileSync("src/moduler/oekonomi/FakturacenterWorkspace.jsx", "utf8");
    const css = readFileSync("src/moduler/oekonomi/FakturacenterIntake.css", "utf8");
    const samlet = ui + dele + workspace;
    for (const panel of ["Liste", "Dokument", "Behandling"]) {
      assert.match(samlet, new RegExp(`label: "${panel}"`));
    }
    assert.match(samlet, /aria-pressed=\{aktivtPanel === panel\.id\}/);
    assert.match(samlet, /data-active-panel=\{aktivtPanel\}/);
    assert.match(css, /@media \(max-width:\s*900px\)[\s\S]*\.fic-panel-switcher[^}]*display:\s*grid;/);
    assert.doesNotMatch(samlet, /match(score|procent)|confidence/i);
  });

  test("mail og arkiv bruger samme viewportprincip som behandlingssektionerne", () => {
    const ui = readFileSync("src/moduler/oekonomi/Fakturacenter.jsx", "utf8");
    const css = readFileSync("src/moduler/oekonomi/FakturacenterIntake.css", "utf8");
    assert.match(ui, /fic-section-viewport fic-section-viewport-mail/);
    assert.match(ui, /fic-section-viewport fic-section-viewport-archive/);
    assert.match(css, /\.fic-section-viewport\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
  });
});

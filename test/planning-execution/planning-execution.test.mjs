import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  BETINGELSESOPERATOR, DATAKLASSIFIKATION, FOTOKATEGORI, MODTAGERMETODE, SPOERGSMAALTYPE,
  UDFOERELSESKODE, UDFOERELSESSKABELONSTATUS, deaktiverMaterialetype, deaktiverUdfoerelsesskabelon,
  evaluerBetingelse, mobilFlowForStop, opretMaterialetype, opretNySkabelonVersion,
  opretUdfoerelsesskabelon, redigerUdfoerelsesskabelon, snapshotUdfoerelseskrav,
  validerMaterialeforbrug, validerMaterialekatalog, validerUdfoerelsesskabelon,
} from "../../src/fleet/planning-execution/index.js";
import { DEMO_MATERIALER, DEMO_UDFOERELSESSKABELONER } from "../../src/fleet/planning-execution/demo-planning-execution.js";

const NU = Date.UTC(2032, 4, 17, 12);
const klon = (vaerdi) => JSON.parse(JSON.stringify(vaerdi));

describe("Udførelsesskabeloner, versioner og snapshots", () => {
  it("opretter deterministisk med injiceret ID og tidspunkt", () => {
    const oprettet = opretUdfoerelsesskabelon({ navn: "Fiktiv" }, { idGenerator: () => "udf-1", tidspunktMs: NU });
    assert.deepEqual({ id: oprettet.id, version: oprettet.version, oprettetMs: oprettet.oprettetMs }, { id: "udf-1", version: 1, oprettetMs: NU });
  });

  it("redigerer uden at mutere input", () => {
    const original = klon(DEMO_UDFOERELSESSKABELONER[0]);
    const redigeret = redigerUdfoerelsesskabelon(original, { navn: "Ny fiktiv titel" }, NU);
    assert.notEqual(redigeret.navn, original.navn);
    assert.equal(original.navn, DEMO_UDFOERELSESSKABELONER[0].navn);
  });

  it("validerer spørgsmål uden at ændre deres rækkefølge", () => {
    const original = klon(DEMO_UDFOERELSESSKABELONER[0]);
    original.stopprofiler[0].spoergsmaal.reverse();
    const foer = original.stopprofiler[0].spoergsmaal.map((post) => post.id);
    validerUdfoerelsesskabelon(original, { stopIder: ["stop-levering"], materialer: DEMO_MATERIALER });
    assert.deepEqual(original.stopprofiler[0].spoergsmaal.map((post) => post.id), foer);
  });

  it("opretter en ny historisk version", () => {
    const gammel = klon(DEMO_UDFOERELSESSKABELONER[0]);
    const naeste = opretNySkabelonVersion(gammel, { navn: "Version 2" }, NU);
    assert.equal(naeste.version, 2);
    assert.equal(naeste.tidligereVersion, 1);
    assert.equal(gammel.version, 1);
  });

  it("deaktiverer uden fysisk sletning", () => {
    const deaktiveret = deaktiverUdfoerelsesskabelon(DEMO_UDFOERELSESSKABELONER[0], NU);
    assert.equal(deaktiveret.status, UDFOERELSESSKABELONSTATUS.INAKTIV);
    assert.equal(deaktiveret.id, DEMO_UDFOERELSESSKABELONER[0].id);
  });

  it("snapshotter skabelon, stopkrav, klassifikation og materialer", () => {
    const svar = snapshotUdfoerelseskrav(DEMO_UDFOERELSESSKABELONER[0], [{ id: "stop-levering" }], DEMO_MATERIALER, NU);
    assert.equal(svar.ok, true);
    assert.equal(svar.snapshot.skabelonVersion, 1);
    assert.equal(svar.snapshot.stopprofiler[0].materialer.length, 6);
    assert.equal(svar.snapshot.dataklassifikation.UNDERSKRIFT, DATAKLASSIFIKATION.UNDERSKRIFT);
  });

  it("senere skabelon- og katalogændring ændrer ikke et snapshot", () => {
    const svar = snapshotUdfoerelseskrav(DEMO_UDFOERELSESSKABELONER[0], [{ id: "stop-levering" }], DEMO_MATERIALER, NU);
    const naeste = opretNySkabelonVersion(DEMO_UDFOERELSESSKABELONER[0], { navn: "Ny" }, NU + 1);
    const deaktiveret = deaktiverMaterialetype(DEMO_MATERIALER[0]);
    assert.equal(svar.snapshot.navn, DEMO_UDFOERELSESSKABELONER[0].navn);
    assert.equal(svar.snapshot.stopprofiler[0].materialer[0].navn, DEMO_MATERIALER[0].navn);
    assert.equal(naeste.version, 2);
    assert.equal(deaktiveret.aktiv, false);
  });

  it("binder en genbrugelig stoptypeprofil til opgavens konkrete stop-id", () => {
    const skabelon = klon(DEMO_UDFOERELSESSKABELONER[0]);
    const stop = [{ id: "konkret-stop-77", type: "LEVERING" }];
    const svar = snapshotUdfoerelseskrav(skabelon, stop, DEMO_MATERIALER, NU);
    assert.equal(svar.ok, true);
    assert.equal(svar.snapshot.stopprofiler[0].stopId, "konkret-stop-77");
    assert.equal(svar.snapshot.stopprofiler[0].dokumenter[0].stopId, "konkret-stop-77");
    assert.equal(skabelon.stopprofiler[0].stopId, "stop-levering");
  });
});

describe("Dokument-, foto- og spørgsmålskrav", () => {
  it("kræver dokumentreference ved obligatorisk underskrift", () => {
    const ugyldig = klon(DEMO_UDFOERELSESSKABELONER[0]);
    delete ugyldig.stopprofiler[0].dokumenter[0].dokumentRef;
    const koder = validerUdfoerelsesskabelon(ugyldig, { stopIder: ["stop-levering"], materialer: DEMO_MATERIALER }).fund.map((post) => post.kode);
    assert.ok(koder.includes(UDFOERELSESKODE.DOKUMENTREFERENCE_MANGLER));
    assert.ok(koder.includes(UDFOERELSESKODE.UNDERSKRIFT_UDEN_DOKUMENT));
  });

  it("låser modtagermetoden til chaufførindtastet mail", () => {
    const dokument = DEMO_UDFOERELSESSKABELONER[0].stopprofiler[0].dokumenter[0];
    assert.equal(dokument.underskrift.modtagermetode, MODTAGERMETODE.CHAUFFOER_INDTASTER_MAIL);
    const ugyldig = klon(DEMO_UDFOERELSESSKABELONER[0]);
    ugyldig.stopprofiler[0].dokumenter[0].underskrift.modtagermetode = "AUTOMATISK_MAIL";
    assert.ok(validerUdfoerelsesskabelon(ugyldig, { stopIder: ["stop-levering"], materialer: DEMO_MATERIALER }).fund.some((post) => post.kode === UDFOERELSESKODE.MODTAGERMETODE_UGYLDIG));
  });

  it("afviser foto-minimum over maksimum", () => {
    const ugyldig = klon(DEMO_UDFOERELSESSKABELONER[0]);
    ugyldig.stopprofiler[0].fotos[0].minimumAntal = 4;
    ugyldig.stopprofiler[0].fotos[0].maksimumAntal = 2;
    assert.ok(validerUdfoerelsesskabelon(ugyldig, { stopIder: ["stop-levering"], materialer: DEMO_MATERIALER }).fund.some((post) => post.kode === UDFOERELSESKODE.FOTO_ANTAL_UGYLDIGT));
  });

  it("understøtter alle aftalte fotokategorier og spørgsmålstyper", () => {
    assert.deepEqual(Object.values(FOTOKATEGORI).sort(), ["ANDET", "EFTER", "EMBALLAGE", "FOER", "LEVERINGSKVITTERING", "PLACERING", "SYNLIG_SKADE"].sort());
    assert.equal(Object.values(SPOERGSMAALTYPE).length, 10);
  });

  it("afviser valgspørgsmål uden valgmuligheder og påkrævet spørgsmål uden tekst", () => {
    const ugyldig = klon(DEMO_UDFOERELSESSKABELONER[0]);
    ugyldig.stopprofiler[0].spoergsmaal.push({ id: "sp-valg", tekst: "", type: SPOERGSMAALTYPE.ENKELTVALG, paakraevet: true, svarmuligheder: [], raekkefoelge: 8 });
    const koder = validerUdfoerelsesskabelon(ugyldig, { stopIder: ["stop-levering"], materialer: DEMO_MATERIALER }).fund.map((post) => post.kode);
    assert.ok(koder.includes(UDFOERELSESKODE.SPOERGSMAAL_TEKST_MANGLER));
    assert.ok(koder.includes(UDFOERELSESKODE.VALGMULIGHEDER_MANGLER));
  });

  it("afviser ukendt, selv- og senere reference", () => {
    const ugyldig = klon(DEMO_UDFOERELSESSKABELONER[0]);
    ugyldig.stopprofiler[0].spoergsmaal[0].betingelse = { spoergsmaalId: "ukendt", operator: BETINGELSESOPERATOR.ER, vaerdi: true };
    ugyldig.stopprofiler[0].spoergsmaal[1].betingelse = { spoergsmaalId: "sp-skade", operator: BETINGELSESOPERATOR.ER, vaerdi: true };
    const koder = validerUdfoerelsesskabelon(ugyldig, { stopIder: ["stop-levering"], materialer: DEMO_MATERIALER }).fund.map((post) => post.kode);
    assert.ok(koder.includes(UDFOERELSESKODE.BETINGELSE_REFERENCE_UKENDT));
    assert.ok(koder.includes(UDFOERELSESKODE.BETINGELSE_SELREFERENCE));
    assert.ok(koder.includes(UDFOERELSESKODE.BETINGELSE_SENERE_SPOERGSMAAL));
  });

  it("opdager cirkulære betingelser", () => {
    const ugyldig = klon(DEMO_UDFOERELSESSKABELONER[0]);
    const s = ugyldig.stopprofiler[0].spoergsmaal;
    s[0].betingelse = { spoergsmaalId: s[1].id, operator: BETINGELSESOPERATOR.ER, vaerdi: true };
    s[1].betingelse = { spoergsmaalId: s[0].id, operator: BETINGELSESOPERATOR.ER, vaerdi: true };
    assert.ok(validerUdfoerelsesskabelon(ugyldig, { stopIder: ["stop-levering"], materialer: DEMO_MATERIALER }).fund.some((post) => post.kode === UDFOERELSESKODE.BETINGELSE_CYKLUS));
  });

  it("evaluerer betingelser uden brugerdefineret programkode", () => {
    assert.equal(evaluerBetingelse({ spoergsmaalId: "a", operator: BETINGELSESOPERATOR.ER, vaerdi: true }, { a: true }), true);
    assert.equal(evaluerBetingelse({ spoergsmaalId: "n", operator: BETINGELSESOPERATOR.STOERRE_END, vaerdi: 4 }, { n: 5 }), true);
    assert.equal(evaluerBetingelse({ spoergsmaalId: "n", operator: BETINGELSESOPERATOR.MINDRE_END, vaerdi: 4 }, { n: 5 }), false);
  });
});

describe("Materialer og mobilforhåndsvisning", () => {
  it("kræver materialenhed", () => {
    const materiale = opretMaterialetype({ id: "m", navn: "Fiktiv", enhed: "" });
    assert.ok(validerMaterialekatalog([materiale]).fund.some((post) => post.kode === UDFOERELSESKODE.MATERIALE_ENHED_MANGLER));
  });

  it("kræver positive antal og tillader flere materialer", () => {
    const snapshot = snapshotUdfoerelseskrav(DEMO_UDFOERELSESSKABELONER[0], [{ id: "stop-levering" }], DEMO_MATERIALER, NU).snapshot;
    assert.equal(validerMaterialeforbrug([{ materialeId: DEMO_MATERIALER[0].id, antal: 2 }, { materialeId: DEMO_MATERIALER[1].id, antal: 1.5 }], snapshot).ok, true);
    assert.ok(validerMaterialeforbrug([{ materialeId: DEMO_MATERIALER[0].id, antal: 0 }], snapshot).fund.some((post) => post.kode === UDFOERELSESKODE.MATERIALE_ANTAL_UGYLDIGT));
  });

  it("afviser et materiale uden for det historiske snapshot", () => {
    const snapshot = snapshotUdfoerelseskrav(DEMO_UDFOERELSESSKABELONER[0], [{ id: "stop-levering" }], DEMO_MATERIALER, NU).snapshot;
    assert.ok(validerMaterialeforbrug([{ materialeId: "ukendt", antal: 1 }], snapshot).fund.some((post) => post.kode === UDFOERELSESKODE.MATERIALE_INAKTIVT));
  });

  it("viser materialetrinnet efter JA og mærker eksterne funktioner som ikke tilsluttet", () => {
    const profil = DEMO_UDFOERELSESSKABELONER[0].stopprofiler[0];
    const uden = mobilFlowForStop(profil, { "sp-materialer": false });
    const med = mobilFlowForStop(profil, { "sp-materialer": true });
    assert.equal(uden.includes("Registrér materialer"), false);
    assert.equal(med.includes("Registrér materialer"), true);
    assert.ok(med.some((trin) => trin.includes("Ikke tilsluttet endnu")));
  });
});

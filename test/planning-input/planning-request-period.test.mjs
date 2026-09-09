import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BESTILLINGSPERIODEART, BESTILLINGSPERIODENIVEAU, IMPORTKILDE, INPUTKODE,
  foreslaaKolonnemapping, normaliserBestillingsperiode,
  opretOpgaverFraImportRaekker, parseCsv,
} from "../../src/fleet/planning-input/index.js";
import {
  IMPORTSKABELON_SEPARATOR, opretStandardImportCsv, validerStandardImportkolonner,
} from "../../src/fleet/planning-ui/planning-import-template.js";

const context = () => { let id = 0; return { tenantRef: "tenant-fiktiv", kilde: IMPORTKILDE.CSV, batchId: "batch-perioder", filnavn: "syntetisk.csv", importeretMs: Date.UTC(2032, 4, 17, 12), idGenerator: (prefix) => `${prefix}-${++id}` }; };

describe("Offentlig bestillingsperiodekontrakt", () => {
  it("normaliserer dato, dato/tid, tidsvindue, ISO-uge, interval og manglende ønske", () => {
    const fixtures = [
      [{ periodeart: "DATO", periodeniveau: "OENSKET", oensketDato: "18-05-2032" }, { art: "DATO", niveau: "OENSKET", dato: "2032-05-18" }],
      [{ periodeart: "DATO_TID", periodeniveau: "OENSKET", oensketDato: "18-05-2032", oensketTid: "10:30" }, { art: "DATO_TID", niveau: "OENSKET", dato: "2032-05-18", tid: "10:30" }],
      [{ periodeart: "TIDSVINDUE", periodeniveau: "SKAL_OVERHOLDES", oensketDato: "18-05-2032", oensketVindueFra: "09:00", oensketVindueTil: "12:00" }, { art: "TIDSVINDUE", niveau: "SKAL_OVERHOLDES", dato: "2032-05-18", fra: "09:00", til: "12:00" }],
      [{ periodeart: "ISO_UGE", periodeniveau: "OENSKET", oensketUge: "20", oensketUgeAar: "2032" }, { art: "ISO_UGE", niveau: "OENSKET", uge: 20, aar: 2032 }],
      [{ periodeart: "DATO_INTERVAL", periodeniveau: "OENSKET", periodeFra: "18-05-2032", periodeTil: "20-05-2032" }, { art: "DATO_INTERVAL", niveau: "OENSKET", fraDato: "2032-05-18", tilDato: "2032-05-20" }],
      [{}, { art: BESTILLINGSPERIODEART.UDEN_DATO_OENSKE, niveau: BESTILLINGSPERIODENIVEAU.OENSKET }],
    ];
    for (const [raw, expected] of fixtures) {
      const result = normaliserBestillingsperiode(raw);
      assert.deepEqual(result.periode, expected);
      assert.deepEqual(result.fund, []);
    }
  });

  it("afviser modstridende og ugyldige periodefelter", () => {
    const result = normaliserBestillingsperiode({ periodeart: "ISO_UGE", periodeniveau: "OENSKET", oensketUge: "53", oensketUgeAar: "2033", oensketTid: "10:00" });
    assert.ok(result.fund.some((finding) => finding.kode === INPUTKODE.BESTILLINGSPERIODE_UGYLDIG));
    assert.ok(result.fund.some((finding) => finding.kode === INPUTKODE.BESTILLINGSPERIODE_MODSTRIDENDE));
  });

  it("bevarer ældre CSV uden periodekolonner som uden datoønske", () => {
    const csv = "Ekstern reference;Opgavenavn;Kunde;Adresse;Land;Dato;Tidsform;Stopvarighed;Stoptype\r\nDEMO-OLD;Fiktiv opgave;Demo-bestiller;Testvej 1;DK;18-05-2032;Frit tidspunkt;30;SERVICE\r\n";
    const parsed = parseCsv(csv);
    const tasks = opretOpgaverFraImportRaekker(parsed.raekker, foreslaaKolonnemapping(parsed.overskrifter), context());
    assert.equal(tasks.length, 1);
    assert.deepEqual(tasks[0].bestillingsperiode, { art: "UDEN_DATO_OENSKE", niveau: "OENSKET" });
  });

  it("roundtrip-importerer standard-CSV med ønsker og bindende flerstopinterval", () => {
    assert.equal(IMPORTSKABELON_SEPARATOR, ";");
    assert.deepEqual(validerStandardImportkolonner(), { ok: true, ukendte: [] });
    const parsed = parseCsv(opretStandardImportCsv());
    const tasks = opretOpgaverFraImportRaekker(parsed.raekker, foreslaaKolonnemapping(parsed.overskrifter), context());
    const single = tasks.find((task) => task.eksternReference === "DEMO-ENKELT-001");
    const multi = tasks.find((task) => task.importFlerstopId === "DEMO-FLERSTOP-001");
    assert.deepEqual(single.bestillingsperiode, { art: "ISO_UGE", niveau: "OENSKET", uge: 20, aar: 2032 });
    assert.deepEqual(multi.bestillingsperiode, { art: "DATO_INTERVAL", niveau: "SKAL_OVERHOLDES", fraDato: "2032-05-18", tilDato: "2032-05-20" });
    assert.deepEqual(multi.stop.map((stop) => [stop.id, stop.raekkefoelge, stop.type]), [["DEMO-STOP-A", 1, "AFHENTNING"], ["DEMO-STOP-B", 2, "LEVERING"]]);
  });
});

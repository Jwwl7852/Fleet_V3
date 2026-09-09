import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DUBLETTYPE, IMPORTKILDE, INPUTKODE, STOPTYPE, findDubletter,
  foreslaaKolonnemapping, opretOpgaverFraImportRaekker, parseCsv,
} from "../../src/fleet/planning-input/index.js";

const HEADERS = "Samlet opgave-ID;Stop-ID;Stoprækkefølge;Ekstern reference;Opgavenavn;Kunde;Adresse;Land;Dato;Tidsform;Tidsvindue fra;Tidsvindue til;Deadline;Stopvarighed;Stoptype";
const row = ({ group = "", stop = "", order = "", external = "DEMO-EXT", name = "Fiktivt stop", address = "Testvej 1", type = "SERVICE", time = "Frit tidspunkt", from = "", to = "", deadline = "" } = {}) => [group, stop, order, external, name, "Demo-modtager", address, "DK", "18-05-2032", time, from, to, deadline, "20", type].join(";");
const context = () => { let n = 0; return { tenantRef: "tenant-fiktiv", kilde: IMPORTKILDE.CSV, batchId: "batch-demo", filnavn: "demo.csv", importeretMs: Date.UTC(2032, 4, 17, 12), idGenerator: (prefix) => `${prefix}-${++n}` }; };
const importer = (rows) => {
  const parsed = parseCsv(`${HEADERS}\n${rows.join("\n")}`);
  const mapping = foreslaaKolonnemapping(parsed.overskrifter);
  return opretOpgaverFraImportRaekker(parsed.raekker, mapping, context());
};
const has = (opgave, kode) => opgave.valideringsfund.some((fund) => fund.kode === kode);

describe("Eksplicit flerstop-import", () => {
  it("bevarer almindelig række som én én-stop-opgave", () => {
    const result = importer([row()]);
    assert.equal(result.length, 1);
    assert.equal(result[0].stop.length, 1);
    assert.equal(result[0].importFlerstopId, null);
  });

  it("samler kun en gyldig eksplicit gruppe og sorterer stop", () => {
    const result = importer([
      row({ group: "DEMO-GRUPPE", stop: "STOP-B", order: "2", name: "Fiktiv levering", address: "Testvej 2", type: STOPTYPE.LEVERING, time: "Deadline", deadline: "12:00" }),
      row({ group: "DEMO-GRUPPE", stop: "STOP-A", order: "1", name: "Fiktiv afhentning", type: STOPTYPE.AFHENTNING, time: "Tidsvindue", from: "09:00", to: "10:00" }),
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].stop.length, 2);
    assert.deepEqual(result[0].stop.map((stop) => [stop.id, stop.raekkefoelge, stop.type]), [["STOP-A", 1, STOPTYPE.AFHENTNING], ["STOP-B", 2, STOPTYPE.LEVERING]]);
  });

  it("afviser stopmetadata uden samlet flerstopidentitet", () => {
    assert.equal(has(importer([row({ stop: "STOP-A", order: "1" })])[0], INPUTKODE.FLERSTOP_ID_MANGLER), true);
  });

  it("afviser manglende og dubleret stopidentitet", () => {
    assert.equal(has(importer([row({ group: "G", order: "1" }), row({ group: "G", stop: "B", order: "2" })])[0], INPUTKODE.STOP_ID_MANGLER), true);
    assert.equal(has(importer([row({ group: "G", stop: "A", order: "1" }), row({ group: "G", stop: "A", order: "2" })])[0], INPUTKODE.STOP_ID_DUBLERET), true);
  });

  it("afviser manglende, ugyldig og dubleret stoprækkefølge", () => {
    assert.equal(has(importer([row({ group: "G", stop: "A" }), row({ group: "G", stop: "B", order: "2" })])[0], INPUTKODE.STOPRAEKKEFOELGE_MANGLER), true);
    assert.equal(has(importer([row({ group: "G", stop: "A", order: "0" }), row({ group: "G", stop: "B", order: "2" })])[0], INPUTKODE.STOPRAEKKEFOELGE_UGYLDIG), true);
    assert.equal(has(importer([row({ group: "G", stop: "A", order: "1" }), row({ group: "G", stop: "B", order: "1" })])[0], INPUTKODE.STOPRAEKKEFOELGE_DUBLERET), true);
  });

  it("afviser afhentning efter levering", () => {
    const result = importer([row({ group: "G", stop: "A", order: "1", type: STOPTYPE.LEVERING }), row({ group: "G", stop: "B", order: "2", type: STOPTYPE.AFHENTNING })]);
    assert.equal(has(result[0], INPUTKODE.AFHENTNING_EFTER_LEVERING), true);
  });

  it("giver samme stopresultat uanset inputrækkefølge", () => {
    const a = row({ group: "G", stop: "A", order: "1", type: STOPTYPE.AFHENTNING });
    const b = row({ group: "G", stop: "B", order: "2", type: STOPTYPE.LEVERING });
    const projektion = (opgave) => opgave.stop.map((stop) => ({ id: stop.id, raekkefoelge: stop.raekkefoelge, type: stop.type }));
    assert.deepEqual(projektion(importer([a, b])[0]), projektion(importer([b, a])[0]));
  });

  it("muterer ikke parserrækker eller mapping", () => {
    const parsed = parseCsv(`${HEADERS}\n${row({ group: "G", stop: "A", order: "1" })}`);
    const mapping = foreslaaKolonnemapping(parsed.overskrifter);
    const before = JSON.stringify({ rows: parsed.raekker, mapping });
    opretOpgaverFraImportRaekker(parsed.raekker, mapping, context());
    assert.equal(JSON.stringify({ rows: parsed.raekker, mapping }), before);
  });

  it("klassificerer ikke rækker i samme eksplicitte gruppe som indbyrdes dubletter", () => {
    const grouped = importer([row({ group: "G", stop: "A", order: "1" }), row({ group: "G", stop: "B", order: "2" })]);
    assert.equal(findDubletter(grouped, [])[0].dublet.type, DUBLETTYPE.INGEN);
  });

  it("opdager fortsat en reel ekstern dublet", () => {
    const existing = importer([row({ external: "SAMME" })])[0];
    const incoming = importer([row({ external: "SAMME", address: "Testvej 9" })])[0];
    assert.equal(findDubletter([incoming], [existing])[0].dublet.type, DUBLETTYPE.SIKKER);
  });
});

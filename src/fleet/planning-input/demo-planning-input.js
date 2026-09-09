/* Tydeligt syntetiske intake-fixtures til den lokale browserprototype. */

import { DEMO_MATERIALER, DEMO_UDFOERELSESSKABELONER } from "../planning-execution/demo-planning-execution.js";
import {
  ADRESSESTATUS, DUBLETBESLUTNING, DUBLETTYPE, IMPORTKILDE, INTAKESTATUS, STOPTYPE,
  beslutDublet, findDubletter, godkendOpgave, opretIntakeOpgave,
} from "./index.js";

export const DEMO_IMPORTTID_MS = Date.UTC(2032, 4, 17, 14, 30);
const TENANT = "tenant-fiktiv-ui-demo";
const kendteRessourcer = [{ id: "med-demo-1" }, { id: "bil-demo-1" }];

function idGenerator() {
  let nummer = 0;
  return (praefiks) => `demo-${praefiks}-${String(++nummer).padStart(3, "0")}`;
}

function grunddata(indeks) {
  const tidsformer = ["Fast tidspunkt", "Tidsvindue", "Deadline", "Frit tidspunkt"];
  const stoptyper = [STOPTYPE.BESOEG, STOPTYPE.LEVERING, STOPTYPE.AFHENTNING, STOPTYPE.SERVICE, STOPTYPE.KONTROL, STOPTYPE.ANDET];
  const tidsform = tidsformer[indeks % tidsformer.length];
  return {
    eksternReference: `DEMO-EXT-${String(indeks).padStart(3, "0")}`,
    navn: `Fiktiv importopgave ${String(indeks).padStart(2, "0")}`,
    type: indeks % 2 ? "Fiktiv service" : "Fiktiv levering", kunde: `Demo-modtager ${String((indeks % 9) + 1).padStart(2, "0")}`,
    prioritet: indeks % 7 === 0 ? "HOEJ" : "NORMAL", rutetype: indeks % 2 ? "Service" : "Transport",
    stop: [{
      stoptype: stoptyper[indeks % stoptyper.length], navn: `Fiktivt stop ${indeks}`,
      adresse: `Testvej ${100 + indeks}`, postnummer: "0000", by: "Demoby", land: indeks % 8 === 0 ? "SE" : "DK",
      adressestatus: ADRESSESTATUS.UKONTROLLERET, dato: "18-05-2032", tidsform,
      fastTid: tidsform === "Fast tidspunkt" ? "08:30" : "", vindueFra: tidsform === "Tidsvindue" ? "09:00" : "",
      vindueTil: tidsform === "Tidsvindue" ? "10:30" : "", deadline: tidsform === "Deadline" ? "12:00" : "",
      varighed: indeks % 3 === 0 ? "00:30" : indeks % 3 === 1 ? "30 min" : "1:15",
      krav: { kompetencer: indeks % 6 === 0 ? ["demo-specialist"] : [], certifikater: [], udstyr: [], kapacitet: "" },
    }],
  };
}

export function opretDemoIntakeData() {
  const naesteId = idGenerator();
  const eksisterende = [1, 2, 3, 4].map((indeks) => {
    const data = grunddata(indeks);
    if (indeks > 1) data.eksternReference = `EKSISTERENDE-${indeks}`;
    return opretIntakeOpgave(data, { tenantRef: TENANT, kilde: IMPORTKILDE.MANUEL, importeretMs: DEMO_IMPORTTID_MS - 86400000, idGenerator: naesteId, kendteRessourcer });
  });
  const importerede = Array.from({ length: 30 }, (_, nulIndeks) => {
    const indeks = nulIndeks + 1;
    const data = grunddata(indeks);
    if (indeks === 1) data.stop[0].id = "stop-levering";
    if (indeks === 2 || indeks === 3 || indeks === 4) {
      data.kunde = eksisterende[indeks - 1].kunde;
      data.stop[0].adresse = eksisterende[indeks - 1].stop[0].lokation.adresse;
      data.stop[0].stoptype = eksisterende[indeks - 1].stop[0].type;
      data.eksternReference = `DEMO-MULIG-${indeks}`;
    }
    if (indeks === 5) data.stop[0].varighed = "";
    if (indeks === 10) { data.stop[0].tidsform = "Fast tidspunkt"; data.stop[0].fastTid = "35:90"; }
    if (indeks === 15) data.stop[0].adresse = "";
    if (indeks === 20) data.medarbejderRef = "ukendt-demo-medarbejder";
    if (indeks === 25) data.stop[0].stoptype = "UKENDT";
    if (indeks === 30) {
      data.stop[0].stoptype = STOPTYPE.AFHENTNING;
      data.stop.push({
      ...data.stop[0], id: "stop-afhentning-levering-2", stoptype: STOPTYPE.LEVERING,
      navn: "Fiktiv levering efter afhentning", adresse: "Prøveallé 230", varighed: "30 min",
      });
    }
    return opretIntakeOpgave(data, {
      tenantRef: TENANT, kilde: IMPORTKILDE.CSV, batchId: "batch-demo-2032-05-17", filnavn: "fiktive-opgaver.csv",
      raekkenummer: indeks + 1, importeretMs: DEMO_IMPORTTID_MS, idGenerator: naesteId, kendteRessourcer,
      udfoerelsesskabelon: indeks === 1 ? DEMO_UDFOERELSESSKABELONER[0] : null, materialer: DEMO_MATERIALER,
    });
  });
  let medDubletter = findDubletter(importerede, eksisterende);
  medDubletter = medDubletter.map((opgave, indeks) => {
    if (opgave.dublet.type === DUBLETTYPE.SIKKER) return beslutDublet(opgave, DUBLETBESLUTNING.BEHOLD_TIL_KONTROL);
    if (opgave.dublet.type === DUBLETTYPE.MULIG) return beslutDublet(opgave, DUBLETBESLUTNING.BEHOLD_TIL_KONTROL);
    if (indeks % 3 === 0 && opgave.status === INTAKESTATUS.MODTAGET) return godkendOpgave(opgave, { tidspunktMs: DEMO_IMPORTTID_MS + 60000 });
    return opgave;
  });
  return {
    opgaver: medDubletter, eksisterende, planlaegningspulje: [], materialer: JSON.parse(JSON.stringify(DEMO_MATERIALER)),
    skabeloner: JSON.parse(JSON.stringify(DEMO_UDFOERELSESSKABELONER)),
    csvEksempel: "Ekstern reference;Opgavenavn;Kunde;Adresse;Postnummer;By;Land;Dato;Tidsform;Tidsvindue fra;Tidsvindue til;Varighed;Stoptype\r\nDEMO-NY-001;Fiktiv museumslevering;Demo-modtager 10;Testvej 410;0000;Demoby;DK;18-05-2032;Tidsvindue;10:00;11:30;30 min;LEVERING\r\nDEMO-NY-002;Fiktiv afhentning;Demo-modtager 11;Prøveallé 12;0000;Demoby;DK;2032-05-18;Deadline;;;00:45;AFHENTNING",
    indsatEksempel: "External reference\tTask name\tCustomer\tAddress\tPostal code\tCity\tCountry\tDate\tTime type\tDuration\tStop type\nDEMO-PASTE-001\tFiktiv indsat opgave\tDemo-recipient\tTestvej 511\t0000\tDemoby\tDK\t2032-05-18\tFrit tidspunkt\t1:15\tSERVICE",
  };
}

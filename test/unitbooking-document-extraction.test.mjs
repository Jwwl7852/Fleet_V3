import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ExcelJS from "../functions/node_modules/exceljs/excel.js";
import { udtraekUnitDokument } from "../functions/unitbooking-document-extraction.js";

describe("UNIT lokal dokumentudtrækning", () => {
  it("aflæser .eml-mailtekst og en CSV-vedhæftning", async () => {
    const eml = [
      "From: Ida Holm <ida@example.invalid>", "Subject: Booking MN-42", "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="UNITBOUNDARY"', "", "--UNITBOUNDARY",
      'Content-Type: text/plain; charset="utf-8"', "", "Kunde: Museum Nord\r\nFra: 21-09-2026\r\nTil: 28-09-2026",
      "--UNITBOUNDARY", 'Content-Type: text/csv; name="objekter.csv"',
      'Content-Disposition: attachment; filename="objekter.csv"', "Content-Transfer-Encoding: base64", "",
      Buffer.from("Objekt;Længde;Bredde;Højde;Enhed\nRelief;100,5;60;80;cm").toString("base64"),
      "--UNITBOUNDARY--", "",
    ].join("\r\n");
    const r = await udtraekUnitDokument(Buffer.from(eml), { filtype: "eml", filnavn: "booking.eml" });
    assert.match(r.tekst, /Museum Nord/);
    assert.equal(r.vedhaeftninger[0].status, "udtrukket");
    assert.match(r.tabeller[0].tekst, /100,5/);
  });

  it("aflæser .xlsx med ark- og cellehenvisninger", async () => {
    const workbook = new ExcelJS.Workbook();
    const ark = workbook.addWorksheet("Booking");
    ark.addRow(["Kunde", "Objekt", "Længde", "Bredde", "Højde", "Enhed"]);
    ark.addRow(["Museum Nord", "Relief", "100,5", "60", "80", "cm"]);
    const bytes = await workbook.xlsx.writeBuffer();
    const r = await udtraekUnitDokument(Buffer.from(bytes), { filtype: "xlsx", filnavn: "booking.xlsx" });
    assert.equal(r.tabeller.length, 1);
    assert.match(r.tabeller[0].celleReferencer["2:3"], /celle C2/);
    assert.match(r.tekst, /Museum Nord/);
  });

  it("aflæser CSV og bevarer en tabelreference", async () => {
    const r = await udtraekUnitDokument(Buffer.from("Objekt;Længde;Bredde;Højde;Enhed\nRelief;100,5;60;80;cm"), { filtype: "csv", filnavn: "booking.csv" });
    assert.equal(r.tabeller.length, 1);
    assert.match(r.tekst, /Relief/);
  });

  it("aflæser en rigtig .msg-container og dens vedhæftning", async () => {
    const bytes = await readFile(new URL("./fixtures/unitbooking-msgreader-test2.msg", import.meta.url));
    const r = await udtraekUnitDokument(bytes, { filtype: "msg", filnavn: "mail.msg" });
    assert.ok(r.tekst.length > 0);
    assert.equal(r.vedhaeftninger[0]?.navn, "A.txt");
    assert.equal(r.vedhaeftninger[0]?.status, "udtrukket");
  });

  it("aflæser tekst og sidehenvisning fra en tekstbaseret PDF", async () => {
    const bytes = await readFile(new URL("../output/pdf/PROCURE-bestilling-senest-dato.pdf", import.meta.url));
    const r = await udtraekUnitDokument(bytes, { filtype: "pdf", filnavn: "tekst.pdf" });
    assert.ok(r.tekst.length > 20);
    assert.ok(r.linjeReferencer.some((x) => /side 1/.test(x)));
  });
});

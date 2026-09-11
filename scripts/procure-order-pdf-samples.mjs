/* Danner tre lokale, syntetiske leverandørordrer med produktionsgeneratoren.
 * Scriptet har ingen Firebase- eller mailforbindelse. */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createOrderPdfBytes, ordrePdfData, validerOrdrePdfGrundlag } from "../src/fleet/procure-v2/procure-pdf.js";

const outputDirectory = resolve("output/pdf");
await mkdir(outputDirectory, { recursive: true });

const tenant = {
  navn: "Fjordholm Drift A/S", adresse: "Havnevej 14", postnr: "8000", by: "Aarhus C",
  fakturaModtagelse: "faktura@fjordholm.example", procureAppUrl: "https://procure-preview.example.invalid",
};
const supplier = {
  navn: "Nordisk Materialehandel A/S", adresse: "Industrivej 12", postnr: "8200", by: "Aarhus N", kundenummer: "FH-1042",
};
const baseOrder = {
  id: "pdf-order-deadline", nummer: "BST-2026-00041", status: "godkendt", revision: 2, godkendtRevision: 2,
  oprettetMs: Date.parse("2026-09-11T09:00:00Z"), bestillerNavn: "Mette Jensen", bestillerEmail: "indkoeb@fjordholm.example",
  leveringssted: "Hovedlager · rampe 2", leveringsadresse: "Lagervej 8", leveringspostnr: "8000", leveringsby: "Aarhus C",
  oensketDato: "2026-09-30", hurtigstMuligt: false,
  linjer: {
    tape: { varenummer: "EMB-1001", vare: "Pakketape, klar", antal: 10, enhed: "rulle", grundenhed: "rulle", antalPrBestillingsenhed: 1, prisPrEnhedOere: 2400 },
    gloves: { varenummer: "SIK-1212", vare: "Arbejdshandsker med nitrilbelægning", antal: 6, enhed: "kasse", grundenhed: "par", antalPrBestillingsenhed: 12, prisPrEnhedOere: 18900 },
  },
};

const manyLines = Object.fromEntries(Array.from({ length: 42 }, (_, index) => {
  const number = String(index + 1).padStart(3, "0");
  return [`line-${number}`, {
    varenummer: `MAT-${number}`,
    vare: index % 4 === 0
      ? `Miljømærket rengøringsmiddel med ekstra lang dansk beskrivelse til lager, værksted og udendørs vedligeholdelse - variant ${number}`
      : `Forbrugsmateriale med størrelse og kvalitetsangivelse ${number}`,
    antal: index + 1, enhed: index % 3 === 0 ? "kasse" : index % 3 === 1 ? "rulle" : "stk.",
    grundenhed: "stk.", antalPrBestillingsenhed: index % 3 === 0 ? 12 : 1,
    prisPrEnhedOere: 10000 + index * 137,
  }];
}));

const samples = [
  {
    file: "PROCURE-bestilling-hurtigst-muligt.pdf",
    order: { ...baseOrder, id: "pdf-order-asap", nummer: "BST-2026-00040", hurtigstMuligt: true, oensketDato: "2026-12-31" },
  },
  { file: "PROCURE-bestilling-senest-dato.pdf", order: baseOrder },
  {
    file: "PROCURE-bestilling-flere-sider.pdf",
    order: { ...baseOrder, id: "pdf-order-multipage", nummer: "BST-2026-00042", linjer: manyLines },
  },
];

const results = [];
for (const sample of samples) {
  const pdfTenant = tenant;
  const validation = validerOrdrePdfGrundlag(sample.order, supplier, pdfTenant);
  if (!validation.ok) throw new Error(`${sample.file}: ${validation.missing.join(", ")}`);
  const data = ordrePdfData(sample.order, supplier, pdfTenant);
  if (JSON.stringify(data).match(/pris|price|total|moms|vat/i)) throw new Error(`${sample.file}: leverandørdata indeholder et prisfelt.`);
  const bytes = createOrderPdfBytes(sample.order, supplier, pdfTenant);
  const path = resolve(outputDirectory, sample.file);
  await writeFile(path, bytes);
  results.push({ file: path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), receiptUrl: data.receiptUrl, delivery: data.delivery.request, lines: data.lines.length, vendorReceiptQr: false });
}

await writeFile(resolve(outputDirectory, "PROCURE-bestilling-manifest.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), samples: results }, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));

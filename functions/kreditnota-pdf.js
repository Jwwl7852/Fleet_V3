import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const kr = (oere) => new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" }).format((Number(oere) || 0) / 100);
const tekst = (v) => String(v ?? "").replace(/[\r\n]+/g, " ").trim();

export async function genererKreditnotaPdf(snapshot) {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const fed = await pdf.embedFont(StandardFonts.HelveticaBold);
  const side = pdf.addPage([595.28, 841.89]);
  let y = 784;
  const skriv = (value, { size = 10, font = normal, x = 52, color = rgb(0.12, 0.16, 0.23) } = {}) => {
    side.drawText(tekst(value), { x, y, size, font, color }); y -= size + 8;
  };
  skriv("VEYRO SYSTEMS", { size: 11, font: fed, color: rgb(0.10, 0.42, 0.46) });
  skriv("Kreditnotagrundlag", { size: 24, font: fed });
  skriv(`${snapshot.modtager?.navn || snapshot.originalFaktura?.kundeId} · ${snapshot.originalFaktura?.periode}`, { size: 12 });
  y -= 8;
  skriv(`Kredit-id: ${snapshot.kreditId}`);
  skriv(`Original: ${snapshot.originalFaktura?.forretningsnoegle}`);
  skriv(`Årsag: ${snapshot.aarsag}`);
  y -= 14;
  side.drawText("Linje", { x: 52, y, size: 9, font: fed });
  side.drawText("Antal", { x: 350, y, size: 9, font: fed });
  side.drawText("Beløb ekskl. moms", { x: 420, y, size: 9, font: fed });
  y -= 18;
  for (const linje of snapshot.linjer || []) {
    if (y < 120) break;
    side.drawText(tekst(linje.navn).slice(0, 48), { x: 52, y, size: 9, font: normal });
    side.drawText((linje.antal / 1000).toLocaleString("da-DK"), { x: 350, y, size: 9, font: normal });
    side.drawText(kr(linje.beloebOere), { x: 420, y, size: 9, font: normal });
    y -= 17;
  }
  y -= 12;
  side.drawLine({ start: { x: 350, y }, end: { x: 543, y }, thickness: 0.7, color: rgb(0.75, 0.78, 0.82) });
  y -= 18;
  side.drawText(`Ekskl. moms: ${kr(snapshot.beloebOere)}`, { x: 350, y, size: 10, font: normal }); y -= 17;
  side.drawText(`Moms: ${kr(snapshot.momsOere)}`, { x: 350, y, size: 10, font: normal }); y -= 19;
  side.drawText(`Kredit i alt: ${kr(snapshot.ialtOere)}`, { x: 350, y, size: 12, font: fed });
  side.drawText("Internt, versionsbundet kreditnotagrundlag. Endeligt nummer og status kommer fra Dinero.", {
    x: 52, y: 44, size: 8, font: normal, color: rgb(0.38, 0.42, 0.48),
  });
  return pdf.save();
}


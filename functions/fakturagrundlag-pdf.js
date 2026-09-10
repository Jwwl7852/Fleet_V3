import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const kr = (oere) => new Intl.NumberFormat("da-DK", {
  style: "currency", currency: "DKK", minimumFractionDigits: 2,
}).format((Number(oere) || 0) / 100);

const tekst = (vaerdi) => String(vaerdi ?? "").replace(/[\r\n]+/g, " ").trim();
const linjeBeloeb = (linje) => Math.round(((linje?.antal || 0) * (linje?.satsOere || 0)) / 1000);
const linjeMoms = (linje) => Number.isFinite(linje?.momssats)
  ? Math.round((linjeBeloeb(linje) * linje.momssats) / 100) : null;

export function fakturagrundlagCsv(snapshot) {
  const felter = ["Periode", "Kunde-id", "Linje", "Enhed", "Antal", "Beløb ekskl. moms", "Moms", "Beløb inkl. moms"];
  const quote = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const raekker = (snapshot.linjer || []).map((linje) => [
    snapshot.periode, snapshot.kundeId, linje.navn || linje.modulId || "Linje",
    linje.enhed || "", linje.antal ?? "", linjeBeloeb(linje) / 100,
    linjeMoms(linje) == null ? "" : linjeMoms(linje) / 100,
    linjeMoms(linje) == null ? "" : (linjeBeloeb(linje) + linjeMoms(linje)) / 100,
  ]);
  return `\ufeff${[felter, ...raekker].map((r) => r.map(quote).join(";")).join("\r\n")}\r\n`;
}

export async function genererFakturagrundlagPdf(snapshot) {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const fed = await pdf.embedFont(StandardFonts.HelveticaBold);
  const side = pdf.addPage([595.28, 841.89]);
  const { height } = side.getSize();
  let y = height - 58;
  const skriv = (value, { size = 10, font = normal, x = 52, color = rgb(0.12, 0.16, 0.23) } = {}) => {
    side.drawText(tekst(value), { x, y, size, font, color });
    y -= size + 8;
  };

  skriv("VEYRO SYSTEMS", { size: 11, font: fed, color: rgb(0.10, 0.42, 0.46) });
  skriv("Fakturagrundlag", { size: 24, font: fed });
  skriv(`${snapshot.modtager?.navn || snapshot.kundeId} · ${snapshot.periode}`, { size: 12 });
  y -= 10;
  skriv(`Grundlagsversion: ${snapshot.version}`);
  skriv(`Forretningsnøgle: ${snapshot.forretningsnoegle}`);
  skriv(`Kunde-id: ${snapshot.kundeId}`);
  skriv(`CVR: ${snapshot.modtager?.cvr || "Ikke angivet"}`);
  skriv(`Afsendelseskanal: ${snapshot.modtager?.kanal || "Ikke angivet"}`);
  y -= 16;

  side.drawText("Linje", { x: 52, y, size: 9, font: fed });
  side.drawText("Beløb ekskl. moms", { x: 410, y, size: 9, font: fed });
  y -= 18;
  for (const linje of snapshot.linjer || []) {
    if (y < 120) break;
    const navn = tekst(linje.navn || linje.modulId || "Linje").slice(0, 55);
    side.drawText(navn, { x: 52, y, size: 9, font: normal });
    side.drawText(kr(linjeBeloeb(linje)), { x: 410, y, size: 9, font: normal });
    y -= 17;
  }
  y -= 14;
  side.drawLine({ start: { x: 350, y }, end: { x: 543, y }, thickness: 0.7, color: rgb(0.75, 0.78, 0.82) });
  y -= 18;
  side.drawText(`Ekskl. moms: ${kr(snapshot.beloebOere)}`, { x: 350, y, size: 10, font: normal });
  y -= 17;
  side.drawText(`Moms: ${snapshot.momsOere == null ? "Mangler" : kr(snapshot.momsOere)}`, { x: 350, y, size: 10, font: normal });
  y -= 19;
  side.drawText(`I alt: ${snapshot.ialtOere == null ? "Mangler" : kr(snapshot.ialtOere)}`, { x: 350, y, size: 12, font: fed });

  side.drawText("Internt, versionsbundet fakturagrundlag — ikke en udstedt faktura.", {
    x: 52, y: 44, size: 8, font: normal, color: rgb(0.38, 0.42, 0.48),
  });
  return pdf.save();
}

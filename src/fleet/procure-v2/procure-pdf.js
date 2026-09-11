/* Deterministisk ordre-PDF. Filen kopieres til functions/delt, så browserens
   fallback og mailbackendens arkiv bruger præcis samme bytegenerator. */

const oere = (value) => `${(Number(value || 0) / 100).toFixed(2).replace(".", ",")} kr.`;
const ascii = (value) => String(value ?? "")
  .replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
  .replace(/[æÆ]/g, (m) => m === "æ" ? "ae" : "AE")
  .replace(/[øØ]/g, (m) => m === "ø" ? "oe" : "OE")
  .replace(/[åÅ]/g, (m) => m === "å" ? "aa" : "AA")
  .replace(/[^\x20-\x7e]/g, "?");

export function ordreLinjer(ordre = {}) {
  const rows = Array.isArray(ordre.lines)
    ? ordre.lines.map((line, index) => ({
      noegle: line.id || line.orderLineId || String(index).padStart(8, "0"),
      navn: line.name, antal: Number(line.quantity), enhed: line.unit,
      prisOere: Number(line.unitPriceOere),
    }))
    : Object.entries(ordre.linjer || {}).map(([id, line]) => ({
      noegle: id,
      navn: line.vare, antal: Number(line.antal), enhed: line.enhed,
      prisOere: Number(line.prisPrEnhedOere),
    }));
  /* RTDB returnerer nøgletabeller i nøgleorden, mens en klientkladde kan
     bevare indsættelsesorden. PDF-bytes må ikke afhænge af den forskel. */
  return rows.sort((a, b) => a.noegle.localeCompare(b.noegle)).map(({ noegle: _noegle, ...line }) => line);
}

export function ordreRevision(ordre = {}) {
  return Number.isInteger(ordre.revision) && ordre.revision > 0 ? ordre.revision : 1;
}

export function ordrePdfStoragePath(tenantId, ordreId, revision) {
  if (!tenantId || !ordreId || !Number.isInteger(revision) || revision < 1) {
    throw new Error("ordrePdfStoragePath: tenant, ordre og revision skal være gyldige.");
  }
  return `tenants/${tenantId}/indkoebsordrer/${ordreId}/revisioner/${revision}/ordre.pdf`;
}

export function createOrderPdfBytes(ordre = {}, leverandoer = {}, tenant = {}) {
  const nummer = ordre.poNumber || ordre.nummer || "ORDRE UDEN NUMMER";
  const revision = ordreRevision(ordre);
  const linjer = ordreLinjer(ordre);
  const total = linjer.reduce((sum, line) => sum + line.antal * line.prisOere, 0);
  const tekst = [
    "VEYRO SYSTEMS - ORDRE",
    `${nummer} - revision ${revision}`,
    `Kunde: ${tenant.navn || tenant.name || "Ikke angivet"}`,
    `Leverandoer: ${leverandoer.navn || leverandoer.name || "Ukendt"}`,
    `Leveringssted: ${ordre.leveringssted || ordre.deliveryLocation || "Ikke angivet"}`,
    `Oensket levering: ${ordre.oensketDato || ordre.wantedDate || "Ikke angivet"}`,
    "",
    ...linjer.map((line) => `${line.antal} ${line.enhed || "stk."}  ${line.navn}  ${oere(line.prisOere)}  ${oere(line.antal * line.prisOere)}`),
    "",
    `Total ekskl. moms: ${oere(total)}`,
    `Kontakt: ${ordre.kontakt || ordre.contact || ordre.bestillerId || ordre.oprettetAf || "Ikke angivet"}`,
    `Angiv ${nummer} paa fakturaen.`,
    `Faktura: ${tenant.fakturaModtagelse || tenant.fakturamodtagelse || "Kundens konfigurerede fakturamodtagelse"}`,
  ];
  let y = 790;
  const commands = ["BT", "/F1 16 Tf", `50 ${y} Td`];
  tekst.forEach((line, index) => {
    if (index === 0) commands.push(`(${ascii(line)}) Tj`, "/F1 11 Tf");
    else commands.push(`0 -24 Td (${ascii(line)}) Tj`);
  });
  commands.push("ET");
  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

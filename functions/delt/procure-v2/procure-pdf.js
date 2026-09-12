/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/procure-v2/procure-pdf.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/* Deterministisk leverandørordre-PDF. Filen kopieres til functions/delt, så
   preview, mailvedhæftning og arkiv bruger præcis samme bytegenerator. */

export const ORDRE_PDF_SKABELON_VERSION = 5;

const PAGE = { width: 595, height: 842, margin: 32, footerTop: 805 };
const COLOR = {
  navy: [0.024, 0.102, 0.165],       // --veyro-deep-navy #061a2a
  teal: [0.031, 0.498, 0.561],       // --veyro-teal #087f8f
  light: [0.910, 0.969, 0.973],      // --veyro-teal-light #e8f7f8
  border: [0.863, 0.890, 0.910],     // --veyro-border #dce3e8
  secondary: [0.357, 0.420, 0.482],  // --veyro-muted-accessible #5b6b7b
  white: [1, 1, 1],
};

const UNIT_FORMS = Object.freeze({
  "stk": ["stk.", "stk."], "stk.": ["stk.", "stk."], styk: ["stk.", "stk."],
  rulle: ["rulle", "ruller"], ruller: ["rulle", "ruller"],
  kasse: ["kasse", "kasser"], kasser: ["kasse", "kasser"],
  aeske: ["æske", "æsker"], aesker: ["æske", "æsker"],
  pakke: ["pakke", "pakker"], pakker: ["pakke", "pakker"],
  dunk: ["dunk", "dunke"], dunke: ["dunk", "dunke"],
  pose: ["pose", "poser"], poser: ["pose", "poser"],
  flaske: ["flaske", "flasker"], flasker: ["flaske", "flasker"],
  palle: ["palle", "paller"], paller: ["palle", "paller"],
  saet: ["sæt", "sæt"], par: ["par", "par"], liter: ["liter", "liter"],
  meter: ["meter", "meter"], kilo: ["kilo", "kilo"],
});

const asText = (value) => String(value ?? "").trim();
const pick = (...values) => values.map(asText).find(Boolean) || "";

function configuredLines(...values) {
  const lines = values.flatMap((value) => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return Object.values(value);
    return asText(value).split(/\r?\n/);
  }).map(asText).filter(Boolean);
  return [...new Set(lines)];
}

function unitForms(unit) {
  const raw = asText(unit);
  const key = raw.toLocaleLowerCase("da-DK").replaceAll("æ", "ae").replaceAll("ø", "oe").replaceAll("å", "aa");
  return UNIT_FORMS[key] || [raw, raw];
}

function quantity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return asText(value);
  return number.toLocaleString("da-DK", { maximumFractionDigits: 3 });
}

export function ordreEnhed(line = {}) {
  const count = Number(line.antal);
  const [singular, plural] = unitForms(line.enhed);
  const label = Math.abs(count) === 1 ? singular : plural;
  const packageCount = Number(line.antalPrBestillingsenhed || line.unitsPerOrder || 1);
  if (!(packageCount > 1)) return label;
  const [baseSingular, basePlural] = unitForms(line.grundenhed || line.baseUnit || "stk.");
  const base = Math.abs(packageCount) === 1 ? baseSingular : basePlural;
  return `${label} á ${quantity(packageCount)} ${base}`;
}

export function ordreLinjer(ordre = {}) {
  const rows = Array.isArray(ordre.lines)
    ? ordre.lines.map((line, index) => ({
      noegle: line.id || line.orderLineId || String(index).padStart(8, "0"),
      varenummer: line.sku || line.itemNumber || "", navn: line.name,
      antal: Number(line.quantity), enhed: line.unit,
      grundenhed: line.baseUnit, antalPrBestillingsenhed: Number(line.unitsPerOrder || 1),
    }))
    : Object.entries(ordre.linjer || {}).map(([id, line]) => ({
      noegle: id, varenummer: line.varenummer || line.sku || "", navn: line.vare,
      antal: Number(line.antal), enhed: line.enhed,
      grundenhed: line.grundenhed, antalPrBestillingsenhed: Number(line.antalPrBestillingsenhed || 1),
    }));
  return rows.sort((a, b) => a.noegle.localeCompare(b.noegle))
    .map(({ noegle: _noegle, ...line }) => ({ ...line, enhedsvisning: ordreEnhed(line) }));
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

export function ordreModtagelsesUrl(ordre = {}, tenant = {}) {
  const raw = tenant.procureAppUrl || tenant.publicAppUrl || tenant.appUrl;
  if (!raw) return null;
  try {
    const base = new URL(raw);
    if (base.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(base.hostname)) return null;
    const reference = ordre.modtagelsesreference || ordre.id || ordre.nummer || ordre.poNumber;
    if (!reference) return null;
    return new URL(`/indkoeb/mobil/modtag/${encodeURIComponent(reference)}`, base).toString();
  } catch { return null; }
}

function addressLines(entity = {}) {
  const address = entity.adresse || entity.address || entity.adresselinje || entity.street;
  if (address && typeof address === "object") {
    return [pick(address.adresselinje, address.gade, address.street),
      [pick(address.postnr, address.postalCode), pick(address.by, address.city)].filter(Boolean).join(" ")].filter(Boolean);
  }
  return [asText(address), [pick(entity.postnr, entity.postalCode), pick(entity.by, entity.city)].filter(Boolean).join(" ")].filter(Boolean);
}

function formatDate(value) {
  if (!value) return "";
  const date = typeof value === "number" ? new Date(value) : new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return asText(value);
  return new Intl.DateTimeFormat("da-DK", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(date);
}

export function ordrePdfData(ordre = {}, leverandoer = {}, tenant = {}) {
  const lines = ordreLinjer(ordre);
  const asap = Boolean(ordre.hurtigstMuligt || ordre.asSoonAsPossible);
  return {
    number: pick(ordre.nummer, ordre.poNumber),
    orderDate: formatDate(ordre.bestillingsdato || ordre.orderDate || ordre.oprettetMs || ordre.createdAt),
    customerNumber: pick(leverandoer.kundenummer, leverandoer.customerNumber),
    buyer: {
      name: pick(tenant.navn, tenant.name), address: addressLines(tenant),
      contactName: pick(ordre.bestillerNavn, ordre.contactName, ordre.kontaktNavn, ordre.contact),
      contactEmail: pick(ordre.bestillerEmail, ordre.contactEmail),
    },
    supplier: { name: pick(leverandoer.navn, leverandoer.name), address: addressLines(leverandoer) },
    delivery: {
      name: pick(ordre.leveringssted, ordre.deliveryLocation),
      address: addressLines({ adresse: ordre.leveringsadresse || ordre.deliveryAddress, postnr: ordre.leveringspostnr || ordre.deliveryPostalCode, by: ordre.leveringsby || ordre.deliveryCity }),
      request: asap ? "Hurtigst muligt" : `Senest ${formatDate(ordre.oensketDato || ordre.wantedDate)}`,
      asap, date: asap ? "" : formatDate(ordre.oensketDato || ordre.wantedDate),
    },
    invoiceEmail: pick(tenant.fakturaModtagelse, tenant.fakturamodtagelse, tenant.fakturaEmail, tenant.invoiceEmail),
    invoiceInstructions: configuredLines(
      ordre.faktureringsInstruktioner, ordre.fakturaInstruktioner, ordre.invoiceInstructions,
      tenant.faktureringsInstruktioner, tenant.fakturaInstruktioner, tenant.invoiceInstructions,
    ),
    lines, receiptUrl: ordreModtagelsesUrl(ordre, tenant), qr: tenant.procureReceiptQr || null,
  };
}

export function validerOrdrePdfGrundlag(ordre = {}, leverandoer = {}, tenant = {}) {
  const data = ordrePdfData(ordre, leverandoer, tenant);
  const missing = [];
  if (!data.number) missing.push("bestillingsnummer");
  if (!data.orderDate) missing.push("bestillingsdato");
  if (!data.buyer.name) missing.push("bestillerens firmanavn");
  if (!data.buyer.address.length) missing.push("bestillerens adresse");
  if (!data.buyer.contactName) missing.push("bestillerens kontaktnavn");
  if (!data.buyer.contactEmail || !data.buyer.contactEmail.includes("@")) missing.push("bestillerens kontaktmail");
  if (!data.supplier.name) missing.push("leverandørens navn");
  if (!data.supplier.address.length) missing.push("leverandørens adresse");
  if (!data.delivery.name) missing.push("leveringssted");
  if (!data.delivery.address.length) missing.push("leveringsstedets adresse");
  if (!data.delivery.asap && !data.delivery.date) missing.push("ønsket leveringsdato");
  if (!data.invoiceEmail || !data.invoiceEmail.includes("@")) missing.push("kundens fakturamail");
  if (!data.lines.length) missing.push("ordrelinjer");
  data.lines.forEach((line, index) => {
    if (!line.navn) missing.push(`beskrivelse på varelinje ${index + 1}`);
    if (!(line.antal > 0)) missing.push(`bestilt antal på varelinje ${index + 1}`);
    if (!line.enhed) missing.push(`bestillingsenhed på varelinje ${index + 1}`);
  });
  return { ok: missing.length === 0, missing, data };
}

const WIN_ANSI = new Map([
  ["€", 128], ["‚", 130], ["ƒ", 131], ["„", 132], ["…", 133], ["†", 134], ["‡", 135],
  ["ˆ", 136], ["‰", 137], ["Š", 138], ["‹", 139], ["Œ", 140], ["Ž", 142], ["‘", 145],
  ["’", 146], ["“", 147], ["”", 148], ["•", 149], ["–", 150], ["—", 151], ["˜", 152],
  ["™", 153], ["š", 154], ["›", 155], ["œ", 156], ["ž", 158], ["Ÿ", 159],
]);

function hexText(value) {
  let hex = "";
  for (const char of String(value ?? "")) {
    const code = WIN_ANSI.get(char) ?? char.codePointAt(0);
    hex += (code <= 255 ? code : 63).toString(16).padStart(2, "0");
  }
  return `<${hex}>`;
}

function textWidth(value, size, bold = false) {
  let units = 0;
  for (const char of String(value)) {
    if (" ilI.,:;!'|".includes(char)) units += 0.27;
    else if ("mwMW@%&ØÆ".includes(char)) units += 0.86;
    else if (/[A-Z0-9]/.test(char)) units += 0.62;
    else units += 0.51;
  }
  return units * size * (bold ? 1.035 : 1);
}

function wrap(value, maxWidth, size, bold = false) {
  const words = asText(value).split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = []; let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && textWidth(candidate, size, bold) > maxWidth) { lines.push(line); line = word; }
    else line = candidate;
    while (textWidth(line, size, bold) > maxWidth && line.length > 1) {
      let cut = line.length - 1;
      while (cut > 1 && textWidth(`${line.slice(0, cut)}-`, size, bold) > maxWidth) cut -= 1;
      lines.push(`${line.slice(0, cut)}-`); line = line.slice(cut);
    }
  }
  if (line) lines.push(line);
  return lines;
}

const rgb = (color, stroke = false) => `${color.map((part) => part.toFixed(3)).join(" ")} ${stroke ? "RG" : "rg"}`;
const yPdf = (top, height = 0) => PAGE.height - top - height;

function buildDocument(data) {
  const pages = [];
  const makePage = () => { const commands = []; pages.push(commands); return commands; };
  let page = makePage();
  const rect = (x, top, width, height, { fill, stroke = COLOR.border, line = 0.7 } = {}) => {
    if (fill) page.push(rgb(fill), `${x} ${yPdf(top, height)} ${width} ${height} re f`);
    if (stroke) page.push(rgb(stroke, true), `${line} w`, `${x} ${yPdf(top, height)} ${width} ${height} re S`);
  };
  const line = (x1, top1, x2, top2, color = COLOR.border, width = 0.7) => page.push(rgb(color, true), `${width} w`, `${x1} ${yPdf(top1)} m ${x2} ${yPdf(top2)} l S`);
  const text = (value, x, top, { size = 10, bold = false, color = COLOR.navy, align, width } = {}) => {
    const actualWidth = textWidth(value, size, bold);
    const left = align === "right" && width ? x + width - actualWidth : align === "center" && width ? x + (width - actualWidth) / 2 : x;
    page.push("BT", rgb(color), `/${bold ? "F2" : "F1"} ${size} Tf`, `1 0 0 1 ${left.toFixed(2)} ${yPdf(top, size).toFixed(2)} Tm`, `${hexText(value)} Tj`, "ET");
  };
  const paragraph = (value, x, top, width, { size = 10, bold = false, color = COLOR.navy, leading = size * 1.35, maxLines } = {}) => {
    const lines = wrap(value, width, size, bold).slice(0, maxLines || Infinity);
    lines.forEach((row, index) => text(row, x, top + index * leading, { size, bold, color }));
    return lines.length * leading;
  };
  const sectionHeader = (title, x, top, width) => {
    rect(x, top, width, 26, { fill: COLOR.light, stroke: COLOR.light });
    text(title, x + 14, top + 6, { size: 12, bold: true, color: COLOR.teal });
  };
  const block = (title, x, top, width, height, rows = []) => {
    rect(x, top, width, height, { fill: COLOR.white, stroke: COLOR.border }); sectionHeader(title, x, top, width);
    let cursor = top + 38;
    rows.forEach((row, index) => { cursor += paragraph(row, x + 14, cursor, width - 28, { size: index === 0 ? 10.8 : 9.5, bold: index === 0, leading: 15 }); });
  };

  text("BESTILLING", PAGE.margin, 48, { size: 30, bold: true });
  text("Bestillingsnr.", 370, 46, { size: 10, color: COLOR.secondary, align: "right", width: 193 });
  text(data.number, 320, 63, { size: 17, bold: true, align: "right", width: 243 });
  line(PAGE.margin, 105, PAGE.width - PAGE.margin, 105, COLOR.teal, 0.8);
  text("Bestillingsdato", PAGE.margin, 119, { size: 9.5, color: COLOR.secondary });
  text(data.orderDate, PAGE.margin, 135, { size: 13 });
  line(297, 118, 297, 159, COLOR.border, 0.8);
  if (data.customerNumber) {
    text("Kundenr. hos leverandør", 318, 119, { size: 9.5, color: COLOR.secondary });
    text(data.customerNumber, 318, 135, { size: 13 });
  }

  const invoiceTop = 176; const fullWidth = PAGE.width - PAGE.margin * 2;
  const instructionLines = data.invoiceInstructions.flatMap((instruction) => wrap(instruction, fullWidth - 28, 9.2));
  const invoiceHeight = 96 + instructionLines.length * 12;
  rect(PAGE.margin, invoiceTop, fullWidth, invoiceHeight, { fill: COLOR.white, stroke: COLOR.border });
  sectionHeader("FAKTURERING", PAGE.margin, invoiceTop, fullWidth);
  text("Send faktura til:", PAGE.margin + 14, invoiceTop + 38, { size: 9.5 });
  paragraph(data.invoiceEmail, PAGE.margin + 14, invoiceTop + 53, fullWidth - 28, { size: 10.2, bold: true, leading: 13 });
  paragraph(`Angiv vores bestillingsnummer ${data.number} på følgesedlen og fakturaen.`, PAGE.margin + 14, invoiceTop + 70, fullWidth - 28, { size: 9.5, leading: 13 });
  instructionLines.forEach((instruction, index) => text(instruction, PAGE.margin + 14, invoiceTop + 86 + index * 12, { size: 9.2 }));

  const gap = 10; const half = (fullWidth - gap) / 2;
  const partyTop = invoiceTop + invoiceHeight + 14;
  block("BESTILLER", PAGE.margin, partyTop, half, 112, [data.buyer.name, ...data.buyer.address, `Kontakt: ${data.buyer.contactName}`, data.buyer.contactEmail]);
  block("LEVERANDØR", PAGE.margin + half + gap, partyTop, half, 112, [data.supplier.name, ...data.supplier.address]);
  const deliveryTop = partyTop + 126;
  rect(PAGE.margin, deliveryTop, fullWidth, 104, { fill: COLOR.white, stroke: COLOR.border });
  sectionHeader("LEVERING", PAGE.margin, deliveryTop, fullWidth);
  paragraph(data.delivery.name, PAGE.margin + 14, deliveryTop + 40, 235, { size: 10.8, bold: true, leading: 15 });
  data.delivery.address.forEach((row, index) => text(row, PAGE.margin + 14, deliveryTop + 59 + index * 15, { size: 9.5 }));
  line(297, deliveryTop + 36, 297, deliveryTop + 88, COLOR.border, 0.8);
  text("ØNSKET LEVERING", 318, deliveryTop + 35, { size: 10.5, bold: true, color: COLOR.teal });
  text(data.delivery.request, 318, deliveryTop + 52, { size: 15, bold: true });
  text("Mellem 7.00-15.00", 318, deliveryTop + 72, { size: 9.5 });
  text("(lagerets åbningstider)", 318, deliveryTop + 86, { size: 9.5 });

  let tableTop = deliveryTop + 118;
  const columns = [PAGE.margin, 128, 405, 477, PAGE.width - PAGE.margin];
  const drawTableHeader = (continued = false) => {
    if (continued) {
      text("BESTILLING", PAGE.margin, 20, { size: 12, bold: true });
      text(`Bestillingsnr. ${data.number}`, 330, 20, { size: 10, bold: true, align: "right", width: PAGE.width - PAGE.margin - 330 });
    }
    sectionHeader(continued ? "VARER · FORTSAT" : "VARER", PAGE.margin, tableTop, PAGE.width - PAGE.margin * 2);
    const headTop = tableTop + 26;
    rect(PAGE.margin, headTop, PAGE.width - PAGE.margin * 2, 27, { fill: COLOR.light, stroke: COLOR.border });
    ["Varenr.", "Beskrivelse", "Antal", "Enhed"].forEach((label, index) => text(label, columns[index] + (index > 1 ? 0 : 10), headTop + 8, { size: 9, bold: true, align: index > 1 ? "center" : undefined, width: index > 1 ? columns[index + 1] - columns[index] : undefined }));
    columns.slice(1, -1).forEach((x) => line(x, headTop, x, headTop + 27));
    return headTop + 27;
  };
  let cursor;
  if (tableTop + 53 > 760) { page = makePage(); tableTop = 48; cursor = drawTableHeader(true); }
  else cursor = drawTableHeader();
  for (const row of data.lines) {
    // Helvetica-metrikkerne i PDF-læserne er en anelse bredere end den
    // deterministiske estimator ovenfor. En sikker tekstbredde forhindrer,
    // at lange danske beskrivelser løber ind i antal-kolonnen.
    const description = wrap(row.navn, (columns[2] - columns[1] - 20) * 0.86, 9.5);
    const unit = wrap(row.enhedsvisning, columns[4] - columns[3] - 12, 9.2);
    const rowHeight = Math.max(31, Math.max(description.length, unit.length) * 13 + 10);
    if (cursor + rowHeight > 760) { page = makePage(); tableTop = 48; cursor = drawTableHeader(true); }
    rect(PAGE.margin, cursor, PAGE.width - PAGE.margin * 2, rowHeight, { fill: COLOR.white, stroke: COLOR.border });
    columns.slice(1, -1).forEach((x) => line(x, cursor, x, cursor + rowHeight));
    text(row.varenummer, columns[0] + 10, cursor + 10, { size: 9.2 });
    description.forEach((part, index) => text(part, columns[1] + 10, cursor + 9 + index * 13, { size: 9.5 }));
    text(quantity(row.antal), columns[2], cursor + 10, { size: 9.5, align: "center", width: columns[3] - columns[2] });
    unit.forEach((part, index) => text(part, columns[3], cursor + 9 + index * 13, { size: 9.2, align: "center", width: columns[4] - columns[3] }));
    cursor += rowHeight;
  }

  pages.forEach((commands, index) => {
    commands.push(rgb(COLOR.teal, true), "0.7 w", `${PAGE.margin} ${yPdf(PAGE.footerTop)} m ${PAGE.width - PAGE.margin} ${yPdf(PAGE.footerTop)} l S`);
    const current = page; page = commands;
    text("VEYRO SYSTEMS · PROCURE", PAGE.margin, PAGE.footerTop + 13, { size: 7.5, color: COLOR.secondary });
    text(`Side ${index + 1} af ${pages.length}`, 460, PAGE.footerTop + 13, { size: 7.5, color: COLOR.secondary, align: "right", width: 103 }); page = current;
  });
  return pages;
}

function latin1Bytes(value) {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index) & 0xff;
  return bytes;
}

function assemblePdf(pageStreams) {
  const firstPageObject = 5;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageStreams.map((_, index) => `${firstPageObject + index * 2} 0 R`).join(" ")}] /Count ${pageStreams.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  pageStreams.forEach((stream, index) => {
    const contentObject = firstPageObject + index * 2 + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`);
    objects.push(`<< /Length ${latin1Bytes(stream).length} >>\nstream\n${stream}\nendstream`);
  });
  let pdf = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(latin1Bytes(pdf).length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = latin1Bytes(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return latin1Bytes(pdf);
}

export function createOrderPdfBytes(ordre = {}, leverandoer = {}, tenant = {}) {
  return assemblePdf(buildDocument(ordrePdfData(ordre, leverandoer, tenant)).map((commands) => commands.join("\n")));
}

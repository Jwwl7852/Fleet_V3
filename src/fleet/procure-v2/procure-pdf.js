/* Deterministisk leverandørordre-PDF. Filen kopieres til functions/delt, så
   preview, mailvedhæftning og arkiv bruger præcis samme bytegenerator. */
import { INTER_BOLD_BASE64, INTER_REGULAR_BASE64 } from "./procure-pdf-fonts.js";

export const ORDRE_PDF_SKABELON_VERSION = 7;

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

const WIN_ANSI_UNICODE = Object.freeze({
  128: 0x20ac, 130: 0x201a, 131: 0x0192, 132: 0x201e, 133: 0x2026,
  134: 0x2020, 135: 0x2021, 136: 0x02c6, 137: 0x2030, 138: 0x0160,
  139: 0x2039, 140: 0x0152, 142: 0x017d, 145: 0x2018, 146: 0x2019,
  147: 0x201c, 148: 0x201d, 149: 0x2022, 150: 0x2013, 151: 0x2014,
  152: 0x02dc, 153: 0x2122, 154: 0x0161, 155: 0x203a, 156: 0x0153,
  158: 0x017e, 159: 0x0178,
});

const u16 = (bytes, offset) => (bytes[offset] << 8) | bytes[offset + 1];
const s16 = (bytes, offset) => { const value = u16(bytes, offset); return value > 0x7fff ? value - 0x10000 : value; };
const u32 = (bytes, offset) => ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;

function decodeBase64(value) {
  if (globalThis.Buffer) return Uint8Array.from(globalThis.Buffer.from(value, "base64"));
  const binary = globalThis.atob(value); const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function fontTables(bytes) {
  const tables = new Map(); const count = u16(bytes, 4);
  for (let index = 0; index < count; index += 1) {
    const entry = 12 + index * 16;
    const tag = String.fromCharCode(...bytes.slice(entry, entry + 4));
    tables.set(tag, { offset: u32(bytes, entry + 8), length: u32(bytes, entry + 12) });
  }
  return tables;
}

function cmapLookup(bytes, table) {
  const count = u16(bytes, table.offset + 2); let selected = null; let score = -1;
  for (let index = 0; index < count; index += 1) {
    const entry = table.offset + 4 + index * 8;
    const platform = u16(bytes, entry); const encoding = u16(bytes, entry + 2);
    const offset = table.offset + u32(bytes, entry + 4); const format = u16(bytes, offset);
    const candidateScore = format === 4 ? (platform === 3 && encoding === 1 ? 3 : platform === 0 ? 2 : 1) : -1;
    if (candidateScore > score) { selected = offset; score = candidateScore; }
  }
  if (selected == null) throw new Error("Inter-fonten mangler en Unicode cmap format 4.");
  const length = u16(bytes, selected + 2); const segCount = u16(bytes, selected + 6) / 2;
  const endCodes = selected + 14; const startCodes = endCodes + segCount * 2 + 2;
  const deltas = startCodes + segCount * 2; const rangeOffsets = deltas + segCount * 2;
  return (codePoint) => {
    for (let index = 0; index < segCount; index += 1) {
      const end = u16(bytes, endCodes + index * 2);
      if (codePoint > end) continue;
      const start = u16(bytes, startCodes + index * 2);
      if (codePoint < start) return 0;
      const delta = s16(bytes, deltas + index * 2); const range = u16(bytes, rangeOffsets + index * 2);
      if (range === 0) return (codePoint + delta) & 0xffff;
      const address = rangeOffsets + index * 2 + range + (codePoint - start) * 2;
      if (address + 1 >= selected + length) return 0;
      const glyph = u16(bytes, address);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };
}

function winAnsiUnicode(byte) {
  if (byte >= 32 && byte <= 126) return byte;
  if (byte >= 160) return byte;
  return WIN_ANSI_UNICODE[byte] || 0x003f;
}

function parseInterFont(base64, postScriptName, bold) {
  const bytes = decodeBase64(base64); const tables = fontTables(bytes);
  const head = tables.get("head"); const hhea = tables.get("hhea"); const hmtx = tables.get("hmtx");
  const maxp = tables.get("maxp"); const cmap = tables.get("cmap");
  if (![head, hhea, hmtx, maxp, cmap].every(Boolean)) throw new Error(`${postScriptName} mangler nødvendige TrueType-tabeller.`);
  const unitsPerEm = u16(bytes, head.offset + 18); const glyphCount = u16(bytes, maxp.offset + 4);
  const metricCount = u16(bytes, hhea.offset + 34); const advances = new Array(glyphCount);
  let lastAdvance = 0;
  for (let glyph = 0; glyph < glyphCount; glyph += 1) {
    if (glyph < metricCount) lastAdvance = u16(bytes, hmtx.offset + glyph * 4);
    advances[glyph] = lastAdvance;
  }
  const glyphFor = cmapLookup(bytes, cmap); const widths = new Array(256).fill(Math.round((advances[0] || unitsPerEm) * 1000 / unitsPerEm));
  for (let byte = 32; byte <= 255; byte += 1) widths[byte] = Math.round((advances[glyphFor(winAnsiUnicode(byte))] || advances[0] || unitsPerEm) * 1000 / unitsPerEm);
  const scale = (value) => Math.round(value * 1000 / unitsPerEm);
  return {
    bytes, widths, postScriptName, bold,
    bbox: [scale(s16(bytes, head.offset + 36)), scale(s16(bytes, head.offset + 38)), scale(s16(bytes, head.offset + 40)), scale(s16(bytes, head.offset + 42))],
    ascent: scale(s16(bytes, hhea.offset + 4)), descent: scale(s16(bytes, hhea.offset + 6)),
  };
}

const INTER_FONT = Object.freeze({
  regular: parseInterFont(INTER_REGULAR_BASE64, "Inter-Regular", false),
  bold: parseInterFont(INTER_BOLD_BASE64, "Inter-Bold", true),
});

function hexText(value) {
  let hex = "";
  for (const char of String(value ?? "")) {
    const code = WIN_ANSI.get(char) ?? char.codePointAt(0);
    hex += (code <= 255 ? code : 63).toString(16).padStart(2, "0");
  }
  return `<${hex}>`;
}

function textWidth(value, size, bold = false) {
  const font = bold ? INTER_FONT.bold : INTER_FONT.regular;
  let units = 0;
  for (const char of String(value)) {
    const code = WIN_ANSI.get(char) ?? char.codePointAt(0);
    units += font.widths[code <= 255 ? code : 63];
  }
  return units * size / 1000;
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

  const fullWidth = PAGE.width - PAGE.margin * 2;
  const gap = 10; const half = (fullWidth - gap) / 2;
  const partyTop = 176;
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

  const invoiceTop = deliveryTop + 118;
  const instructionLines = data.invoiceInstructions.flatMap((instruction) => wrap(instruction, fullWidth - 28, 9.2));
  const invoiceHeight = 96 + instructionLines.length * 12;
  rect(PAGE.margin, invoiceTop, fullWidth, invoiceHeight, { fill: COLOR.white, stroke: COLOR.border });
  sectionHeader("FAKTURERING", PAGE.margin, invoiceTop, fullWidth);
  text("Send faktura til:", PAGE.margin + 14, invoiceTop + 38, { size: 9.5 });
  paragraph(data.invoiceEmail, PAGE.margin + 14, invoiceTop + 53, fullWidth - 28, { size: 10.2, bold: true, leading: 13 });
  paragraph(`Angiv vores bestillingsnummer ${data.number} på følgesedlen og fakturaen.`, PAGE.margin + 14, invoiceTop + 70, fullWidth - 28, { size: 9.5, leading: 13 });
  instructionLines.forEach((instruction, index) => text(instruction, PAGE.margin + 14, invoiceTop + 86 + index * 12, { size: 9.2 }));

  let tableTop = invoiceTop + invoiceHeight + 14;
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
    const description = wrap(row.navn, columns[2] - columns[1] - 20, 9.5);
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

function concatBytes(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0); const result = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part) => { result.set(part, offset); offset += part.length; });
  return result;
}

function streamObject(bytes, extra = "") {
  return concatBytes([latin1Bytes(`<< /Length ${bytes.length}${extra} >>\nstream\n`), bytes, latin1Bytes("\nendstream")]);
}

function toUnicodeStream(name) {
  const mappings = [];
  for (let byte = 32; byte <= 255; byte += 1) {
    if ((byte >= 127 && byte <= 159) && !WIN_ANSI_UNICODE[byte]) continue;
    mappings.push(`<${byte.toString(16).padStart(2, "0")}> <${winAnsiUnicode(byte).toString(16).padStart(4, "0")}>`);
  }
  const blocks = [];
  for (let index = 0; index < mappings.length; index += 100) {
    const block = mappings.slice(index, index + 100); blocks.push(`${block.length} beginbfchar\n${block.join("\n")}\nendbfchar`);
  }
  return `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /${name}-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n${blocks.join("\n")}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
}

function assemblePdf(pageStreams) {
  const firstPageObject = 11;
  const regular = INTER_FONT.regular; const bold = INTER_FONT.bold;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageStreams.map((_, index) => `${firstPageObject + index * 2} 0 R`).join(" ")}] /Count ${pageStreams.length} >>`,
    `<< /Type /Font /Subtype /TrueType /BaseFont /${regular.postScriptName} /FirstChar 32 /LastChar 255 /Widths [${regular.widths.slice(32).join(" ")}] /FontDescriptor 5 0 R /Encoding /WinAnsiEncoding /ToUnicode 7 0 R >>`,
    `<< /Type /Font /Subtype /TrueType /BaseFont /${bold.postScriptName} /FirstChar 32 /LastChar 255 /Widths [${bold.widths.slice(32).join(" ")}] /FontDescriptor 8 0 R /Encoding /WinAnsiEncoding /ToUnicode 10 0 R >>`,
    `<< /Type /FontDescriptor /FontName /${regular.postScriptName} /Flags 32 /FontBBox [${regular.bbox.join(" ")}] /ItalicAngle 0 /Ascent ${regular.ascent} /Descent ${regular.descent} /CapHeight ${regular.ascent} /StemV 80 /FontFile2 6 0 R >>`,
    streamObject(regular.bytes, ` /Length1 ${regular.bytes.length}`),
    streamObject(latin1Bytes(toUnicodeStream(regular.postScriptName))),
    `<< /Type /FontDescriptor /FontName /${bold.postScriptName} /Flags 32 /FontBBox [${bold.bbox.join(" ")}] /ItalicAngle 0 /Ascent ${bold.ascent} /Descent ${bold.descent} /CapHeight ${bold.ascent} /StemV 120 /FontFile2 9 0 R >>`,
    streamObject(bold.bytes, ` /Length1 ${bold.bytes.length}`),
    streamObject(latin1Bytes(toUnicodeStream(bold.postScriptName))),
  ];
  pageStreams.forEach((stream, index) => {
    const contentObject = firstPageObject + index * 2 + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`);
    objects.push(`<< /Length ${latin1Bytes(stream).length} >>\nstream\n${stream}\nendstream`);
  });
  const parts = [latin1Bytes("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")]; const offsets = [0]; let length = parts[0].length;
  objects.forEach((object, index) => {
    const body = typeof object === "string" ? latin1Bytes(object) : object;
    const wrapped = concatBytes([latin1Bytes(`${index + 1} 0 obj\n`), body, latin1Bytes("\nendobj\n")]);
    offsets.push(length); parts.push(wrapped); length += wrapped.length;
  });
  const xref = length;
  let trailer = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { trailer += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  trailer += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  parts.push(latin1Bytes(trailer));
  return concatBytes(parts);
}

export function createOrderPdfBytes(ordre = {}, leverandoer = {}, tenant = {}) {
  return assemblePdf(buildDocument(ordrePdfData(ordre, leverandoer, tenant)).map((commands) => commands.join("\n")));
}

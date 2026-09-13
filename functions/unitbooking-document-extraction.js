import { simpleParser } from "mailparser";
import msgReaderPackage from "@kenjiuno/msgreader";
import { PDFParse } from "pdf-parse";
import ExcelJS from "exceljs";

const MAKS_TEKST = 200_000;
const MAKS_VEDHAEFTNINGER = 12;
const MAKS_VEDHAEFTNING_BYTES = 8 * 1024 * 1024;
const MAKS_ARK = 12;
const MAKS_RAEKKER = 500;
const MAKS_KOLONNER = 40;

const MsgReader = msgReaderPackage?.default || msgReaderPackage;

const filtypeFraNavn = (navn = "", mimeType = "") => {
  const n = String(navn).toLowerCase();
  const m = String(mimeType).toLowerCase();
  if (n.endsWith(".eml") || m === "message/rfc822") return "eml";
  if (n.endsWith(".msg") || m === "application/vnd.ms-outlook") return "msg";
  if (n.endsWith(".pdf") || m === "application/pdf") return "pdf";
  if (n.endsWith(".xlsx") || m.includes("spreadsheetml")) return "xlsx";
  if (n.endsWith(".csv") || m === "text/csv") return "csv";
  if (n.endsWith(".txt") || m === "text/plain") return "tekst";
  return null;
};

const renTekst = (v) => String(v || "").replace(/\u0000/g, "").trim();

function htmlTilTekst(html) {
  return renTekst(String(html || "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n"));
}

function samler() {
  const linjer = [];
  const linjeReferencer = [];
  const tabeller = [];
  const vedhaeftninger = [];
  const advarsler = [];
  const tilfoej = (tekst, reference) => {
    const nye = renTekst(tekst).split(/\r?\n/).map((x) => x.trimEnd());
    for (const linje of nye) {
      if (!linje.trim() || linjer.join("\n").length >= MAKS_TEKST) continue;
      linjer.push(linje);
      linjeReferencer.push(reference);
    }
  };
  return { linjer, linjeReferencer, tabeller, vedhaeftninger, advarsler, tilfoej };
}

async function udtraekPdf(bytes, reference) {
  const ud = samler();
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const resultat = await parser.getText();
    const sider = Array.isArray(resultat?.pages) ? resultat.pages : [];
    if (sider.length) {
      sider.forEach((side, i) => ud.tilfoej(side?.text || "", `${reference}, side ${i + 1}`));
    } else {
      ud.tilfoej(resultat?.text || "", `${reference}, dokumenttekst`);
    }
  } finally {
    await parser.destroy();
  }
  if (!ud.linjer.join("\n").trim()) {
    ud.advarsler.push("PDF-filen indeholder ingen udtrækkelig tekst og kræver OCR eller manuel indtastning.");
  }
  return ud;
}

function csvFelt(v) {
  const s = String(v ?? "").replace(/\r?\n/g, " ");
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function udtraekXlsx(bytes, reference) {
  const ud = samler();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes));
  workbook.worksheets.slice(0, MAKS_ARK).forEach((ark) => {
    const maxRaekke = Math.min(ark.actualRowCount || ark.rowCount || 0, MAKS_RAEKKER);
    const maxKolonne = Math.min(ark.actualColumnCount || ark.columnCount || 0, MAKS_KOLONNER);
    const raekker = [];
    const celleReferencer = {};
    for (let r = 1; r <= maxRaekke; r += 1) {
      const celler = [];
      let harIndhold = false;
      for (let c = 1; c <= maxKolonne; c += 1) {
        const celle = ark.getCell(r, c);
        const tekst = renTekst(celle.text ?? celle.value ?? "");
        celler.push(tekst);
        if (tekst) {
          harIndhold = true;
          celleReferencer[`${raekker.length + 1}:${c}`] = `${reference}, ark “${ark.name}”, celle ${celle.address}`;
        }
      }
      if (!harIndhold) continue;
      raekker.push(celler);
      const ikkeTomme = celler.map((tekst, i) => ({ tekst, i })).filter((x) => x.tekst);
      if (ikkeTomme.length === 2) {
        ud.tilfoej(`${ikkeTomme[0].tekst}: ${ikkeTomme[1].tekst}`, `${reference}, ark “${ark.name}”, række ${r}`);
      } else {
        ud.tilfoej(ikkeTomme.map((x) => `${ark.getColumn(x.i + 1).letter}=${x.tekst}`).join(" · "), `${reference}, ark “${ark.name}”, række ${r}`);
      }
    }
    if (raekker.length >= 2) {
      ud.tabeller.push({
        tekst: raekker.map((r) => r.map(csvFelt).join(";")).join("\n"),
        reference: `${reference}, ark “${ark.name}”`,
        celleReferencer,
      });
    }
  });
  if (workbook.worksheets.length > MAKS_ARK) ud.advarsler.push(`Kun de første ${MAKS_ARK} ark blev læst.`);
  if (!ud.linjer.length) ud.advarsler.push("Regnearket indeholder ingen læsbare celler.");
  return ud;
}

function flet(maal, del, prefix = null) {
  const linjer = del.linjer || String(del.tekst || "").split(/\r?\n/);
  linjer.forEach((linje, i) => maal.tilfoej(linje, prefix || del.linjeReferencer?.[i]));
  maal.tabeller.push(...(del.tabeller || []));
  maal.vedhaeftninger.push(...(del.vedhaeftninger || []));
  maal.advarsler.push(...(del.advarsler || []));
}

async function udtraekVedhaeftning(bytes, navn, mimeType, reference, dybde) {
  const filtype = filtypeFraNavn(navn, mimeType);
  if (!filtype || !["eml", "msg", "pdf", "xlsx", "csv", "tekst"].includes(filtype)) {
    return { understottet: false, filtype: filtype || "ukendt" };
  }
  const resultat = await udtraekUnitDokument(bytes, { filtype, filnavn: navn, mimeType }, { reference, dybde });
  return { understottet: true, filtype, resultat };
}

async function udtraekEml(bytes, reference, dybde) {
  const ud = samler();
  const mail = await simpleParser(Buffer.from(bytes), { skipHtmlToText: false, skipTextToHtml: true });
  if (mail.subject) ud.tilfoej(`Emne: ${mail.subject}`, `${reference}, emne`);
  if (mail.from?.text) ud.tilfoej(`Fra: ${mail.from.text}`, `${reference}, afsender`);
  ud.tilfoej(mail.text || htmlTilTekst(mail.html), `${reference}, mailtekst`);
  const bilag = (mail.attachments || []).slice(0, MAKS_VEDHAEFTNINGER);
  for (const [i, attachment] of bilag.entries()) {
    const navn = attachment.filename || `vedhæftning-${i + 1}`;
    if (attachment.content.length > MAKS_VEDHAEFTNING_BYTES) {
      ud.vedhaeftninger.push({ navn, status: "for-stor" });
      ud.advarsler.push(`Vedhæftningen “${navn}” er for stor til lokal udtrækning.`);
      continue;
    }
    const del = dybde < 2
      ? await udtraekVedhaeftning(attachment.content, navn, attachment.contentType, `${reference}, vedhæftning “${navn}”`, dybde + 1)
      : { understottet: false, filtype: "indlejret" };
    ud.vedhaeftninger.push({ navn, filtype: del.filtype, status: del.understottet ? "udtrukket" : "ikke-understottet" });
    if (del.understottet) flet(ud, del.resultat);
  }
  if ((mail.attachments || []).length > MAKS_VEDHAEFTNINGER) ud.advarsler.push(`Kun de første ${MAKS_VEDHAEFTNINGER} vedhæftninger blev gennemgået.`);
  return ud;
}

async function udtraekMsg(bytes, reference, dybde) {
  const ud = samler();
  const reader = new MsgReader(new Uint8Array(bytes));
  const mail = reader.getFileData();
  if (mail.error) throw new Error(`MSG-filen kunne ikke læses (${mail.error}).`);
  if (mail.subject) ud.tilfoej(`Emne: ${mail.subject}`, `${reference}, emne`);
  if (mail.senderName || mail.senderEmail) ud.tilfoej(`Fra: ${mail.senderName || mail.senderEmail}`, `${reference}, afsender`);
  ud.tilfoej(mail.body || htmlTilTekst(mail.bodyHtml), `${reference}, mailtekst`);
  const bilag = (mail.attachments || []).slice(0, MAKS_VEDHAEFTNINGER);
  for (const [i, metadata] of bilag.entries()) {
    const attachment = reader.getAttachment(metadata);
    const navn = attachment.fileName || metadata.fileName || `vedhæftning-${i + 1}`;
    const indhold = Buffer.from(attachment.content || []);
    if (indhold.length > MAKS_VEDHAEFTNING_BYTES) {
      ud.vedhaeftninger.push({ navn, status: "for-stor" });
      continue;
    }
    const del = dybde < 2
      ? await udtraekVedhaeftning(indhold, navn, metadata.mimeType, `${reference}, vedhæftning “${navn}”`, dybde + 1)
      : { understottet: false, filtype: "indlejret" };
    ud.vedhaeftninger.push({ navn, filtype: del.filtype, status: del.understottet ? "udtrukket" : "ikke-understottet" });
    if (del.understottet) flet(ud, del.resultat);
  }
  if ((mail.attachments || []).length > MAKS_VEDHAEFTNINGER) ud.advarsler.push(`Kun de første ${MAKS_VEDHAEFTNINGER} vedhæftninger blev gennemgået.`);
  return ud;
}

export async function udtraekUnitDokument(bytes, metadata = {}, options = {}) {
  const filtype = metadata.filtype || filtypeFraNavn(metadata.filnavn, metadata.mimeType);
  const reference = options.reference || metadata.filnavn || "Dokument";
  const dybde = options.dybde || 0;
  let ud;
  if (filtype === "eml") ud = await udtraekEml(bytes, reference, dybde);
  else if (filtype === "msg") ud = await udtraekMsg(bytes, reference, dybde);
  else if (filtype === "pdf") ud = await udtraekPdf(bytes, reference);
  else if (filtype === "xlsx") ud = await udtraekXlsx(bytes, reference);
  else {
    ud = samler();
    ud.tilfoej(Buffer.from(bytes).toString("utf8"), filtype === "csv" ? `${reference}, tabel` : `${reference}, tekst`);
    if (filtype === "csv") ud.tabeller.push({ tekst: ud.linjer.join("\n"), reference: `${reference}, tabel`, celleReferencer: null });
  }
  return {
    tekst: ud.linjer.join("\n").slice(0, MAKS_TEKST),
    linjeReferencer: ud.linjeReferencer,
    tabeller: ud.tabeller,
    vedhaeftninger: ud.vedhaeftninger,
    advarsler: [...new Set(ud.advarsler)],
    filtype,
  };
}

export const UNIT_LOKAL_UDTRAEK_FILTYPE = Object.freeze(["eml", "msg", "pdf", "xlsx", "csv"]);

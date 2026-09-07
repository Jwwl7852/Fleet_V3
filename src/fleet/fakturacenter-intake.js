/*
 * Lokal, ren domænekerne for Fakturacenter intake v1.
 *
 * Filen kender ingen browser, Firebase, Storage, mailprovider, OCR eller
 * malwaretjeneste. Den beskriver de kontrakter, som en senere serverpipeline
 * skal håndhæve. Etape 1 bruger kun syntetiske data.
 */

export const INTAKE_KILDE = Object.freeze({
  dragDrop: "drag-and-drop",
  veyroMail: "veyro-mail",
  mailbox: "mailbox-forbindelse",
});

export const DOKUMENTTYPE = Object.freeze({
  digitalPdf: "digital-pdf",
  scannetPdf: "scannet-pdf",
  jpg: "jpg",
  png: "png",
  xml: "xml",
  oioubl: "oioubl",
});

export const INTAKE_STATUS = Object.freeze({
  modtaget: "modtaget",
  karantaene: "karantaene",
  afventerAflæsning: "afventer-aflaesning",
  aflæst: "aflaest",
  manuel: "kraever-manuel-behandling",
  dublet: "mistaenkt-dublet",
  sikkerhedsafvist: "afvist-sikkerhedskontrol",
  konverteret: "konverteret-til-faktura",
});

export const DUBLET_STATUS = Object.freeze({
  ikkeKontrolleret: "ikke-kontrolleret",
  ingen: "ingen-dublet",
  mistænkt: "mistaenkt-dublet",
  afklaret: "afklaret",
});

export const AFLAESNING_STATUS = Object.freeze({
  afventer: "afventer",
  struktureret: "struktureret-parser",
  pdfTekst: "pdf-tekst",
  ocrKræves: "ocr-kraever-senere-tjeneste",
  aflæst: "aflaest",
  manuel: "manuel-behandling",
  ulæselig: "ulaeselig",
});

export const FAKTURAART = Object.freeze({
  faktura: "faktura",
  kreditnota: "kreditnota",
  ukendt: "ukendt",
});

export const MODUL = Object.freeze({
  fleet: "FLEET",
  facility: "FACILITY",
  procure: "PROCURE",
});

export const FAKTURAVINDUE = Object.freeze({
  aaben: "aaben-for-faktura",
  delvis: "delvist-faktureret",
  lukket: "lukket-for-faktura",
});

export const MATCHNIVEAU = Object.freeze({
  forsigtig: "forsigtig",
  balanceret: "balanceret",
  fleksibel: "fleksibel",
});

export const MATCH_OPRINDELSE = Object.freeze({
  automatisk: "automatisk-placeret",
  foreslaaet: "foreslaaet-kraever-valg",
  manuel: "manuelt-valgt",
  ikkePlaceret: "ikke-placeret",
});

export const MAILFIL_ROLLE = Object.freeze({
  uafklaret: "uafklaret",
  faktura: "faktura",
  bilag: "bilag",
  ignoreret: "ignoreret",
});

export const LOKAL_FIL_STATUS = Object.freeze({
  klar: "klar-lokal-prototype",
  dublet: "mulig-dublet",
  afvist: "afvist",
});

export const MAKS_LOKAL_FILSTOERRELSE = 25 * 1024 * 1024;

export const KONTROL_STATUS = Object.freeze({
  tilKontrol: "til-kontrol",
  kontrolleret: "kontrolleret",
  genaabnet: "genaabnet",
});

export const INDBAKKE_SEKTION = Object.freeze({
  indbakke: "indbakke",
  behandling: "kraever-behandling",
  match: "match-og-fordeling",
  kontrol: "til-kontrol",
  kontrolleret: "kontrollerede",
  mail: "mail-og-forbindelser",
  arkiv: "arkiv",
});

/** Stabil visningsrækkefølge. Labels er UI-metadata, ikke et datasæt. */
export const FAKTURACENTER_SEKTIONER = Object.freeze([
  { id: INDBAKKE_SEKTION.indbakke, label: "Ny i indbakken" },
  { id: INDBAKKE_SEKTION.behandling, label: "Kræver behandling" },
  { id: INDBAKKE_SEKTION.kontrol, label: "Til kontrol" },
  { id: INDBAKKE_SEKTION.kontrolleret, label: "Kontrollerede" },
  { id: INDBAKKE_SEKTION.mail, label: "Mail og forbindelser" },
  { id: INDBAKKE_SEKTION.arkiv, label: "Arkiv" },
]);

export const TEKNISK_FEJLKODE = Object.freeze({
  ugyldigtDokument: "INTAKE_INVALID_DOCUMENT",
  ugyldigMime: "INTAKE_INVALID_MIME",
  ugyldigHash: "INTAKE_INVALID_SHA256",
  sikkerhedsafvist: "INTAKE_SECURITY_REJECTED",
  ulæselig: "READING_UNREADABLE",
  flereMailfiler: "MAIL_MULTIPLE_INVOICE_FILES",
  crossTenant: "MATCH_CROSS_TENANT",
  ufuldstændigFordeling: "ALLOCATION_INCOMPLETE",
  manglendeAdgang: "ACCESS_DENIED",
  ugyldigHandlingskontekst: "ACTION_CONTEXT_INVALID",
  lukketDestination: "DESTINATION_CLOSED",
});

export const TILLADTE_FILENDELSER = Object.freeze([
  ".pdf", ".jpg", ".jpeg", ".png", ".xml",
]);

const ALLE_KILDER = new Set(Object.values(INTAKE_KILDE));
const ALLE_DOKUMENTTYPER = new Set(Object.values(DOKUMENTTYPE));
const ALLE_INTAKE_STATUS = new Set(Object.values(INTAKE_STATUS));
const ALLE_DUBLET_STATUS = new Set(Object.values(DUBLET_STATUS));
const ALLE_AFLAESNING_STATUS = new Set(Object.values(AFLAESNING_STATUS));
const ALLE_MODULER = new Set(Object.values(MODUL));
const ALLE_VINDUER = new Set(Object.values(FAKTURAVINDUE));
const ALLE_MATCHNIVEAUER = new Set(Object.values(MATCHNIVEAU));
const ALLE_MAILFIL_ROLLER = new Set(Object.values(MAILFIL_ROLLE));
const ALLE_FAKTURAARTER = new Set(Object.values(FAKTURAART));
const SHA256 = /^[a-f0-9]{64}$/;
const MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/xml",
  "text/xml",
  "application/oioubl+xml",
]);

const tekst = (v) => typeof v === "string" && v.trim() ? v.trim() : null;
const heltal = (v) => Number.isSafeInteger(v) ? v : null;
const liste = (v) => Array.isArray(v) ? v : [];
const frys = (v) => Object.freeze(v);

const gyldigTid = (v) => Number.isSafeInteger(v) && v > 0;
const gyldigDato = (v) => {
  if (v === null) return true;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [år, måned, dag] = v.split("-").map(Number);
  const dato = new Date(Date.UTC(år, måned - 1, dag));
  return dato.getUTCFullYear() === år && dato.getUTCMonth() === måned - 1
    && dato.getUTCDate() === dag;
};

function validérHandlingskontekst(kontekst = {}, adgangsfelt = "harAdgang") {
  if (!tekst(kontekst.aktuelTenantId)) return { ok: false, fejl: "ACTION_TENANT_REQUIRED" };
  if (!tekst(kontekst.brugerId)) return { ok: false, fejl: "ACTION_USER_REQUIRED" };
  if (!gyldigTid(kontekst.tidspunktMs)) return { ok: false, fejl: "ACTION_TIME_INVALID" };
  if (kontekst[adgangsfelt] !== true) return { ok: false, fejl: TEKNISK_FEJLKODE.manglendeAdgang };
  return { ok: true, fejl: null };
}

export function dokumenttypeFraFilnavn(filnavn, mime = "") {
  const navn = String(filnavn || "").toLowerCase();
  if (navn.endsWith(".oioubl.xml") || mime === "application/oioubl+xml") return DOKUMENTTYPE.oioubl;
  if (navn.endsWith(".xml") || mime === "application/xml" || mime === "text/xml") return DOKUMENTTYPE.xml;
  if (navn.endsWith(".jpg") || navn.endsWith(".jpeg") || mime === "image/jpeg") return DOKUMENTTYPE.jpg;
  if (navn.endsWith(".png") || mime === "image/png") return DOKUMENTTYPE.png;
  if (navn.endsWith(".pdf") || mime === "application/pdf") {
    return navn.includes("scan") ? DOKUMENTTYPE.scannetPdf : DOKUMENTTYPE.digitalPdf;
  }
  return null;
}

function dokumentfamilieFraEndelse(filnavn) {
  const navn = String(filnavn || "").toLowerCase();
  if (navn.endsWith(".oioubl.xml") || navn.endsWith(".xml")) return "xml";
  if (navn.endsWith(".jpg") || navn.endsWith(".jpeg")) return "jpeg";
  if (navn.endsWith(".png")) return "png";
  if (navn.endsWith(".pdf")) return "pdf";
  return null;
}

function dokumentfamilieFraMime(mime) {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/jpeg") return "jpeg";
  if (mime === "image/png") return "png";
  if (["application/xml", "text/xml", "application/oioubl+xml"].includes(mime)) return "xml";
  return null;
}

function hexFraBytes(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error("LOCAL_SHA256_UNAVAILABLE");
  return hexFraBytes(await globalThis.crypto.subtle.digest("SHA-256", bytes));
}

/**
 * Lokal prototypeklassifikation. Den erstatter ikke magic-byte-, malware- eller
 * servervalidering og gemmer aldrig filindholdet.
 */
export async function behandlLokalePrototypeFiler(filer = [], eksisterendeHashes = []) {
  const kendteHashes = new Set(liste(eksisterendeHashes).filter((hash) => SHA256.test(String(hash))));
  const resultater = [];
  for (const fil of Array.from(filer || [])) {
    const filnavn = tekst(fil?.name);
    const mimeType = typeof fil?.type === "string" ? fil.type.toLowerCase() : "";
    const størrelse = fil?.size;
    let fejl = null;
    if (!filnavn) fejl = "LOCAL_FILE_NAME_REQUIRED";
    else if (!Number.isSafeInteger(størrelse) || størrelse <= 0) fejl = "LOCAL_FILE_EMPTY";
    else if (størrelse > MAKS_LOKAL_FILSTOERRELSE) fejl = "LOCAL_FILE_TOO_LARGE";
    const endelsesfamilie = dokumentfamilieFraEndelse(filnavn);
    const mimefamilie = dokumentfamilieFraMime(mimeType);
    if (!fejl && !endelsesfamilie) fejl = "LOCAL_FILE_TYPE_UNSUPPORTED";
    if (!fejl && mimeType && !mimefamilie && mimeType !== "application/octet-stream") {
      fejl = "LOCAL_FILE_MIME_UNSUPPORTED";
    }
    if (!fejl && endelsesfamilie && mimefamilie && endelsesfamilie !== mimefamilie) {
      fejl = "LOCAL_FILE_EXTENSION_MIME_MISMATCH";
    }
    if (fejl) {
      resultater.push({ filnavn, mimeType, størrelse, dokumenttype: null,
        status: LOKAL_FIL_STATUS.afvist, fejl, sha256: null });
      continue;
    }
    if (typeof fil.arrayBuffer !== "function") {
      resultater.push({ filnavn, mimeType, størrelse, dokumenttype: null,
        status: LOKAL_FIL_STATUS.afvist, fejl: "LOCAL_FILE_BYTES_UNAVAILABLE", sha256: null });
      continue;
    }
    const bytes = await fil.arrayBuffer();
    const sha256 = await sha256Hex(bytes);
    const dublet = kendteHashes.has(sha256);
    kendteHashes.add(sha256);
    resultater.push({
      filnavn,
      mimeType,
      størrelse,
      dokumenttype: dokumenttypeFraFilnavn(filnavn, mimeType),
      status: dublet ? LOKAL_FIL_STATUS.dublet : LOKAL_FIL_STATUS.klar,
      fejl: dublet ? "LOCAL_FILE_DUPLICATE_HASH" : null,
      sha256,
    });
  }
  return resultater;
}

export function bygIntake(data = {}) {
  const fejl = [];
  const filnavn = tekst(data.originaltFilnavn);
  const mime = tekst(data.mimeType);
  const hash = String(data.sha256 || "").toLowerCase();
  if (!tekst(data.intakeId)) fejl.push("intake-id-mangler");
  if (!tekst(data.tenantId)) fejl.push("tenant-id-mangler");
  if (!ALLE_KILDER.has(data.kilde)) fejl.push("ukendt-kilde");
  if (!ALLE_DOKUMENTTYPER.has(data.dokumenttype)) fejl.push("ukendt-dokumenttype");
  if (!filnavn) fejl.push("filnavn-mangler");
  if (!mime || !MIME.has(mime)) fejl.push("mime-ikke-tilladt");
  if (heltal(data.stoerrelse) === null || data.stoerrelse <= 0) fejl.push("ugyldig-stoerrelse");
  if (!SHA256.test(hash)) fejl.push("ugyldig-sha256");
  if (!ALLE_INTAKE_STATUS.has(data.status)) fejl.push("ukendt-intake-status");
  if (!ALLE_DUBLET_STATUS.has(data.dubletstatus)) fejl.push("ukendt-dubletstatus");
  if (!ALLE_AFLAESNING_STATUS.has(data.aflaesningsstatus)) fejl.push("ukendt-aflaesningsstatus");
  if (!Number.isFinite(data.modtagetMs) || data.modtagetMs <= 0) fejl.push("ugyldigt-modtagelsestidspunkt");
  if (data.fakturaId !== null && data.fakturaId !== undefined && !tekst(data.fakturaId)) {
    fejl.push("ugyldigt-faktura-id");
  }
  if (!liste(data.fejlkoder).every((kode) => typeof kode === "string" && /^[A-Z0-9_]+$/.test(kode))) {
    fejl.push("ugyldige-fejlkoder");
  }
  if (fejl.length) return { ok: false, fejl, intake: null };

  const original = frys({
    filnavn,
    mimeType: mime,
    stoerrelse: data.stoerrelse,
    sha256: hash,
    immutable: true,
  });
  const intake = frys({
    intakeId: data.intakeId.trim(),
    tenantId: data.tenantId.trim(),
    kilde: data.kilde,
    kildeId: tekst(data.kildeId),
    modtagetMs: data.modtagetMs,
    dokumenttype: data.dokumenttype,
    original,
    status: data.status,
    dubletstatus: data.dubletstatus,
    aflaesningsstatus: data.aflaesningsstatus,
    fakturaId: tekst(data.fakturaId),
    fejlkoder: frys([...liste(data.fejlkoder)]),
  });
  return { ok: true, fejl: [], intake };
}

export function bygAflæsning(original = {}, metadata = {}) {
  return {
    tenantId: tekst(metadata.tenantId),
    original: frys({
      fakturaart: original.fakturaart || FAKTURAART.ukendt,
      fakturanummer: tekst(original.fakturanummer),
      leverandoerId: tekst(original.leverandoerId),
      leverandoernavn: tekst(original.leverandoernavn),
      leverandoerCvr: tekst(original.leverandoerCvr),
      fakturadato: tekst(original.fakturadato),
      forfaldsdato: tekst(original.forfaldsdato),
      nettoOere: heltal(original.nettoOere),
      momsOere: heltal(original.momsOere),
      totalOere: heltal(original.totalOere),
      valuta: tekst(original.valuta) || "DKK",
      land: tekst(original.land) || "DK",
      ordreOpgaveNumre: frys([...liste(original.ordreOpgaveNumre).filter(tekst)]),
      enhedsnumre: frys([...liste(original.enhedsnumre).filter(tekst)]),
      registreringsnumre: frys([...liste(original.registreringsnumre).filter(tekst)]),
      stelSerieNumre: frys([...liste(original.stelSerieNumre).filter(tekst)]),
      enhedsnavne: frys([...liste(original.enhedsnavne).filter(tekst)]),
      kundereferencer: frys([...liste(original.kundereferencer).filter(tekst)]),
      fakturalinjer: frys(liste(original.fakturalinjer).map((linje) => frys({ ...linje }))),
      kreditForFakturanummer: tekst(original.kreditForFakturanummer),
    }),
    rettelser: [],
    rettelseshistorik: [],
    parser: frys({
      metode: metadata.metode || "syntetisk-deterministisk",
      version: metadata.version || "demo-v1",
      udlæstMs: metadata.udlaestMs || null,
    }),
  };
}

export function effektivAflæsning(aflæsning) {
  return Object.assign({}, aflæsning?.original || {}, ...(aflæsning?.rettelser || []));
}

export function retAflæsning(aflæsning, ændringer, kontekst = {}) {
  if (!aflæsning?.original) return { ok: false, fejl: "aflaesning-mangler" };
  const handling = validérHandlingskontekst(kontekst);
  if (!handling.ok) return { ok: false, fejl: handling.fejl };
  if (!tekst(aflæsning.tenantId) || aflæsning.tenantId !== kontekst.aktuelTenantId) {
    return { ok: false, fejl: TEKNISK_FEJLKODE.crossTenant };
  }
  const tilladte = new Set(Object.keys(aflæsning.original));
  const renset = {};
  const tekstfelter = new Set([
    "fakturanummer", "leverandoerId", "leverandoernavn", "leverandoerCvr",
    "kreditForFakturanummer",
  ]);
  const listefelter = new Set([
    "ordreOpgaveNumre", "enhedsnumre", "registreringsnumre", "stelSerieNumre",
    "enhedsnavne", "kundereferencer",
  ]);
  for (const [felt, værdi] of Object.entries(ændringer || {})) {
    if (!tilladte.has(felt)) return { ok: false, fejl: "CORRECTION_FIELD_UNKNOWN" };
    if (felt === "fakturalinjer") return { ok: false, fejl: "CORRECTION_FIELD_FORBIDDEN" };
    if (tekstfelter.has(felt)) {
      if (værdi !== null && !tekst(værdi)) return { ok: false, fejl: "CORRECTION_VALUE_INVALID" };
      renset[felt] = værdi === null ? null : værdi.trim();
    } else if (listefelter.has(felt)) {
      if (!Array.isArray(værdi) || !værdi.every((v) => Boolean(tekst(v)))) {
        return { ok: false, fejl: "CORRECTION_VALUE_INVALID" };
      }
      renset[felt] = værdi.map((v) => v.trim());
    } else if (["nettoOere", "momsOere", "totalOere"].includes(felt)) {
      if (!Number.isSafeInteger(værdi)) return { ok: false, fejl: "CORRECTION_AMOUNT_INVALID" };
      renset[felt] = værdi;
    } else if (["fakturadato", "forfaldsdato"].includes(felt)) {
      if (!gyldigDato(værdi)) return { ok: false, fejl: "CORRECTION_DATE_INVALID" };
      renset[felt] = værdi;
    } else if (felt === "valuta") {
      if (værdi !== "DKK") return { ok: false, fejl: "CORRECTION_CURRENCY_INVALID" };
      renset[felt] = værdi;
    } else if (felt === "land") {
      if (værdi !== "DK") return { ok: false, fejl: "CORRECTION_COUNTRY_INVALID" };
      renset[felt] = værdi;
    } else if (felt === "fakturaart") {
      if (!ALLE_FAKTURAARTER.has(værdi)) return { ok: false, fejl: "CORRECTION_INVOICE_TYPE_INVALID" };
      renset[felt] = værdi;
    }
  }
  if (!Object.keys(renset).length) return { ok: false, fejl: "ingen-rettelser" };
  return {
    ok: true,
    aflæsning: {
      ...aflæsning,
      rettelser: [...aflæsning.rettelser, frys({ ...renset })],
      rettelseshistorik: [
        ...aflæsning.rettelseshistorik,
        frys({ brugerId: kontekst.brugerId.trim(), tidspunktMs: kontekst.tidspunktMs,
          felter: Object.keys(renset).sort() }),
      ],
    },
  };
}

export function normaliserReference(værdi) {
  // Unicode-bogstaver og tal bevares. Kun visningsseparatorer fjernes.
  // Det holder fx Ø-123 forskellig fra både 123 og OE-123.
  return String(værdi || "").normalize("NFKC").toLocaleUpperCase("da-DK")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function referenceTokens(værdi) {
  const fund = String(værdi || "").normalize("NFKC").toLocaleUpperCase("da-DK")
    .match(/[\p{L}\p{N}]+(?:[-_/][\p{L}\p{N}]+)*/gu) || [];
  return [...new Set(fund.map(normaliserReference).filter(Boolean))];
}

export function normaliserEnhedsnummer(værdi) {
  return normaliserReference(værdi);
}

export function normaliserRegistreringsnummer(værdi) {
  return normaliserReference(værdi);
}

export function normaliserStelSerie(værdi) {
  return normaliserReference(værdi);
}

export function normaliserNavn(værdi) {
  return String(værdi || "").toLocaleLowerCase("da-DK")
    .replaceAll("æ", "ae").replaceAll("ø", "o").replaceAll("å", "a")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

export function normaliserKundereference(værdi) {
  return normaliserNavn(værdi);
}

export function bygDestination(data = {}) {
  if (!tekst(data.tenantId) || !ALLE_MODULER.has(data.modul)
      || !tekst(data.destinationId) || !tekst(data.navn)
      || !ALLE_VINDUER.has(data.fakturastatus)) {
    throw new TypeError("Ugyldig read-only destination.");
  }
  return frys({
    tenantId: data.tenantId.trim(),
    modul: data.modul,
    destinationId: data.destinationId.trim(),
    navn: data.navn.trim(),
    operationelStatus: tekst(data.operationelStatus),
    fakturastatus: data.fakturastatus,
    datoMs: Number.isFinite(data.datoMs) ? data.datoMs : null,
    leverandoer: frys({
      id: tekst(data.leverandoer?.id),
      cvr: tekst(data.leverandoer?.cvr),
      navn: tekst(data.leverandoer?.navn),
      navnevarianter: frys([...liste(data.leverandoer?.navnevarianter).filter(tekst)]),
    }),
    referencer: frys([...liste(data.referencer).filter(tekst)]),
    enhed: data.enhed ? frys({
      id: tekst(data.enhed.id),
      interntNummer: tekst(data.enhed.interntNummer),
      registreringsnummer: tekst(data.enhed.registreringsnummer),
      stelSerieNummer: tekst(data.enhed.stelSerieNummer),
      navn: tekst(data.enhed.navn),
      kundereferencer: frys([...liste(data.enhed.kundereferencer).filter(tekst)]),
    }) : null,
    lokation: tekst(data.lokation),
    koststeder: frys([...liste(data.koststeder).filter(tekst)]),
    forventetNettoOere: heltal(data.forventetNettoOere),
  });
}

export const erAabenForFaktura = (destination) =>
  destination?.fakturastatus === FAKTURAVINDUE.aaben
  || destination?.fakturastatus === FAKTURAVINDUE.delvis;

function leverandoerMatch(faktura, destination) {
  const leverandoer = destination.leverandoer || {};
  if (tekst(faktura.leverandoerId)) return faktura.leverandoerId === leverandoer.id;
  if (tekst(faktura.leverandoerCvr)) return normaliserReference(faktura.leverandoerCvr) === normaliserReference(leverandoer.cvr);
  const navn = normaliserNavn(faktura.leverandoernavn);
  if (!navn) return false;
  return [leverandoer.navn, ...liste(leverandoer.navnevarianter)]
    .some((variant) => normaliserNavn(variant) === navn);
}

function referenceMatch(faktura, destination) {
  const fakturaTokens = new Set(liste(faktura.ordreOpgaveNumre).flatMap(referenceTokens));
  return destination.referencer.some((ref) => fakturaTokens.has(normaliserReference(ref)));
}

function enhedsMatch(faktura, destination) {
  const enhed = destination.enhed;
  if (!enhed) return [];
  const fund = [];
  const har = (værdier, kandidat, normaliser, art) => {
    if (!kandidat) return;
    const søgte = new Set(liste(værdier).map(normaliser).filter(Boolean));
    if (søgte.has(normaliser(kandidat))) fund.push(art);
  };
  har(faktura.enhedsnumre, enhed.interntNummer, normaliserEnhedsnummer, "enhedsnummer");
  har(faktura.registreringsnumre, enhed.registreringsnummer, normaliserRegistreringsnummer, "registreringsnummer");
  har(faktura.stelSerieNumre, enhed.stelSerieNummer, normaliserStelSerie, "stel-serienummer");
  har(faktura.enhedsnavne, enhed.navn, normaliserNavn, "enhedsnavn");
  const refs = liste(enhed.kundereferencer);
  if (liste(faktura.kundereferencer).some((a) =>
    refs.some((b) => normaliserKundereference(a) === normaliserKundereference(b)))) {
    fund.push("kundereference");
  }
  return [...new Set(fund)];
}

function advarsler(faktura, destination) {
  const ud = [];
  if ((faktura.leverandoerId || faktura.leverandoerCvr || faktura.leverandoernavn)
      && !leverandoerMatch(faktura, destination)) ud.push("leverandoer-afviger");
  if (!erAabenForFaktura(destination)) ud.push("destination-lukket-for-faktura");
  return ud;
}

function rangér(faktura, kandidater) {
  return [...kandidater].sort((a, b) => {
    const aLev = leverandoerMatch(faktura, a) ? 1 : 0;
    const bLev = leverandoerMatch(faktura, b) ? 1 : 0;
    if (aLev !== bLev) return bLev - aLev;
    const aBeløb = Number.isInteger(faktura.nettoOere) && Number.isInteger(a.forventetNettoOere)
      ? Math.abs(faktura.nettoOere - a.forventetNettoOere) : Number.MAX_SAFE_INTEGER;
    const bBeløb = Number.isInteger(faktura.nettoOere) && Number.isInteger(b.forventetNettoOere)
      ? Math.abs(faktura.nettoOere - b.forventetNettoOere) : Number.MAX_SAFE_INTEGER;
    if (aBeløb !== bBeløb) return aBeløb - bBeløb;
    return a.destinationId.localeCompare(b.destinationId);
  });
}

function resultat({ trin, årsag, kandidater = [], placering = null, advarsel = [], enhed = null }) {
  return {
    ok: true,
    fejl: null,
    trin,
    årsag,
    kandidater,
    placering,
    automatiskPlaceret: Boolean(placering),
    oprindelse: placering
      ? MATCH_OPRINDELSE.automatisk
      : (kandidater.length ? MATCH_OPRINDELSE.foreslaaet : MATCH_OPRINDELSE.ikkePlaceret),
    kontrolstatus: placering ? KONTROL_STATUS.tilKontrol : null,
    advarsler: [...new Set(advarsel)],
    fundetEnhed: enhed,
  };
}

export function matchFaktura(indstillinger = {}) {
  const { tenantId, aflæsning, destinationer = [] } = indstillinger;
  const sikkerhedsniveau = Object.hasOwn(indstillinger, "sikkerhedsniveau")
    ? indstillinger.sikkerhedsniveau : MATCHNIVEAU.balanceret;
  if (!ALLE_MATCHNIVEAUER.has(sikkerhedsniveau)) {
    return {
      ok: false,
      fejl: "MATCH_LEVEL_INVALID",
      trin: "afvist",
      årsag: "ugyldigt-sikkerhedsniveau",
      kandidater: [],
      placering: null,
      automatiskPlaceret: false,
      oprindelse: MATCH_OPRINDELSE.ikkePlaceret,
      kontrolstatus: null,
      advarsler: [],
      fundetEnhed: null,
    };
  }
  const faktura = aflæsning?.original ? effektivAflæsning(aflæsning) : aflæsning || {};
  const tenantDestinationer = destinationer.filter((d) => d.tenantId === tenantId);

  const referenceKandidater = tenantDestinationer.filter((d) => referenceMatch(faktura, d));
  if (referenceKandidater.length === 1) {
    const destination = referenceKandidater[0];
    const varsler = advarsler(faktura, destination);
    if (!erAabenForFaktura(destination)) {
      return resultat({
        trin: "reference", årsag: "sen-faktura-til-lukket-destination",
        kandidater: [destination], advarsel: varsler,
      });
    }
    return resultat({
      trin: "reference", årsag: "eksakt-entydig-reference",
      kandidater: [destination], placering: destination, advarsel: varsler,
    });
  }
  if (referenceKandidater.length > 1) {
    return resultat({
      trin: "reference",
      årsag: "flere-eksakte-referencer-foreslaar-opdeling",
      kandidater: rangér(faktura, referenceKandidater),
      advarsel: ["manuel-fordeling-paakraevet"],
    });
  }

  const enhedsKandidater = tenantDestinationer
    .map((destination) => ({ destination, signaler: enhedsMatch(faktura, destination) }))
    .filter((fund) => fund.signaler.length);
  if (enhedsKandidater.length) {
    const åbne = enhedsKandidater.filter((fund) => erAabenForFaktura(fund.destination));
    const enheder = new Set(enhedsKandidater.map((fund) => fund.destination.enhed?.id).filter(Boolean));
    if (!åbne.length) {
      return resultat({
        trin: "enhed", årsag: "enhed-fundet-uden-aaben-opgave",
        kandidater: enhedsKandidater.map((fund) => fund.destination),
        enhed: enhedsKandidater[0].destination.enhed,
      });
    }
    if (åbne.length !== 1 || enheder.size !== 1) {
      return resultat({
        trin: "enhed", årsag: "flere-enheder-eller-opgaver",
        kandidater: rangér(faktura, åbne.map((fund) => fund.destination)),
        advarsel: ["manuel-placering-paakraevet"],
      });
    }
    const destination = åbne[0].destination;
    const sammeLeverandør = leverandoerMatch(faktura, destination);
    if (sikkerhedsniveau === MATCHNIVEAU.forsigtig) {
      return resultat({
        trin: "enhed", årsag: "forsigtig-kraever-bekraeftelse",
        kandidater: [destination], enhed: destination.enhed,
      });
    }
    if (sikkerhedsniveau === MATCHNIVEAU.balanceret && !sammeLeverandør) {
      return resultat({
        trin: "enhed", årsag: "balanceret-kraever-samme-leverandoer",
        kandidater: [destination], advarsel: ["leverandoer-afviger"],
        enhed: destination.enhed,
      });
    }
    return resultat({
      trin: "enhed", årsag: "entydig-enhed-og-aaben-opgave",
      kandidater: [destination], placering: destination,
      advarsel: advarsler(faktura, destination), enhed: destination.enhed,
    });
  }

  const leverandørKandidater = tenantDestinationer
    .filter(erAabenForFaktura)
    .filter((destination) => leverandoerMatch(faktura, destination));
  if (leverandørKandidater.length === 1) {
    const destination = leverandørKandidater[0];
    return resultat({
      trin: "leverandoer", årsag: "en-aaben-leverandoeropgave",
      kandidater: [destination], placering: destination,
      advarsel: advarsler(faktura, destination),
    });
  }
  if (leverandørKandidater.length > 1) {
    return resultat({
      trin: "leverandoer", årsag: "flere-aabne-leverandoeropgaver",
      kandidater: rangér(faktura, leverandørKandidater),
      advarsel: ["manuel-placering-paakraevet"],
    });
  }
  return resultat({
    trin: "manuel", årsag: "ukendt-leverandoer-eller-ingen-relevant-opgave",
    advarsel: ["manuel-behandling-paakraevet"],
  });
}

export function skiftFakturavindue(destination, nytStatus, kontekst = {}) {
  const handling = validérHandlingskontekst(kontekst, "harModulSkriveadgang");
  if (!handling.ok) return { ok: false, fejl: handling.fejl, destination };
  if (destination?.tenantId !== kontekst.aktuelTenantId) {
    return { ok: false, fejl: TEKNISK_FEJLKODE.crossTenant, destination };
  }
  if (!ALLE_VINDUER.has(nytStatus)) return { ok: false, fejl: "INVOICE_WINDOW_INVALID" };
  if (destination.fakturastatus === nytStatus) {
    return { ok: false, fejl: "INVOICE_WINDOW_UNCHANGED", destination };
  }
  const genåbner = destination.fakturastatus === FAKTURAVINDUE.lukket
    && nytStatus !== FAKTURAVINDUE.lukket;
  if (genåbner && !tekst(kontekst.begrundelse)) {
    return { ok: false, fejl: "REOPEN_REASON_REQUIRED", destination };
  }
  const historik = [
    ...liste(destination.fakturahistorik),
    {
      fra: destination.fakturastatus,
      til: nytStatus,
      brugerId: kontekst.brugerId.trim(),
      tidspunktMs: kontekst.tidspunktMs,
      begrundelse: genåbner ? kontekst.begrundelse.trim() : null,
    },
  ];
  return {
    ok: true,
    destination: { ...destination, fakturastatus: nytStatus, fakturahistorik: historik },
  };
}

export function validérFordeling(nettoOere, fordelinger = [], fakturaart =
  (Number.isSafeInteger(nettoOere) && nettoOere < 0 ? FAKTURAART.kreditnota : FAKTURAART.faktura)) {
  if (!Number.isSafeInteger(nettoOere)) return { ok: false, fejl: "NET_AMOUNT_INVALID", fordeltOere: 0 };
  if (fakturaart === FAKTURAART.kreditnota && nettoOere > 0) {
    return { ok: false, fejl: "CREDIT_NOTE_SIGN_INVALID", fordeltOere: 0 };
  }
  if (fakturaart !== FAKTURAART.kreditnota && nettoOere < 0) {
    return { ok: false, fejl: "INVOICE_SIGN_INVALID", fordeltOere: 0 };
  }
  if (!fordelinger.length) return { ok: false, fejl: TEKNISK_FEJLKODE.ufuldstændigFordeling, fordeltOere: 0 };
  const fortegn = Math.sign(nettoOere);
  const ider = new Set();
  if (!fordelinger.every((f) =>
    tekst(f.fordelingId) && tekst(f.destinationId) && ALLE_MODULER.has(f.modul)
    && Number.isSafeInteger(f.nettoOere)
    && (f.nettoOere === 0 || Math.sign(f.nettoOere) === fortegn))) {
    return { ok: false, fejl: "ALLOCATION_INVALID", fordeltOere: 0 };
  }
  for (const fordeling of fordelinger) {
    if (ider.has(fordeling.fordelingId)) {
      return { ok: false, fejl: "ALLOCATION_ID_DUPLICATE", fordeltOere: 0 };
    }
    ider.add(fordeling.fordelingId);
  }
  const fordeltOere = fordelinger.reduce((sum, f) => sum + f.nettoOere, 0);
  if (!Number.isSafeInteger(fordeltOere)) {
    return { ok: false, fejl: "ALLOCATION_SUM_UNSAFE", fordeltOere: 0 };
  }
  if ((nettoOere >= 0 && fordeltOere > nettoOere)
      || (nettoOere < 0 && fordeltOere < nettoOere)) {
    return { ok: false, fejl: "ALLOCATION_EXCEEDS_NET_AMOUNT", fordeltOere };
  }
  return fordeltOere === nettoOere
    ? { ok: true, fejl: null, fordeltOere }
    : { ok: false, fejl: TEKNISK_FEJLKODE.ufuldstændigFordeling, fordeltOere };
}

function validérFordelingsdestinationer(faktura, kontekst) {
  if (!Array.isArray(kontekst.destinationer)) return ["DESTINATION_CONTEXT_REQUIRED"];
  const fejl = [];
  for (const fordeling of liste(faktura.fordelinger)) {
    const destination = kontekst.destinationer.find((d) =>
      d.destinationId === fordeling.destinationId && d.modul === fordeling.modul);
    if (!destination) fejl.push("DESTINATION_NOT_FOUND");
    else if (destination.tenantId !== kontekst.aktuelTenantId) fejl.push(TEKNISK_FEJLKODE.crossTenant);
    else if (!erAabenForFaktura(destination)) fejl.push(TEKNISK_FEJLKODE.lukketDestination);
  }
  return [...new Set(fejl)];
}

export function kanMarkeresKontrolleret(faktura, kontekst = {}) {
  const blokeringer = [];
  const handling = validérHandlingskontekst(kontekst);
  if (!handling.ok) blokeringer.push(handling.fejl);
  if (tekst(kontekst.aktuelTenantId) && faktura.tenantId !== kontekst.aktuelTenantId) {
    blokeringer.push(TEKNISK_FEJLKODE.crossTenant);
  }
  if (faktura.kontrolstatus === KONTROL_STATUS.kontrolleret || faktura.låst) {
    blokeringer.push("INVOICE_ALREADY_CONTROLLED");
  }
  if (faktura.sikkerhedsfejl) blokeringer.push(TEKNISK_FEJLKODE.sikkerhedsafvist);
  if (faktura.ugyldigtDokument) blokeringer.push(TEKNISK_FEJLKODE.ugyldigtDokument);
  if (faktura.dubletstatus === DUBLET_STATUS.mistænkt) blokeringer.push("DUPLICATE_UNRESOLVED");
  if (faktura.flereMailfilerUafklaret) blokeringer.push(TEKNISK_FEJLKODE.flereMailfiler);
  const fordeling = validérFordeling(faktura.nettoOere, faktura.fordelinger, faktura.fakturaart);
  if (!fordeling.ok) blokeringer.push(fordeling.fejl);
  if (!faktura.fordelinger?.length) blokeringer.push("MATCH_REQUIRED");
  if (liste(faktura.uløsteAdvarsler).length) blokeringer.push("WARNINGS_UNRESOLVED");
  blokeringer.push(...validérFordelingsdestinationer(faktura, kontekst));
  return { ok: blokeringer.length === 0, blokeringer: [...new Set(blokeringer)] };
}

export function accepterForretningsadvarsler(faktura, kontekst = {}) {
  const handling = validérHandlingskontekst(kontekst);
  if (!handling.ok) return { ok: false, fejl: handling.fejl, faktura };
  if (faktura.sikkerhedsfejl || faktura.ugyldigtDokument
      || faktura.tenantId !== kontekst.aktuelTenantId) {
    return { ok: false, fejl: "HARD_BLOCKER_CANNOT_BE_OVERRIDDEN", faktura };
  }
  if (liste(faktura.uløsteAdvarsler).includes("destination-lukket-for-faktura")) {
    return { ok: false, fejl: TEKNISK_FEJLKODE.lukketDestination, faktura };
  }
  if (!liste(faktura.uløsteAdvarsler).length) return { ok: false, fejl: "NO_WARNINGS", faktura };
  if (!tekst(kontekst.begrundelse)) return { ok: false, fejl: "WARNING_REASON_REQUIRED", faktura };
  return {
    ok: true,
    faktura: {
      ...faktura,
      uløsteAdvarsler: [],
      historik: [
        ...liste(faktura.historik),
        {
          handling: "forretningsadvarsel-accepteret",
          brugerId: kontekst.brugerId.trim(),
          tidspunktMs: kontekst.tidspunktMs,
          begrundelse: kontekst.begrundelse.trim(),
        },
      ],
    },
  };
}

export function markérKontrolleret(faktura, kontekst = {}) {
  const kan = kanMarkeresKontrolleret(faktura, kontekst);
  if (!kan.ok) return { ok: false, blokeringer: kan.blokeringer, faktura };
  const hændelse = {
    handling: "markeret-kontrolleret",
    brugerId: kontekst.brugerId.trim(),
    tidspunktMs: kontekst.tidspunktMs,
    fordelinger: faktura.fordelinger.map((f) => ({ ...f })),
  };
  return {
    ok: true,
    blokeringer: [],
    faktura: {
      ...faktura,
      kontrolstatus: KONTROL_STATUS.kontrolleret,
      låst: true,
      historik: [...liste(faktura.historik), hændelse],
    },
  };
}

export function genåbnFaktura(faktura, kontekst = {}) {
  const handling = validérHandlingskontekst(kontekst);
  if (!handling.ok) return { ok: false, fejl: handling.fejl, faktura };
  if (faktura.tenantId !== kontekst.aktuelTenantId) {
    return { ok: false, fejl: TEKNISK_FEJLKODE.crossTenant, faktura };
  }
  if (faktura.kontrolstatus !== KONTROL_STATUS.kontrolleret || !faktura.låst) {
    return { ok: false, fejl: "INVOICE_NOT_LOCKED", faktura };
  }
  if (!tekst(kontekst.begrundelse)) return { ok: false, fejl: "REOPEN_REASON_REQUIRED", faktura };
  return {
    ok: true,
    faktura: {
      ...faktura,
      kontrolstatus: KONTROL_STATUS.genaabnet,
      låst: false,
      historik: [
        ...liste(faktura.historik),
        { handling: "genaabnet", brugerId: kontekst.brugerId.trim(),
          tidspunktMs: kontekst.tidspunktMs, begrundelse: kontekst.begrundelse.trim() },
      ],
    },
  };
}

export function vælgManuelDestination(faktura, destination, kontekst = {}) {
  const handling = validérHandlingskontekst(kontekst);
  if (!handling.ok) return { ok: false, fejl: handling.fejl, faktura };
  if (faktura.tenantId !== kontekst.aktuelTenantId
      || destination?.tenantId !== kontekst.aktuelTenantId) {
    return { ok: false, fejl: TEKNISK_FEJLKODE.crossTenant, faktura };
  }
  if (faktura.låst) return { ok: false, fejl: "INVOICE_LOCKED", faktura };
  if (!erAabenForFaktura(destination)) {
    return { ok: false, fejl: TEKNISK_FEJLKODE.lukketDestination, faktura };
  }
  if (!Number.isSafeInteger(faktura.nettoOere)) {
    return { ok: false, fejl: "NET_AMOUNT_INVALID", faktura };
  }
  const fordeling = {
    fordelingId: `manuel-${faktura.fakturaId}-${destination.destinationId}`,
    destinationId: destination.destinationId,
    modul: destination.modul,
    nettoOere: faktura.nettoOere,
    koststed: destination.koststeder?.[0] || null,
  };
  return {
    ok: true,
    fejl: null,
    faktura: {
      ...faktura,
      fordelinger: [fordeling],
      fordeling: [fordeling],
      kontrolstatus: KONTROL_STATUS.tilKontrol,
      matchOprindelse: MATCH_OPRINDELSE.manuel,
      historik: [...liste(faktura.historik), {
        handling: "destination-manuelt-valgt",
        brugerId: kontekst.brugerId.trim(),
        tidspunktMs: kontekst.tidspunktMs,
        destinationId: destination.destinationId,
        modul: destination.modul,
      }],
    },
  };
}

export function masseKontrollér(fakturaer, valgteIder, kontekstFor, { synligeIder } = {}) {
  const eksplicit = new Set(liste(valgteIder));
  const synlige = new Set(Array.isArray(synligeIder) ? synligeIder : fakturaer.map((f) => f.fakturaId));
  const resultater = [];
  const opdaterede = fakturaer.map((faktura) => {
    if (!eksplicit.has(faktura.fakturaId)) return faktura;
    if (!synlige.has(faktura.fakturaId)) {
      resultater.push({
        fakturaId: faktura.fakturaId,
        fakturanummer: faktura.fakturanummer,
        ok: false,
        status: "afvist",
        blokeringer: ["SELECTION_NOT_VISIBLE"],
      });
      return faktura;
    }
    const resultat = markérKontrolleret(faktura, kontekstFor(faktura));
    resultater.push({
      fakturaId: faktura.fakturaId,
      fakturanummer: faktura.fakturanummer,
      ok: resultat.ok,
      status: resultat.ok ? "lykkedes" : "afvist",
      blokeringer: resultat.blokeringer || [],
    });
    return resultat.faktura;
  });
  return { fakturaer: opdaterede, resultater };
}

const MASSE_BLOKERING_TEKST = Object.freeze({
  ALLOCATION_INCOMPLETE: "Hele nettobeløbet skal være fordelt.",
  MATCH_REQUIRED: "Fakturaen mangler et entydigt match.",
  WARNINGS_UNRESOLVED: "En forretningsadvarsel kræver en begrundelse.",
  DUPLICATE_UNRESOLVED: "En mulig dublet skal behandles manuelt.",
  MAIL_MULTIPLE_INVOICE_FILES: "Mailens fakturafiler skal opdeles manuelt.",
  INTAKE_INVALID_DOCUMENT: "Dokumentet er ugyldigt eller ulæseligt.",
  INTAKE_SECURITY_REJECTED: "Dokumentet er afvist af sikkerhedskontrollen.",
  DESTINATION_CLOSED: "Destinationen er lukket for faktura.",
  DESTINATION_NOT_IN_CONTEXT: "Destinationen findes ikke i den aktuelle arbejdskontekst.",
  MATCH_CROSS_TENANT: "Tenantkonteksten stemmer ikke.",
  ACCESS_DENIED: "Brugeren mangler adgang til handlingen.",
  SELECTION_NOT_VISIBLE: "Fakturaen er ikke synlig i den aktuelle arbejdsliste.",
});

/** Gør et teknisk massekontrolresultat forståeligt uden at skjule kontrolgaten. */
export function beskrivMasseResultat(resultat = {}) {
  const blokeringer = liste(resultat.blokeringer);
  if (resultat.ok) return {
    status: "Kontrolleret",
    forklaring: "Match og fuld nettofordeling er kontrolleret; fakturaen er låst.",
  };
  const kræverBegrundelse = blokeringer.includes("WARNINGS_UNRESOLVED");
  const manglerPlacering = blokeringer.some((kode) =>
    kode === "MATCH_REQUIRED" || kode === "ALLOCATION_INCOMPLETE");
  return {
    status: kræverBegrundelse
      ? "Kræver begrundelse"
      : manglerPlacering ? "Mangler match eller fuld fordeling" : "Afvist",
    forklaring: blokeringer.length
      ? blokeringer.map((kode) => MASSE_BLOKERING_TEKST[kode] || `Afvist af kontrolgate (${kode}).`).join(" ")
      : "Fakturaen kunne ikke kontrolleres i den lokale prototype.",
  };
}

export function findDubletter(ny = {}, eksisterende = []) {
  const fund = [];
  for (const kandidat of eksisterende) {
    if (kandidat.tenantId !== ny.tenantId) continue;
    const grunde = [];
    if (ny.sha256 && ny.sha256 === kandidat.sha256) grunde.push("samme-filhash");
    if (ny.kildeId && ny.kildeId === kandidat.kildeId) grunde.push("samme-kilde-id");
    const sammeFaktura = ny.fakturanummer && ny.fakturanummer === kandidat.fakturanummer
      && ((ny.leverandoerId && ny.leverandoerId === kandidat.leverandoerId)
        || (ny.leverandoerCvr && ny.leverandoerCvr === kandidat.leverandoerCvr))
      && ny.nettoOere === kandidat.nettoOere
      && ny.fakturadato === kandidat.fakturadato;
    if (sammeFaktura) grunde.push("samme-fakturaidentitet");
    if (grunde.length) fund.push({ fakturaId: kandidat.fakturaId, grunde });
  }
  return { status: fund.length ? DUBLET_STATUS.mistænkt : DUBLET_STATUS.ingen, fund };
}

export function foreslåKreditnotaKobling(kreditnota, fakturaer) {
  if (kreditnota.fakturaart !== FAKTURAART.kreditnota) return [];
  return fakturaer
    .filter((f) => f.tenantId === kreditnota.tenantId && f.fakturaart === FAKTURAART.faktura)
    .filter((f) => kreditnota.kreditForFakturanummer
      ? f.fakturanummer === kreditnota.kreditForFakturanummer
      : f.leverandoerId === kreditnota.leverandoerId)
    .map((f) => ({ fakturaId: f.fakturaId, kræverManuelKontrol: true }));
}

export function kontrolleretOmkostning(fakturaer) {
  return fakturaer
    .filter((f) => f.kontrolstatus === KONTROL_STATUS.kontrolleret)
    .reduce((sum, f) => sum + (Number.isSafeInteger(f.nettoOere) ? f.nettoOere : 0), 0);
}

export function validérKontrolregler(regler = []) {
  const prioriteter = new Set();
  for (const regel of regler) {
    if (!Number.isInteger(regel.prioritet) || regel.prioritet < 1 || prioriteter.has(regel.prioritet)) {
      return { ok: false, fejl: "CONTROL_RULE_PRIORITY_INVALID" };
    }
    prioriteter.add(regel.prioritet);
    if (!Array.isArray(regel.kontrollanter) || !regel.kontrollanter.length) {
      return { ok: false, fejl: "CONTROL_RULE_REVIEWERS_REQUIRED" };
    }
    if (regel.antalKontrollanter !== 1 && regel.antalKontrollanter !== 2) {
      return { ok: false, fejl: "CONTROL_RULE_REVIEWER_COUNT_INVALID" };
    }
  }
  return { ok: true, regler: [...regler].sort((a, b) => a.prioritet - b.prioritet) };
}

function normaliserMailadresse(værdi) {
  const mail = tekst(værdi)?.toLocaleLowerCase("en-US") || null;
  return mail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail) ? mail : null;
}

function validérAttachmentgraenser(maksAntalVedhaeftninger, maksBytesPrFil) {
  return Number.isSafeInteger(maksAntalVedhaeftninger) && maksAntalVedhaeftninger > 0
    && maksAntalVedhaeftninger <= 100
    && Number.isSafeInteger(maksBytesPrFil) && maksBytesPrFil > 0
    && maksBytesPrFil <= MAKS_LOKAL_FILSTOERRELSE;
}

export function bygVeyroMailKontrakt({
  tenantId,
  routeId,
  kanaltype,
  registreredeAfsendere = [],
  ukendtAfsender = "afvis",
  aktiveretMs,
  maksAntalVedhaeftninger = 20,
  maksBytesPrFil = MAKS_LOKAL_FILSTOERRELSE,
} = {}) {
  const afsendere = liste(registreredeAfsendere).map(normaliserMailadresse);
  if (!tekst(tenantId)) return { ok: false, fejl: "MAIL_TENANT_REQUIRED", kontrakt: null };
  if (!tekst(routeId)) return { ok: false, fejl: "MAIL_ROUTE_REQUIRED", kontrakt: null };
  if (kanaltype !== INTAKE_KILDE.veyroMail) {
    return { ok: false, fejl: "MAIL_CHANNEL_INVALID", kontrakt: null };
  }
  if (!gyldigTid(aktiveretMs)) return { ok: false, fejl: "MAIL_ACTIVATION_TIME_INVALID", kontrakt: null };
  if (!Array.isArray(registreredeAfsendere) || !afsendere.length || afsendere.some((mail) => !mail)
      || new Set(afsendere).size !== afsendere.length) {
    return { ok: false, fejl: "MAIL_REGISTERED_SENDERS_INVALID", kontrakt: null };
  }
  if (!["afvis", "karantaene"].includes(ukendtAfsender)) {
    return { ok: false, fejl: "MAIL_UNKNOWN_SENDER_POLICY_INVALID", kontrakt: null };
  }
  if (!validérAttachmentgraenser(maksAntalVedhaeftninger, maksBytesPrFil)) {
    return { ok: false, fejl: "MAIL_ATTACHMENT_LIMITS_INVALID", kontrakt: null };
  }
  return { ok: true, fejl: null, kontrakt: frys({
    tenantId: tenantId.trim(),
    routeId: routeId.trim(),
    kanaltype,
    aktiveretMs,
    registreredeAfsendere: frys(afsendere),
    ukendtAfsender,
    maksAntalVedhaeftninger,
    maksBytesPrFil,
    routingErIkkeAutentifikation: true,
    kræverProviderSignatur: true,
    implementeret: false,
  }) };
}

export function vurderVeyroAfsender(kontrakt, afsender) {
  const normaliseret = normaliserMailadresse(afsender);
  if (!kontrakt || !normaliseret) return { handling: "afvis", årsag: "ugyldig-afsender" };
  if (kontrakt.registreredeAfsendere.includes(normaliseret)) {
    return { handling: "accepter", årsag: "registreret-afsender" };
  }
  return kontrakt.ukendtAfsender === "karantaene"
    ? { handling: "karantaene", årsag: "ukendt-afsender" }
    : { handling: "afvis", årsag: "ukendt-afsender" };
}

export function bygMailboxKontrakt({
  tenantId,
  routeId,
  kanaltype,
  aktiveretMs,
  mapper = [],
  registreredeAfsendere = [],
  ukendtAfsender = "afvis",
  maksAntalVedhaeftninger = 20,
  maksBytesPrFil = MAKS_LOKAL_FILSTOERRELSE,
} = {}) {
  const rensedeMapper = liste(mapper).map(tekst);
  const afsendere = liste(registreredeAfsendere).map(normaliserMailadresse);
  if (!tekst(tenantId)) return { ok: false, fejl: "MAIL_TENANT_REQUIRED", kontrakt: null };
  if (!tekst(routeId)) return { ok: false, fejl: "MAIL_ROUTE_REQUIRED", kontrakt: null };
  if (kanaltype !== INTAKE_KILDE.mailbox) {
    return { ok: false, fejl: "MAIL_CHANNEL_INVALID", kontrakt: null };
  }
  if (!gyldigTid(aktiveretMs)) return { ok: false, fejl: "MAIL_ACTIVATION_TIME_INVALID", kontrakt: null };
  if (!Array.isArray(mapper) || !rensedeMapper.length || rensedeMapper.some((mappe) => !mappe)) {
    return { ok: false, fejl: "MAILBOX_FOLDERS_INVALID", kontrakt: null };
  }
  if (!Array.isArray(registreredeAfsendere) || afsendere.some((mail) => !mail)
      || !["afvis", "karantaene"].includes(ukendtAfsender)) {
    return { ok: false, fejl: "MAIL_SENDER_POLICY_INVALID", kontrakt: null };
  }
  if (!validérAttachmentgraenser(maksAntalVedhaeftninger, maksBytesPrFil)) {
    return { ok: false, fejl: "MAIL_ATTACHMENT_LIMITS_INVALID", kontrakt: null };
  }
  return { ok: true, fejl: null, kontrakt: frys({
    tenantId: tenantId.trim(),
    routeId: routeId.trim(),
    kanaltype,
    aktiveretMs,
    mapper: frys(rensedeMapper),
    registreredeAfsendere: frys(afsendere),
    ukendtAfsender,
    maksAntalVedhaeftninger,
    maksBytesPrFil,
    kunNyereEndAktivering: true,
    ændrerMailbox: false,
    gemmerRåMailtekst: false,
    idempotens: frys(["stabilt-mail-id", "filhash"]),
    nødvendigeHeaders: frys([
      "afsender", "modtager", "tidspunkt", "emne", "mail-id", "filnavn", "filhash",
    ]),
    implementeret: false,
  }) };
}

export function klassificérMailMedFlereFiler(filer = []) {
  const mulige = filer.filter((f) => TILLADTE_FILENDELSER.some((endelse) =>
    String(f.filnavn || "").toLowerCase().endsWith(endelse)));
  return mulige.length > 1
    ? {
      status: INTAKE_STATUS.manuel,
      somEnIntakeSag: true,
      fejlkode: TEKNISK_FEJLKODE.flereMailfiler,
      filer: mulige,
    }
    : { status: INTAKE_STATUS.afventerAflæsning, somEnIntakeSag: true, fejlkode: null, filer: mulige };
}

export function bygMailbundle({ mailbundleId, tenantId, kildeId, filer = [] } = {}) {
  if (!tekst(mailbundleId) || !tekst(tenantId) || !tekst(kildeId)
      || !Array.isArray(filer) || filer.length < 2
      || !filer.every((fil) => tekst(fil.filId) && tekst(fil.filnavn))) {
    return { ok: false, fejl: "MAIL_BUNDLE_INVALID", bundle: null };
  }
  if (new Set(filer.map((fil) => fil.filId)).size !== filer.length) {
    return { ok: false, fejl: "MAIL_BUNDLE_FILE_ID_DUPLICATE", bundle: null };
  }
  return { ok: true, fejl: null, bundle: {
    mailbundleId: mailbundleId.trim(),
    tenantId: tenantId.trim(),
    kildeId: kildeId.trim(),
    status: INTAKE_STATUS.manuel,
    filer: filer.map((fil) => ({
      filId: fil.filId.trim(),
      filnavn: fil.filnavn.trim(),
      rolle: MAILFIL_ROLLE.uafklaret,
    })),
    historik: [],
  } };
}

export function klassificérMailbundleFil(bundle, filId, rolle, kontekst = {}) {
  const handling = validérHandlingskontekst(kontekst);
  if (!handling.ok) return { ok: false, fejl: handling.fejl, bundle };
  if (bundle?.tenantId !== kontekst.aktuelTenantId) {
    return { ok: false, fejl: TEKNISK_FEJLKODE.crossTenant, bundle };
  }
  if (!ALLE_MAILFIL_ROLLER.has(rolle) || rolle === MAILFIL_ROLLE.uafklaret) {
    return { ok: false, fejl: "MAIL_FILE_ROLE_INVALID", bundle };
  }
  if (!bundle.filer.some((fil) => fil.filId === filId)) {
    return { ok: false, fejl: "MAIL_BUNDLE_FILE_NOT_FOUND", bundle };
  }
  return { ok: true, fejl: null, bundle: {
    ...bundle,
    filer: bundle.filer.map((fil) => fil.filId === filId ? { ...fil, rolle } : fil),
    historik: [...liste(bundle.historik), {
      handling: "mailfil-klassificeret",
      filId,
      rolle,
      brugerId: kontekst.brugerId.trim(),
      tidspunktMs: kontekst.tidspunktMs,
    }],
  } };
}

export function opdelMailbundleTilKladder(bundle, kontekst = {}) {
  const handling = validérHandlingskontekst(kontekst);
  if (!handling.ok) return { ok: false, fejl: handling.fejl, kladder: [] };
  if (bundle?.tenantId !== kontekst.aktuelTenantId) {
    return { ok: false, fejl: TEKNISK_FEJLKODE.crossTenant, kladder: [] };
  }
  if (bundle.filer.some((fil) => fil.rolle === MAILFIL_ROLLE.uafklaret)) {
    return { ok: false, fejl: "MAIL_BUNDLE_CLASSIFICATION_INCOMPLETE", kladder: [] };
  }
  const fakturafiler = bundle.filer.filter((fil) => fil.rolle === MAILFIL_ROLLE.faktura);
  if (!fakturafiler.length) return { ok: false, fejl: "MAIL_BUNDLE_INVOICE_REQUIRED", kladder: [] };
  const bilagFilIder = bundle.filer.filter((fil) => fil.rolle === MAILFIL_ROLLE.bilag)
    .map((fil) => fil.filId);
  return {
    ok: true,
    fejl: null,
    kladder: fakturafiler.map((fil, index) => ({
      kladdeId: `${bundle.mailbundleId}-kladde-${index + 1}`,
      tenantId: bundle.tenantId,
      oprindeligMailbundleId: bundle.mailbundleId,
      fakturaFilId: fil.filId,
      bilagFilIder: [...bilagFilIder],
      oprettetAf: kontekst.brugerId.trim(),
      oprettetMs: kontekst.tidspunktMs,
      lokalPrototype: true,
    })),
  };
}

export function bygOpbevaringsKontrakt({
  land = "DK",
  dokumenttype = "faktura",
  minimumTilMs,
  valgtTilMs,
  juridiskSpærring = false,
  planlagtSletningMs = null,
  slettetMs = null,
} = {}) {
  if (!Number.isFinite(minimumTilMs) || !Number.isFinite(valgtTilMs) || valgtTilMs < minimumTilMs) {
    return { ok: false, fejl: "RETENTION_PERIOD_INVALID" };
  }
  return {
    ok: true,
    kontrakt: {
      land, dokumenttype, minimumTilMs, valgtTilMs, juridiskSpærring,
      planlagtSletningMs, slettetMs, automatiskSletningImplementeret: false,
    },
  };
}

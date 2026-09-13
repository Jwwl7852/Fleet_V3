/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/unitbooking-import.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/*
 * Ren domænekerne til UNIT bookingimport.
 *
 * Dokumenttekst er DATA. Funktionerne fortolker kun kendte feltnavne og
 * værdier; de udfører aldrig instruktioner fra materialet. Pasform og
 * tilgængelighed beregnes deterministisk her og genkontrolleres på serveren.
 */
import { konflikter } from "./unitbooking.js";

export const UNIT_IMPORT_VERSION = 1;
export const UNIT_IMPORT_STATUS = Object.freeze({
  gennemgang: "gennemgang",
  klar: "klar-til-forslag",
  bekraeftet: "bekraeftet",
});

export const UNIT_IMPORT_FILTYPE = Object.freeze({
  eml: "eml", msg: "msg", pdf: "pdf", xlsx: "xlsx", csv: "csv",
  billede: "billede", tekst: "tekst",
});

export const UNIT_IMPORT_TILLADTE_ENDELSER = Object.freeze([
  ".eml", ".msg", ".pdf", ".xlsx", ".csv", ".png", ".jpg", ".jpeg",
]);

export const UNIT_IMPORT_MAKS_BYTES = 25 * 1024 * 1024;
export const UNIT_IMPORT_MAKS_TEKST = 200_000;
export const UNIT_IMPORT_MAKS_LINJER = 50;

export const ORIENTERING = Object.freeze({
  lbH: { id: "lbH", label: "Opretstående", akser: [0, 1, 2] },
  blH: { id: "blH", label: "Opretstående · drejet 90°", akser: [1, 0, 2] },
  lhB: { id: "lhB", label: "Lagt på siden", akser: [0, 2, 1] },
  hlB: { id: "hlB", label: "Lagt på siden · drejet", akser: [2, 0, 1] },
  bhL: { id: "bhL", label: "Lagt på enden", akser: [1, 2, 0] },
  hbL: { id: "hbL", label: "Lagt på enden · drejet", akser: [2, 1, 0] },
});

const trim = (v) => typeof v === "string" ? v.trim() : "";
const tekstEllerNull = (v, max = 300) => {
  const t = trim(v);
  return t ? t.slice(0, max) : null;
};

export function filtypeFraNavn(filnavn = "", mime = "") {
  const navn = String(filnavn).toLowerCase();
  const m = String(mime).toLowerCase();
  if (navn.endsWith(".eml") || m === "message/rfc822") return UNIT_IMPORT_FILTYPE.eml;
  if (navn.endsWith(".msg") || m === "application/vnd.ms-outlook") return UNIT_IMPORT_FILTYPE.msg;
  if (navn.endsWith(".pdf") || m === "application/pdf") return UNIT_IMPORT_FILTYPE.pdf;
  if (navn.endsWith(".xlsx") || m === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return UNIT_IMPORT_FILTYPE.xlsx;
  if (navn.endsWith(".csv") || m === "text/csv") return UNIT_IMPORT_FILTYPE.csv;
  if (/\.(png|jpe?g)$/.test(navn) || /^image\/(png|jpeg)$/.test(m)) return UNIT_IMPORT_FILTYPE.billede;
  return null;
}

export function valideImportFil({ filnavn, mimeType, stoerrelse } = {}) {
  const fejl = {};
  const filtype = filtypeFraNavn(filnavn, mimeType);
  if (!filtype) fejl.filtype = "Vælg .eml, .msg, PDF, .xlsx, .csv eller et billede.";
  if (!Number.isSafeInteger(stoerrelse) || stoerrelse <= 0) fejl.stoerrelse = "Filen er tom eller ugyldig.";
  else if (stoerrelse > UNIT_IMPORT_MAKS_BYTES) fejl.stoerrelse = "Filen må højst være 25 MB.";
  return { ok: Object.keys(fejl).length === 0, fejl, filtype };
}

/** Dansk taltekst til tal. Tusindtalsseparatorer accepteres kun entydigt. */
export function danskTal(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = trim(v).replace(/\s/g, "");
  if (!t || !/^-?\d+(?:[.,]\d+)?$/.test(t)) return null;
  if (t.includes(",") && t.includes(".")) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function maalTilMm(v, enhed) {
  const n = danskTal(v);
  const e = trim(enhed).toLowerCase();
  if (n === null || n <= 0) return { mm: null, fejl: "Målet skal være et positivt tal." };
  if (!e) return { mm: null, fejl: "Måleenhed mangler og skal vælges." };
  const faktor = e === "mm" ? 1 : e === "cm" ? 10 : e === "m" ? 1000 : null;
  if (!faktor) return { mm: null, fejl: `Måleenheden “${enhed}” understøttes ikke.` };
  return { mm: Math.round(n * faktor), fejl: null };
}

export const mmTilCmTekst = (mm) => Number.isFinite(mm)
  ? String(mm / 10).replace(".", ",") : "";

function gyldigIsoDato(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [aar, maaned, dag] = v.split("-").map(Number);
  const d = new Date(Date.UTC(aar, maaned - 1, dag));
  return d.getUTCFullYear() === aar && d.getUTCMonth() === maaned - 1 && d.getUTCDate() === dag;
}

/** Dato aflæses kun når formatet er entydigt. 01/02/26 bliver markeret uklart. */
export function sikkerDato(v) {
  const t = trim(v);
  if (!t) return { iso: null, fejl: "Dato mangler." };
  if (gyldigIsoDato(t)) return { iso: t, fejl: null };
  const m = t.match(/^(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})$/);
  if (!m) return { iso: null, fejl: "Datoen er tvetydig. Vælg datoen manuelt." };
  const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return gyldigIsoDato(iso)
    ? { iso, fejl: null }
    : { iso: null, fejl: "Datoen findes ikke." };
}

export function isoTilUtcMs(iso) {
  return gyldigIsoDato(iso) ? Date.parse(`${iso}T00:00:00.000Z`) : null;
}

function kilde(felt, tekst, reference, sikker = true) {
  return { felt, udsnit: trim(tekst).slice(0, 240), reference, sikker };
}

function delLinje(linje, separator = ";") {
  const felter = [];
  let felt = "";
  let citeret = false;
  for (let i = 0; i < linje.length; i += 1) {
    const tegn = linje[i];
    if (tegn === '"') {
      if (citeret && linje[i + 1] === '"') { felt += '"'; i += 1; }
      else citeret = !citeret;
    } else if (tegn === separator && !citeret) {
      felter.push(felt.trim()); felt = "";
    } else felt += tegn;
  }
  felter.push(felt.trim());
  return felter;
}

const HEADER_ALIASES = Object.freeze({
  objekt: ["objekt", "beskrivelse", "genstand", "item"],
  laengde: ["længde", "laengde", "length", "l"],
  bredde: ["bredde", "width", "b"],
  hoejde: ["højde", "hoejde", "height", "h"],
  enhed: ["enhed", "måleenhed", "maaleenhed", "unit"],
  type: ["type", "kassetype", "enhedstype"],
  undertype: ["undertype", "subtype"],
  orientering: ["orientering", "håndtering", "haandtering"],
});

function headerNoegle(v) {
  const n = trim(v).toLowerCase();
  return Object.entries(HEADER_ALIASES).find(([, alias]) => alias.includes(n))?.[0] || null;
}

export function udtraekCsv(tekst) {
  const raekker = String(tekst || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((x) => trim(x));
  if (raekker.length < 2) return { linjer: [], kilder: [], advarsler: ["CSV-filen indeholder ingen datarækker."] };
  const separator = (raekker[0].match(/;/g) || []).length >= (raekker[0].match(/,/g) || []).length ? ";" : ",";
  const headers = delLinje(raekker[0], separator).map(headerNoegle);
  const linjer = [];
  const kilder = [];
  for (let r = 1; r < raekker.length && linjer.length < UNIT_IMPORT_MAKS_LINJER; r += 1) {
    const celler = delLinje(raekker[r], separator);
    const post = Object.fromEntries(headers.map((h, i) => [h, celler[i]]).filter(([h]) => h));
    const enhed = trim(post.enhed);
    const maal = ["laengde", "bredde", "hoejde"].map((a) => maalTilMm(post[a], enhed));
    const id = `linje-${r}`;
    linjer.push({
      id,
      objekt: tekstEllerNull(post.objekt),
      laengdeMm: maal[0].mm,
      breddeMm: maal[1].mm,
      hoejdeMm: maal[2].mm,
      maaleenhedKilde: enhed || null,
      type: tekstEllerNull(post.type, 40),
      undertype: tekstEllerNull(post.undertype, 40),
      orienteringsnote: tekstEllerNull(post.orientering),
      maaIkkeVendes: /må ikke vendes|maa ikke vendes|opretstående|opretstaaende/i.test(post.orientering || ""),
      tilladAndreOrienteringer: false,
      polstringLaengdePrSideMm: 0,
      polstringBreddePrSideMm: 0,
      polstringHoejdePrSideMm: 0,
    });
    headers.forEach((h, c) => { if (h && celler[c]) kilder.push(kilde(`${id}.${h}`, celler[c], `Række ${r + 1}, celle ${c + 1}`)); });
  }
  const advarsler = [];
  if (!headers.includes("enhed")) advarsler.push("Måleenhed mangler i CSV og skal vælges manuelt.");
  if (!headers.includes("laengde") || !headers.includes("bredde") || !headers.includes("hoejde")) {
    advarsler.push("CSV mangler en eller flere målkolonner.");
  }
  return { linjer, kilder, advarsler };
}

function findFelt(tekst, navne) {
  const moenster = new RegExp(`^(?:${navne.join("|")})\\s*[:=-]\\s*(.+)$`, "im");
  const m = String(tekst || "").match(moenster);
  if (!m) return null;
  const linje = String(tekst).slice(0, m.index).split(/\r?\n/).length;
  return { vaerdi: trim(m[1]), reference: `Linje ${linje}`, udsnit: trim(m[0]) };
}

function findMaal(tekst) {
  const m = String(tekst || "").match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b/i);
  if (!m) return null;
  const linje = String(tekst).slice(0, m.index).split(/\r?\n/).length;
  return { vaerdier: [m[1], m[2], m[3]], enhed: m[4].toLowerCase(), reference: `Linje ${linje}`, udsnit: m[0] };
}

/** Forsigtig, deterministisk aflæsning af indsat mailtekst eller .eml-tekst. */
export function udtraekBookingtekst(tekst) {
  const original = String(tekst || "").slice(0, UNIT_IMPORT_MAKS_TEKST);
  const felter = {
    kunde: findFelt(original, ["kunde", "customer"]),
    kontaktperson: findFelt(original, ["kontakt(?:person)?", "contact"]),
    eksternReference: findFelt(original, ["sag(?:snummer)?", "booking(?:reference)?", "reference"]),
    beskrivelse: findFelt(original, ["opgave", "objekt", "beskrivelse", "description"]),
    fraDato: findFelt(original, ["fra(?:dato)?", "start(?:dato)?", "from"]),
    tilDato: findFelt(original, ["til(?:dato)?", "slut(?:dato)?", "to"]),
    klargoerDato: findFelt(original, ["klargør(?:es)?(?: senest)?", "klargoer(?:es)?(?: senest)?", "ready by"]),
    type: findFelt(original, ["kassetype", "enhedstype", "ønsket type", "oensket type"]),
    undertype: findFelt(original, ["undertype"]),
    antal: findFelt(original, ["antal(?: objekter| enheder)?", "quantity"]),
    haandtering: findFelt(original, ["håndtering", "haandtering", "orientering", "handling"]),
  };
  const maal = findMaal(original);
  const fra = felter.fraDato ? sikkerDato(felter.fraDato.vaerdi) : { iso: null, fejl: "Fra-dato mangler." };
  const til = felter.tilDato ? sikkerDato(felter.tilDato.vaerdi) : { iso: null, fejl: "Til-dato mangler." };
  const klar = felter.klargoerDato ? sikkerDato(felter.klargoerDato.vaerdi) : { iso: null, fejl: null };
  const antal = felter.antal ? danskTal(felter.antal.vaerdi) : 1;
  const antalLinjer = Number.isSafeInteger(antal) && antal > 0 && antal <= UNIT_IMPORT_MAKS_LINJER ? antal : 1;
  const haandtering = felter.haandtering?.vaerdi || "";
  const basis = {
    objekt: tekstEllerNull(felter.beskrivelse?.vaerdi),
    laengdeMm: maal ? maalTilMm(maal.vaerdier[0], maal.enhed).mm : null,
    breddeMm: maal ? maalTilMm(maal.vaerdier[1], maal.enhed).mm : null,
    hoejdeMm: maal ? maalTilMm(maal.vaerdier[2], maal.enhed).mm : null,
    maaleenhedKilde: maal?.enhed || null,
    type: tekstEllerNull(felter.type?.vaerdi, 40),
    undertype: tekstEllerNull(felter.undertype?.vaerdi, 40),
    orienteringsnote: tekstEllerNull(haandtering),
    maaIkkeVendes: /må ikke vendes|maa ikke vendes|opretstående|opretstaaende/i.test(haandtering),
    tilladAndreOrienteringer: false,
    polstringLaengdePrSideMm: 0,
    polstringBreddePrSideMm: 0,
    polstringHoejdePrSideMm: 0,
  };
  const linjer = Array.from({ length: antalLinjer }, (_, i) => ({ ...basis, id: `linje-${i + 1}` }));
  const kilder = [];
  for (const [felt, fund] of Object.entries(felter)) {
    if (fund) kilder.push(kilde(felt, fund.udsnit, fund.reference));
  }
  if (maal) kilder.push(kilde("linje-1.maal", maal.udsnit, maal.reference));
  const advarsler = [];
  if (!felter.kunde) advarsler.push("Kunde mangler.");
  if (!felter.eksternReference) advarsler.push("Sagsnummer eller ekstern reference mangler.");
  if (fra.fejl) advarsler.push(fra.fejl);
  if (til.fejl) advarsler.push(til.fejl);
  if (!maal) advarsler.push("Objektets længde, bredde og højde mangler.");
  if (felter.antal && antalLinjer === 1 && danskTal(felter.antal.vaerdi) !== 1) {
    advarsler.push("Antallet er uklart. Opret de enkelte objekter som separate linjer.");
  }
  return {
    felter: {
      kunde: tekstEllerNull(felter.kunde?.vaerdi, 160),
      kontaktperson: tekstEllerNull(felter.kontaktperson?.vaerdi, 160),
      eksternReference: tekstEllerNull(felter.eksternReference?.vaerdi, 80),
      beskrivelse: tekstEllerNull(felter.beskrivelse?.vaerdi),
      fraDato: fra.iso,
      tilDato: til.iso,
      klargoerDato: klar.iso,
      haandtering: tekstEllerNull(haandtering),
    },
    linjer, kilder, advarsler,
    parser: "deterministisk-tekst-v1",
  };
}

export function pladskrav(linje = {}) {
  const maal = [linje.laengdeMm, linje.breddeMm, linje.hoejdeMm];
  if (!maal.every((v) => Number.isSafeInteger(v) && v > 0)) return null;
  const polstring = [
    linje.polstringLaengdePrSideMm,
    linje.polstringBreddePrSideMm,
    linje.polstringHoejdePrSideMm,
  ].map((v) => Number.isSafeInteger(v) && v >= 0 ? v : 0);
  return {
    laengdeMm: maal[0] + 2 * polstring[0],
    breddeMm: maal[1] + 2 * polstring[1],
    hoejdeMm: maal[2] + 2 * polstring[2],
  };
}

export function tilladteOrienteringer(linje = {}) {
  const standard = [ORIENTERING.lbH, ORIENTERING.blH];
  if (linje.maaIkkeVendes || !linje.tilladAndreOrienteringer) return standard;
  return Object.values(ORIENTERING);
}

function orienter(krav, orientering) {
  const v = [krav.laengdeMm, krav.breddeMm, krav.hoejdeMm];
  const [l, b, h] = orientering.akser.map((i) => v[i]);
  return { laengdeMm: l, breddeMm: b, hoejdeMm: h };
}

function indvendigeMaal(kasse = {}) {
  const maal = {
    laengdeMm: kasse.indvendigLaengdeMm,
    breddeMm: kasse.indvendigBreddeMm,
    hoejdeMm: kasse.indvendigHoejdeMm,
  };
  return Object.values(maal).every((v) => Number.isSafeInteger(v) && v > 0) ? maal : null;
}

function volum(mm = {}) { return mm.laengdeMm * mm.breddeMm * mm.hoejdeMm; }

export function vurderKasse(linje, kasse, udlaan = [], periode = {}) {
  const krav = pladskrav(linje);
  if (!krav) return { gyldig: false, grund: "Objektets mål eller polstring er ikke bekræftet." };
  const indvendig = indvendigeMaal(kasse);
  if (!indvendig) return { gyldig: false, grund: "Enheden har ikke bekræftede indvendige mål." };
  if (kasse.status === "udeAfDrift") return { gyldig: false, grund: "Enheden er ude af drift." };
  if (linje.type && kasse.type !== linje.type) return { gyldig: false, grund: `Enheden er type ${kasse.type}, ikke ${linje.type}.` };
  if (linje.undertype && kasse.undertype !== linje.undertype) return { gyldig: false, grund: "Enhedens undertype opfylder ikke kravet." };
  if (!Number.isFinite(periode.fra) || !Number.isFinite(periode.til)) {
    return { gyldig: false, grund: "Perioden er ikke bekræftet." };
  }
  const stoed = konflikter(udlaan, { kasseId: kasse.id, fra: periode.fra, til: periode.til });
  if (stoed.length) return { gyldig: false, grund: `Optaget i perioden af sag ${stoed[0].sagsnummer}.` };
  for (const o of tilladteOrienteringer(linje)) {
    const anvendt = orienter(krav, o);
    const rest = {
      laengdeMm: indvendig.laengdeMm - anvendt.laengdeMm,
      breddeMm: indvendig.breddeMm - anvendt.breddeMm,
      hoejdeMm: indvendig.hoejdeMm - anvendt.hoejdeMm,
    };
    if (Object.values(rest).every((v) => v >= 0)) {
      return {
        gyldig: true, grund: null, orientering: o.id, orienteringLabel: o.label,
        krav: anvendt, indvendig, rest,
        overskudsvolumenMm3: volum(indvendig) - volum(anvendt),
      };
    }
  }
  return { gyldig: false, grund: "Den nødvendige plads passer ikke i de tilladte orienteringer." };
}

export function foreslaaKasser(linje, kasser = [], udlaan = [], periode = {}) {
  const alle = Array.isArray(kasser) ? kasser : Object.entries(kasser || {}).map(([id, k]) => ({ id, ...k }));
  const vurderinger = alle.map((kasse) => ({ kasse, vurdering: vurderKasse(linje, kasse, udlaan, periode) }));
  return {
    forslag: vurderinger.filter((x) => x.vurdering.gyldig)
      .sort((a, b) => a.vurdering.overskudsvolumenMm3 - b.vurdering.overskudsvolumenMm3
        || a.kasse.id.localeCompare(b.kasse.id, "da")),
    afviste: vurderinger.filter((x) => !x.vurdering.gyldig),
  };
}

export function valideImportKladde(kladde = {}) {
  const fejl = {};
  if (!trim(kladde.kunde)) fejl.kunde = "Kunde skal gennemgås og udfyldes.";
  if (!trim(kladde.eksternReference)) fejl.eksternReference = "Sagsnummer eller ekstern reference skal udfyldes.";
  if (!gyldigIsoDato(kladde.fraDato)) fejl.fraDato = "Vælg en entydig fra-dato.";
  if (!gyldigIsoDato(kladde.tilDato)) fejl.tilDato = "Vælg en entydig til-dato.";
  if (gyldigIsoDato(kladde.fraDato) && gyldigIsoDato(kladde.tilDato)
      && kladde.tilDato < kladde.fraDato) fejl.tilDato = "Til-dato kan ikke ligge før fra-dato.";
  if (kladde.klargoerDato && (!gyldigIsoDato(kladde.klargoerDato)
      || (gyldigIsoDato(kladde.fraDato) && kladde.klargoerDato > kladde.fraDato))) {
    fejl.klargoerDato = "Klargøringsfristen skal være en gyldig dato senest på fra-datoen.";
  }
  if (!Array.isArray(kladde.linjer) || !kladde.linjer.length) fejl.linjer = "Tilføj mindst ét objekt.";
  else if (kladde.linjer.length > UNIT_IMPORT_MAKS_LINJER) fejl.linjer = "En import kan højst have 50 objektlinjer.";
  (kladde.linjer || []).forEach((linje, i) => {
    const prefix = `linjer.${i}`;
    if (!trim(linje.objekt)) fejl[`${prefix}.objekt`] = "Beskriv objektet.";
    if (!pladskrav(linje)) fejl[`${prefix}.maal`] = "Bekræft længde, bredde, højde og polstring.";
    for (const [felt, v] of Object.entries({
      polstringLaengdePrSideMm: linje.polstringLaengdePrSideMm,
      polstringBreddePrSideMm: linje.polstringBreddePrSideMm,
      polstringHoejdePrSideMm: linje.polstringHoejdePrSideMm,
    })) if (!Number.isSafeInteger(v) || v < 0) fejl[`${prefix}.${felt}`] = "Polstring pr. side skal være 0 eller mere.";
  });
  return fejl;
}

export function rensImportKladde(kladde = {}) {
  return {
    kunde: tekstEllerNull(kladde.kunde, 160),
    kontaktperson: tekstEllerNull(kladde.kontaktperson, 160),
    eksternReference: tekstEllerNull(kladde.eksternReference, 80),
    beskrivelse: tekstEllerNull(kladde.beskrivelse),
    fraDato: trim(kladde.fraDato) || null,
    tilDato: trim(kladde.tilDato) || null,
    klargoerDato: trim(kladde.klargoerDato) || null,
    haandtering: tekstEllerNull(kladde.haandtering),
    linjer: (kladde.linjer || []).slice(0, UNIT_IMPORT_MAKS_LINJER).map((l, i) => ({
      id: trim(l.id) || `linje-${i + 1}`,
      objekt: tekstEllerNull(l.objekt),
      laengdeMm: Number.isSafeInteger(l.laengdeMm) ? l.laengdeMm : null,
      breddeMm: Number.isSafeInteger(l.breddeMm) ? l.breddeMm : null,
      hoejdeMm: Number.isSafeInteger(l.hoejdeMm) ? l.hoejdeMm : null,
      maaleenhedKilde: tekstEllerNull(l.maaleenhedKilde, 10),
      type: tekstEllerNull(l.type, 40),
      undertype: tekstEllerNull(l.undertype, 40),
      orienteringsnote: tekstEllerNull(l.orienteringsnote),
      maaIkkeVendes: l.maaIkkeVendes === true,
      tilladAndreOrienteringer: l.maaIkkeVendes === true ? false : l.tilladAndreOrienteringer === true,
      polstringLaengdePrSideMm: Number.isSafeInteger(l.polstringLaengdePrSideMm) ? l.polstringLaengdePrSideMm : 0,
      polstringBreddePrSideMm: Number.isSafeInteger(l.polstringBreddePrSideMm) ? l.polstringBreddePrSideMm : 0,
      polstringHoejdePrSideMm: Number.isSafeInteger(l.polstringHoejdePrSideMm) ? l.polstringHoejdePrSideMm : 0,
      valgtKasseId: tekstEllerNull(l.valgtKasseId, 40),
    })),
  };
}

export function kanoniskImportMateriale({ sha256, originalTekst, filnavn } = {}) {
  if (/^[a-f0-9]{64}$/i.test(String(sha256 || ""))) return `sha256:${String(sha256).toLowerCase()}`;
  const tekst = String(originalTekst || "").replace(/\r\n/g, "\n").trim().toLowerCase();
  if (tekst) return `tekst:${tekst}`;
  return `fil:${trim(filnavn).toLowerCase()}`;
}

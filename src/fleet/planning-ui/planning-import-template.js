import { KOLONNEFELTER } from "../planning-input/index.js";

export const IMPORTSKABELON_FILNAVN = "Veyro_Planning_Importskabelon_v1.csv";
export const IMPORTSKABELON_SEPARATOR = ";";
export const IMPORTSKABELON_ENCODING = "UTF-8 med BOM";

const FELTER = Object.freeze([
  ["samletOpgaveId", "Samlet opgave-ID", false, "Udfyldes kun når flere rækker er stop i samme opgave"],
  ["stopId", "Stop-ID", false, "Påkrævet i en flerstop-opgave"],
  ["stopRaekkefoelge", "Stoprækkefølge", false, "Positivt heltal; påkrævet i en flerstop-opgave"],
  ["eksternReference", "Ekstern reference", true, "Stabil ekstern opgavereference"],
  ["navn", "Opgavenavn", true, "Fri tekst"], ["type", "Opgavetype", false, "Fri tekst"],
  ["kunde", "Kunde", true, "Fiktiv modtager eller virksomhedsreference"],
  ["adresse", "Adresse", true, "Tekst; geokodes ikke"], ["postnummer", "Postnummer", false, "Tekst"],
  ["by", "By", false, "Tekst"], ["land", "Land", true, "Landekode, fx DK"],
  ["dato", "Dato", true, "DD-MM-ÅÅÅÅ eller ÅÅÅÅ-MM-DD"],
  ["tidsform", "Tidsform", true, "Fast tidspunkt, Tidsvindue, Deadline eller Frit tidspunkt"],
  ["fastTid", "Fast tid", false, "TT:MM"], ["vindueFra", "Tidsvindue fra", false, "TT:MM"],
  ["vindueTil", "Tidsvindue til", false, "TT:MM"], ["deadline", "Deadline", false, "TT:MM"],
  ["varighed", "Stopvarighed", true, "Positive hele minutter, fx 30"],
  ["periodeart", "Bestillingsperiode", false, "DATO, DATO_TID, TIDSVINDUE, ISO_UGE, DATO_INTERVAL eller UDEN_DATO_OENSKE"],
  ["periodeniveau", "Periode-niveau", false, "OENSKET eller SKAL_OVERHOLDES"],
  ["oensketDato", "Ønsket dato", false, "DD-MM-ÅÅÅÅ eller ÅÅÅÅ-MM-DD"], ["oensketTid", "Ønsket tid", false, "TT:MM"],
  ["oensketVindueFra", "Ønsket vindue fra", false, "TT:MM"], ["oensketVindueTil", "Ønsket vindue til", false, "TT:MM"],
  ["oensketUge", "Ønsket uge", false, "ISO-ugenummer 1–53"], ["oensketUgeAar", "Ønsket ugeår", false, "Firecifret årstal"],
  ["periodeFra", "Periode fra", false, "DD-MM-ÅÅÅÅ eller ÅÅÅÅ-MM-DD"], ["periodeTil", "Periode til", false, "DD-MM-ÅÅÅÅ eller ÅÅÅÅ-MM-DD"],
  ["prioritet", "Prioritet", false, "AKUT, HOEJ, NORMAL eller LAV"],
  ["rutetype", "Rutetype", false, "Kundens eksisterende rutetype"],
  ["medarbejderRef", "Medarbejder", false, "Eksisterende typed reference"],
  ["koeretoejRef", "Køretøj", false, "Eksisterende typed reference"],
  ["kompetencer", "Kompetencer", false, "Kommaseparerede krav"],
  ["certifikater", "Certifikater", false, "Kommaseparerede krav"],
  ["udstyr", "Udstyr", false, "Kommaseparerede krav"], ["kapacitet", "Kapacitet", false, "Normaliseret krav"],
  ["notat", "Notat", false, "Fri tekst"],
  ["stoptype", "Stoptype", true, "BESOEG, LEVERING, AFHENTNING, SERVICE, KONTROL eller ANDET"],
  ["udfoerelsesskabelon", "Udførelsesskabelon", false, "Eksisterende skabelon-ID"],
  ["underskrift", "Underskrift", false, "JA eller NEJ"], ["billeder", "Billeder", false, "JA eller NEJ"],
  ["kundespoergsmaal", "Kundespørgsmål", false, "JA eller NEJ"], ["materialer", "Materialeregistrering", false, "JA eller NEJ"],
]);

export const STANDARD_IMPORTKOLONNER = Object.freeze(FELTER.map(([felt, overskrift, paakraevet, format]) => Object.freeze({ felt, overskrift, paakraevet, format })));

export function validerStandardImportkolonner() {
  const ukendte = STANDARD_IMPORTKOLONNER.filter(({ felt, overskrift }) => !KOLONNEFELTER[felt]?.includes(overskrift.toLocaleLowerCase("da-DK")));
  return { ok: ukendte.length === 0, ukendte };
}

function csvCelle(vaerdi) {
  const tekst = String(vaerdi ?? "");
  return /[;"\r\n]/.test(tekst) ? `"${tekst.replaceAll('"', '""')}"` : tekst;
}

const EKSEMPELRAEKKER = Object.freeze([
  { "Ekstern reference": "DEMO-ENKELT-001", Opgavenavn: "Fiktivt servicebesøg", Opgavetype: "Service", Kunde: "Demo-modtager 01", Adresse: "Testvej 1", Postnummer: "0000", By: "Demoby", Land: "DK", Dato: "18-05-2032", Tidsform: "Frit tidspunkt", Stopvarighed: "30", Bestillingsperiode: "ISO_UGE", "Periode-niveau": "OENSKET", "Ønsket uge": "20", "Ønsket ugeår": "2032", Prioritet: "NORMAL", Rutetype: "Service", Notat: "Syntetisk én-stop-eksempel", Stoptype: "SERVICE", Underskrift: "NEJ", Billeder: "NEJ", Kundespørgsmål: "NEJ", Materialeregistrering: "NEJ" },
  { "Samlet opgave-ID": "DEMO-FLERSTOP-001", "Stop-ID": "DEMO-STOP-A", Stoprækkefølge: "1", "Ekstern reference": "DEMO-TRANSPORT-001", Opgavenavn: "Fiktiv afhentning", Opgavetype: "Transport", Kunde: "Demo-modtager 02", Adresse: "Prøveallé 2", Postnummer: "0000", By: "Demoby", Land: "DK", Dato: "18-05-2032", Tidsform: "Tidsvindue", "Tidsvindue fra": "09:00", "Tidsvindue til": "10:00", Stopvarighed: "20", Bestillingsperiode: "DATO_INTERVAL", "Periode-niveau": "SKAL_OVERHOLDES", "Periode fra": "18-05-2032", "Periode til": "20-05-2032", Prioritet: "HOEJ", Rutetype: "Transport", Udstyr: "demo-lift", Notat: "Syntetisk afhentningsstop", Stoptype: "AFHENTNING", Underskrift: "NEJ", Billeder: "NEJ", Kundespørgsmål: "NEJ", Materialeregistrering: "NEJ" },
  { "Samlet opgave-ID": "DEMO-FLERSTOP-001", "Stop-ID": "DEMO-STOP-B", Stoprækkefølge: "2", "Ekstern reference": "DEMO-TRANSPORT-001", Opgavenavn: "Fiktiv levering", Opgavetype: "Transport", Kunde: "Demo-modtager 02", Adresse: "Eksempelvej 3", Postnummer: "0000", By: "Demoby", Land: "DK", Dato: "18-05-2032", Tidsform: "Deadline", Deadline: "12:00", Stopvarighed: "25", Bestillingsperiode: "DATO_INTERVAL", "Periode-niveau": "SKAL_OVERHOLDES", "Periode fra": "18-05-2032", "Periode til": "20-05-2032", Prioritet: "HOEJ", Rutetype: "Transport", Udstyr: "demo-lift", Notat: "Syntetisk leveringsstop", Stoptype: "LEVERING", Underskrift: "NEJ", Billeder: "NEJ", Kundespørgsmål: "NEJ", Materialeregistrering: "NEJ" },
]);

export function opretStandardImportCsv() {
  const overskrifter = STANDARD_IMPORTKOLONNER.map(({ overskrift }) => overskrift);
  const linjer = EKSEMPELRAEKKER.map((raekke) => overskrifter.map((overskrift) => csvCelle(raekke[overskrift] || "")).join(IMPORTSKABELON_SEPARATOR));
  return `\uFEFF${overskrifter.map(csvCelle).join(IMPORTSKABELON_SEPARATOR)}\r\n${linjer.join("\r\n")}\r\n`;
}

export function standardImportCsvDataUrl() {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(opretStandardImportCsv())}`;
}

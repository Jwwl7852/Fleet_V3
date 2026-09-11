import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  forslagErForældet, lokalAiChatRevision, oplysningerForSag, tekstfingeraftryk,
} from "../src/fleet/ejer-mail-v7-regler.js";

const oplysninger = [
  { id: "enheder", label: "Enheder", vaerdi: "25 enheder", tilstand: "oplyst_af_kunden", kilde: "Kundens mail" },
  { id: "pilotperiode", label: "Pilotperiode", vaerdi: "3 måneder", tilstand: "oplyst_af_kunden", kilde: "Kundens mail" },
  { id: "brugere", label: "Brugerlicenser", vaerdi: "5 brugere i alt", tilstand: "oplyst_af_kunden", kilde: "Kundens mail" },
  { id: "administratorer", label: "Administratoradgang", vaerdi: "2 af de 5 brugere", tilstand: "oplyst_af_kunden", kilde: "Kundens mail" },
  { id: "cvr", label: "CVR", vaerdi: "Ikke oplyst", tilstand: "mangler", kilde: "Ikke fundet" },
  { id: "startdato", label: "Ønsket startdato", vaerdi: "Ikke oplyst", tilstand: "mangler", kilde: "Ikke fundet" },
  { id: "obdAntal", label: "OBD-antal", vaerdi: "Ikke oplyst", tilstand: "mangler", kilde: "Ikke fundet" },
];

test("V7.1 AI-chat bevarer fakta og kan vente med CVR", () => {
  const forslag = lokalAiChatRevision({
    navn: "Maria Lund", oplysninger,
    instruktioner: ["Gør tonen personlig.", "Gør svaret kortere, behold alle fakta, vent med CVR og foreslå telefon."],
    signatur: "Jørn",
  });
  assert.match(forslag.tekst, /25 enheder/);
  assert.match(forslag.tekst, /3 måneder/);
  assert.match(forslag.tekst, /5 brugere/);
  assert.match(forslag.tekst, /2 af de 5 brugere/);
  assert.match(forslag.tekst, /telefon/);
  assert.doesNotMatch(forslag.tekst, /virksomhedens CVR/);
  assert.doesNotMatch(forslag.tekst, /Gør svaret/);
});

test("V7.1 oplysninger viser både administratorandel og uoplyst CVR", () => {
  const resultat = oplysningerForSag({ sagsOplysninger: Object.fromEntries(oplysninger.map((post, index) => [String(index), { ...post, raekke: index }])) });
  assert.equal(resultat.find((post) => post.id === "administratorer").vaerdi, "2 af de 5 brugere");
  assert.equal(resultat.find((post) => post.id === "cvr").tilstand, "mangler");
});

test("V7.1 AI-forslag bliver forældet ved ny mail, revision eller manuel tekst", () => {
  const tekst = "Gem mig";
  const forslag = { tekst: "Forslag", basisAktivitetMs: 10, basisKladdeRevision: 2, basisKladdeFingeraftryk: tekstfingeraftryk(tekst) };
  assert.equal(forslagErForældet(forslag, { senesteAktivitetMs: 10, kladdeRevision: 2, kladdetekst: tekst }), false);
  assert.equal(forslagErForældet(forslag, { senesteAktivitetMs: 11, kladdeRevision: 2, kladdetekst: tekst }), true);
  assert.equal(forslagErForældet(forslag, { senesteAktivitetMs: 10, kladdeRevision: 3, kladdetekst: tekst }), true);
  assert.equal(forslagErForældet(forslag, { senesteAktivitetMs: 10, kladdeRevision: 2, kladdetekst: tekst + "!" }), true);
});

test("V7.1 UI har præcis de tre kravfaner og review før godkendelse", async () => {
  const kilde = await readFile(new URL("../src/moduler/udbyder/EjerMailV71Samtale.jsx", import.meta.url), "utf8");
  assert.match(kilde, /\[\["svarudkast", "Svarudkast"\], \["ai-chat", "AI-chat"\], \["oplysninger", "Oplysninger"\]\]/);
  assert.match(kilde, /role="tablist"/);
  assert.match(kilde, /Gennemse svar/);
  assert.match(kilde, /AI-chat og interne noter indgår aldrig/);
});

test("V7.1 server gemmer intern chat separat og sender den ikke som mailpayload", async () => {
  const kilde = await readFile(new URL("../functions/index.js", import.meta.url), "utf8");
  const chatStart = kilde.indexOf("export const kommunikationsaichatgem");
  const chatSlut = kilde.indexOf("export const kommunikationssagsoplysninggem", chatStart);
  const chat = kilde.slice(chatStart, chatSlut);
  assert.match(chat, /intern: true/);
  assert.doesNotMatch(chat, /kommunikationssvarafsend/);
  const afsendStart = kilde.indexOf("export const kommunikationssvarafsend");
  const afsendSlut = kilde.indexOf("export const", afsendStart + 20);
  const afsend = kilde.slice(afsendStart, afsendSlut);
  assert.doesNotMatch(afsend, /aiArbejdsrum|sagsOplysninger|noter/);
});

/* Kundevendt support-AI. Ren og delt med serveren; ingen netværkskald. */
import { SUPPORT_ANSVAR, erKundegodkendtSupportViden } from "./support.js";

export const SUPPORT_AI_ADAPTER = "lokal-testadapter-v1";

const ord = (tekst) => new Set(String(tekst || "").toLocaleLowerCase("da-DK")
  .split(/[^a-z0-9æøå]+/u).filter((v) => v.length > 2));

/* Samme, konservative versionssyntaks som ejerens V8: kommaseparerede eller
 * semikolonseparerede versioner og et enkelt `.x`-wildcard. Fritekst matcher
 * ikke ved et tilfælde, og en afgrænset kilde kræver en kendt produktversion. */
export function supportVersionMatcher(relevanteVersioner, version) {
  const krav = String(relevanteVersioner || "").trim().toLocaleLowerCase("da-DK");
  const aktuel = String(version || "").trim().toLocaleLowerCase("da-DK");
  if (!krav || krav === "ikke afgrænset" || krav === "alle") return true;
  if (!aktuel || aktuel === "ukendt") return false;
  return krav.split(/[,;]/).map((post) => post.trim()).filter(Boolean).some((post) => {
    if (post.endsWith(".x")) return aktuel.startsWith(post.slice(0, -1));
    return aktuel === post || aktuel.startsWith(`${post}.`);
  });
}

export function kundeGodkendtViden(poster = [], { modul, programversion } = {}) {
  return poster.filter((post) => {
    if (!erKundegodkendtSupportViden(post)) return false;
    if (post.modul && modul && String(post.modul).toLocaleLowerCase("da-DK") !== String(modul).toLocaleLowerCase("da-DK")) return false;
    if (post.programversion && programversion && post.programversion !== programversion) return false;
    if (!supportVersionMatcher(post.relevanteVersioner, programversion)) return false;
    return true;
  });
}

export function findSupportViden(spoergsmaal, poster = [], kontekst = {}) {
  const input = ord(spoergsmaal);
  return kundeGodkendtViden(poster, kontekst)
    .map((post) => {
      const noegleord = new Set([...(post.noegleord || []), ...ord(post.titel)]);
      const score = [...noegleord].filter((v) => input.has(String(v).toLocaleLowerCase("da-DK"))).length;
      return { post, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || String(a.post.id).localeCompare(String(b.post.id), "da"))[0]?.post || null;
}

export function lokaltSupportAiSvar({ tekst, viden = [], kontekst = {} }) {
  const post = findSupportViden(tekst, viden, kontekst);
  if (!post) {
    return {
      adapter: SUPPORT_AI_ADAPTER,
      ansvarstype: SUPPORT_ANSVAR.ejer,
      eskaler: true,
      eskaleringsaarsag: "Det lokale, kundegodkendte vidensgrundlag dækker ikke spørgsmålet.",
      tekst: "Jeg kan ikke finde en godkendt vejledning, der dækker det sikkert. Jeg har derfor gjort samtalen klar til Veyro Support, så du ikke skal begynde forfra.",
      kilde: null,
    };
  }
  return {
    adapter: SUPPORT_AI_ADAPTER,
    ansvarstype: SUPPORT_ANSVAR.ai,
    eskaler: false,
    tekst: post.indhold,
    kilde: {
      id: post.id,
      titel: post.titel,
      kilde: post.kilde,
      version: post.aktuelVersion,
    },
  };
}

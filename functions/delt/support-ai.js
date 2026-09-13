/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/support-ai.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
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

const renTekst = (vaerdi, maks = 4_000) => String(vaerdi ?? "").trim().slice(0, maks);

function ejerSupportFakta({ sag = {}, beskeder = {}, sagsOplysninger = {} } = {}) {
  const dialog = Object.values(beskeder || {})
    .sort((a, b) => Number(b?.oprettetMs || 0) - Number(a?.oprettetMs || 0));
  const kundebesked = dialog.find((post) => post?.afsenderType === "kunde") || dialog[0] || {};
  const oplysning = (...id) => id.map((navn) => sagsOplysninger?.[navn]).find(Boolean);
  const vaerdi = (post) => post?.tilstand === "mangler"
    ? "Ukendt"
    : renTekst(post?.vaerdi, 1_000) || "Ukendt";
  return {
    kunde: renTekst(sag.virksomhedsnavn || sag.kontaktNavn || sag.kontaktEmail, 300) || "Ukendt kunde",
    modul: renTekst(sag.modul, 80) || "Ukendt",
    version: renTekst(sag.programversion, 80) || vaerdi(oplysning("version", "produktversion")),
    problem: renTekst(sag.problemResume || kundebesked.tekst, 3_000) || "Problemet er ikke beskrevet.",
    fejltekst: vaerdi(oplysning("fejltekst", "fejl")),
    forsoegt: Array.isArray(sag.afproevedeTrin) && sag.afproevedeTrin.length
      ? sag.afproevedeTrin.map((trin) => renTekst(trin, 500)).filter(Boolean).join("\n")
      : vaerdi(oplysning("forsoegt", "fejlsoegning")),
  };
}

function internSupportViden(poster = [], fakta = {}) {
  const input = ord(`${fakta.modul} ${fakta.problem} ${fakta.fejltekst}`);
  return poster.map((post) => {
    const noegleord = new Set([...(post?.noegleord || []), ...ord(post?.titel)]);
    const modulMatcher = !post?.modul || fakta.modul === "Ukendt"
      || String(post.modul).toLocaleLowerCase("da-DK") === fakta.modul.toLocaleLowerCase("da-DK");
    const score = [...noegleord]
      .filter((vaerdi) => input.has(String(vaerdi).toLocaleLowerCase("da-DK"))).length
      + (modulMatcher && post?.modul ? 1 : 0);
    return { post, score, modulMatcher };
  }).filter(({ post, score, modulMatcher }) => Boolean(
    modulMatcher
    && score > 0
    && post?.vidensstatus === "godkendt"
    && ["intern", "kunde_godkendt"].includes(post?.publikum)
    && post?.titel
    && post?.indhold
    && post?.kilde
    && Number(post?.aktuelVersion) > 0
    && (!post?.leveringsstatus || post.leveringsstatus === "tilgaengelig")
    && supportVersionMatcher(post.relevanteVersioner, fakta.version)
  )).sort((a, b) => b.score - a.score
    || Number(b.post.aktuelVersion) - Number(a.post.aktuelVersion)
    || String(a.post.id).localeCompare(String(b.post.id), "da"))
    .slice(0, 5)
    .map(({ post }) => ({
      id: renTekst(post.id, 160),
      titel: renTekst(post.titel, 300),
      indhold: renTekst(post.indhold, 12_000),
      kilde: renTekst(post.kilde, 1_000),
      modul: renTekst(post.modul, 80),
      relevanteVersioner: renTekst(post.relevanteVersioner, 200) || "Ikke afgrænset",
      publikum: post.publikum,
      vidensstatus: post.vidensstatus,
      aktuelVersion: Number(post.aktuelVersion),
      gennemgaaetAfNavn: renTekst(post.gennemgaaetAfNavn, 160) || "Ikke registreret",
      gennemgaaetMs: Number(post.gennemgaaetMs || 0),
    }));
}

/**
 * Deterministisk, rent ejerforslag til en portalsag. Resultatet er kun til
 * support/internAi og må aldrig føres gennem kundesnittet. Kun en kilde med
 * publikum=kunde_godkendt kan danne selve kundesvarforslaget; interne kilder
 * må alene optræde i ejerens analyse.
 */
export function lokaltEjerSupportAiForslag({
  sag = {}, beskeder = {}, sagsOplysninger = {}, viden = [], instruktion = "",
} = {}) {
  const fakta = ejerSupportFakta({ sag, beskeder, sagsOplysninger });
  const kilder = internSupportViden(viden, fakta);
  const kundekilde = kilder.find((post) => post.publikum === "kunde_godkendt");
  const interneKilder = kilder.filter((post) => post.publikum === "intern");
  const mangler = [
    fakta.version === "Ukendt" ? "produktversion" : "",
    fakta.fejltekst === "Ukendt" ? "præcis fejltekst eller logudsnit" : "",
    fakta.forsoegt === "Ukendt" ? "allerede udførte fejlsøgningstrin" : "",
  ].filter(Boolean);
  const navn = renTekst(sag.kontaktNavn, 120).split(/\s+/)[0] || "der";
  const kort = /kort|kortere/i.test(instruktion);
  const kundesvar = kundekilde
    ? `Hej ${navn}.\n\nTak for din besked. ${renTekst(kundekilde.indhold, kort ? 650 : 1_300)}${mangler.length ? `\n\nFor at kontrollere løsningen på jeres konkrete sag mangler vi ${mangler.join(", ")}.` : ""}\n\nSkriv gerne tilbage, hvis trinnene ikke løser problemet.`
    : `Hej ${navn}.\n\nTak for din besked. Vi har ikke tilstrækkeligt godkendt grundlag til at anvise en løsning endnu.${mangler.length ? `\n\nSend venligst ${mangler.join(", ")}, så vi kan undersøge sagen uden at gætte.` : "\n\nVi undersøger sagen manuelt og vender tilbage, når grundlaget er dokumenteret."}`;
  const vurdering = kundekilde
    ? "Dokumenteret løsning fundet i kundegodkendt produktviden. Fejlteksten er et signal, men beviser ikke alene årsagen."
    : interneKilder.length
      ? "Relevant intern viden findes, men ingen kilde er godkendt til kundesvar. Den må kun bruges til intern fejlsøgning."
      : "Ingen tilstrækkelig godkendt viden blev fundet. Indhent flere oplysninger eller undersøg sagen manuelt.";
  const kildeResume = kilder.length
    ? kilder.map((post) => `${post.titel} · v${post.aktuelVersion} · ${post.publikum === "kunde_godkendt" ? "kundegodkendt" : "kun intern"}`).join("\n")
    : "Ingen matchende godkendte kilder.";
  const aiSvar = [
    `Dokumenterede fakta\nKunde: ${fakta.kunde}\nModul: ${fakta.modul}\nVersion: ${fakta.version}\nProblem: ${fakta.problem}\nForsøgt: ${fakta.forsoegt}`,
    `Vurdering\n${vurdering}`,
    `Dokumenterede kilder\n${kildeResume}`,
    mangler.length
      ? `Ukendt / næste spørgsmål\nBed om ${mangler.join(", ")}.`
      : "Næste trin\nKontrollér resultatet med kunden før sagen markeres løst.",
    interneKilder.length
      ? "Begrænsning\nInterne kilder er kun baggrund og må ikke kopieres til kunden uden særskilt godkendelse."
      : "",
  ].filter(Boolean).join("\n\n");
  return {
    fakta, kilder, kundesvar, aiSvar, mangler,
    harKundegodkendtLoesning: Boolean(kundekilde),
  };
}

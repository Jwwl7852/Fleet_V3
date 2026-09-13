const tekst = (vaerdi, maks = 4_000) => String(vaerdi ?? "").trim().slice(0, maks);
const poster = (objekt) => Object.entries(objekt || {}).map(([id, post]) => ({ id, ...(post || {}) }));

export const SUPPORT_VIDEN_STATUS = Object.freeze({ GODKENDT: "godkendt", KLADDE: "kladde", FORAELDET: "foraeldet" });
export const SUPPORT_VIDEN_PUBLIKUM = Object.freeze({ INTERN: "intern", KUNDE: "kunde_godkendt", SAG: "sag" });

export function normaliserSupportViden(post = {}) {
  const status = tekst(post.vidensstatus || (post.godkendt === true ? "godkendt" : "kladde"), 30);
  return {
    id: tekst(post.id, 160), titel: tekst(post.titel, 300), indhold: tekst(post.indhold, 12_000),
    kilde: tekst(post.kilde, 1_000), modul: tekst(post.modul, 80),
    relevanteVersioner: tekst(post.relevanteVersioner, 200) || "Ikke afgrænset",
    vidensstatus: Object.values(SUPPORT_VIDEN_STATUS).includes(status) ? status : "kladde",
    publikum: Object.values(SUPPORT_VIDEN_PUBLIKUM).includes(post.publikum) ? post.publikum : "intern",
    godkendt: post.godkendt === true, aktuelVersion: Number(post.aktuelVersion || 0),
    gennemgaaetAfNavn: tekst(post.gennemgaaetAfNavn, 160) || "Ikke registreret",
    gennemgaaetMs: Number(post.gennemgaaetMs || 0),
    noegleord: Array.isArray(post.noegleord) ? post.noegleord.map((ord) => tekst(ord, 80).toLowerCase()).filter(Boolean) : [],
  };
}

export function supportSagFakta(traad = {}) {
  const support = traad.support || {};
  const beskeder = poster(traad.beskeder).sort((a, b) => Number(b.sendtMs || 0) - Number(a.sendtMs || 0));
  const senesteKundebesked = beskeder.find((post) => post.retning === "indgaaende") || beskeder[0] || {};
  const oplysninger = poster(traad.sagsOplysninger);
  const find = (...id) => oplysninger.find((post) => id.includes(post.id));
  const vaerdi = (post) => post?.tilstand === "mangler" ? "Ukendt" : tekst(post?.vaerdi, 1_000) || "Ukendt";
  const versionPost = find("version", "produktversion");
  const afsender = tekst(senesteKundebesked.fra, 300) || "Ukendt mailafsender";
  const kontakt = tekst(traad.kontaktEmail, 300) || "Ukendt registreret kontakt";
  const version = tekst(support.version || support.kendtVersion, 80) || vaerdi(versionPost);
  return {
    sagId: tekst(traad.id, 160), nummer: tekst(support.nummer, 80) || "Nummer ikke tildelt",
    kunde: tekst(traad.virksomhedsnavn || traad.kontaktNavn || traad.kontaktEmail, 300) || "Ukendt kunde",
    kundeKilde: traad.links?.virksomhedId ? "CRM-kobling" : "Sagsmetadata · CRM-kobling ikke registreret",
    kontaktNavn: tekst(traad.kontaktNavn, 200) || "Navn ikke registreret",
    kontakt,
    kontaktKilde: traad.links?.kontaktId ? "CRM-kontakt" : "Sagsmetadata · CRM-kontakt ikke registreret",
    afsender,
    afsenderKilde: "Seneste indgående besked",
    modul: tekst(support.modul, 80) || "Ukendt",
    version,
    versionKilde: tekst(support.versionKilde || versionPost?.kilde, 300) || "Kilde ikke registreret",
    versionErSyntetisk: /syntetisk|fixture|testværdi|testdata/i.test(`${support.versionKilde || ""} ${versionPost?.kilde || ""}`),
    problem: tekst(support.problem || senesteKundebesked.tekst, 3_000) || "Problemet er ikke beskrevet.",
    fejltekst: tekst(support.fejltekst, 1_000) || vaerdi(find("fejltekst", "fejl")),
    forsoegt: tekst(support.forsoegt, 2_000) || vaerdi(find("forsoegt", "fejlsoegning")),
    senesteAktivitetMs: Number(traad.senesteAktivitetMs || 0),
  };
}

export function supportVersionMatcher(relevanteVersioner, version) {
  const krav = tekst(relevanteVersioner, 200).toLowerCase();
  const aktuel = tekst(version, 80).toLowerCase();
  if (!krav || krav === "ikke afgrænset" || krav === "alle") return true;
  if (!aktuel || aktuel === "ukendt") return false;
  return krav.split(/[,;]/).map((post) => post.trim()).filter(Boolean).some((post) => {
    if (post.endsWith(".x")) return aktuel.startsWith(post.slice(0, -1));
    return aktuel === post || aktuel.startsWith(`${post}.`);
  });
}

function scoreKilde(kilde, fakta) {
  const haystack = `${fakta.modul} ${fakta.problem} ${fakta.fejltekst}`.toLowerCase();
  let score = kilde.modul && fakta.modul !== "Ukendt" && kilde.modul.toLowerCase() === fakta.modul.toLowerCase() ? 1 : 0;
  for (const ord of kilde.noegleord) if (ord && haystack.includes(ord)) score += 3;
  if (kilde.titel && haystack.includes(kilde.titel.toLowerCase())) score += 2;
  return score;
}

export function findSupportKilder(traad, viden) {
  const fakta = supportSagFakta(traad);
  return poster(viden).map(normaliserSupportViden)
    .filter((post) => post.godkendt && post.vidensstatus === "godkendt" && post.titel && post.indhold && post.kilde)
    .map((post) => ({ ...post, relevans: scoreKilde(post, fakta) }))
    .filter((post) => post.relevans >= 3)
    .map((post) => ({ ...post, versionsrelevant: supportVersionMatcher(post.relevanteVersioner, fakta.version) }))
    .filter((post) => post.versionsrelevant)
    .sort((a, b) => b.relevans - a.relevans || b.aktuelVersion - a.aktuelVersion || a.titel.localeCompare(b.titel, "da"))
    .slice(0, 5);
}

const ukendte = (fakta) => [
  fakta.version === "Ukendt" ? "produktversion" : "",
  fakta.fejltekst === "Ukendt" ? "præcis fejltekst eller logudsnit" : "",
  fakta.forsoegt === "Ukendt" ? "allerede udførte fejlsøgningstrin" : "",
].filter(Boolean);

export function bygSupportAiResultat({ traad = {}, viden = {}, instruktion = "" } = {}) {
  const fakta = supportSagFakta(traad);
  const kilder = findSupportKilder(traad, viden);
  const kundeKilde = kilder.find((post) => post.publikum === "kunde_godkendt");
  const interneKilder = kilder.filter((post) => post.publikum !== "kunde_godkendt");
  const mangler = ukendte(fakta);
  const navn = tekst(traad.kontaktNavn, 120)?.split(/\s+/)[0] || "der";
  const kort = /kort|kortere/i.test(instruktion);
  let kundesvar;
  let vurdering;
  if (kundeKilde) {
    const loesning = tekst(kundeKilde.indhold, kort ? 650 : 1_300);
    kundesvar = `Hej ${navn}.\n\nTak for din besked. ${loesning}${mangler.length ? `\n\nFor at kontrollere løsningen på jeres konkrete sag mangler vi ${mangler.join(", ")}.` : ""}\n\nSkriv gerne tilbage, hvis trinnene ikke løser problemet.`;
    vurdering = `Dokumenteret løsning fundet i godkendt produktviden. Den registrerede fejltekst er et signal, men beviser ikke alene årsagen.`;
  } else {
    kundesvar = `Hej ${navn}.\n\nTak for din besked. Vi har ikke tilstrækkeligt godkendt grundlag til at anvise en løsning endnu.${mangler.length ? `\n\nSend venligst ${mangler.join(", ")}, så vi kan undersøge sagen uden at gætte.` : "\n\nVi undersøger sagen manuelt og vender tilbage, når grundlaget er dokumenteret."}`;
    vurdering = kilder.length
      ? "Der findes relevant intern viden, men ingen kilde er godkendt til et kundesvar. Løsningen må derfor ikke præsenteres som bekræftet."
      : "Der er ikke fundet tilstrækkelig godkendt viden. Sagen kræver flere oplysninger eller manuel undersøgelse.";
  }
  const dokumenteret = kilder.length
    ? kilder.map((post) => `${post.titel} · v${post.aktuelVersion || "?"} · ${post.publikum === "kunde_godkendt" ? "kundegodkendt" : "kun intern"}`).join("\n")
    : "Ingen matchende godkendte kilder.";
  const aiSvar = [
    `Dokumenterede fakta\nKunde: ${fakta.kunde}\nModul: ${fakta.modul}\nVersion: ${fakta.version}\nProblem: ${fakta.problem}\nForsøgt: ${fakta.forsoegt}`,
    `Vurdering\n${vurdering}`,
    `Dokumenterede kilder\n${dokumenteret}`,
    mangler.length ? `Ukendt / næste spørgsmål\nBed om ${mangler.join(", ")}.` : "Næste trin\nKontrollér resultatet med kunden før sagen markeres løst.",
    interneKilder.length ? "Begrænsning\nInterne kilder er kun baggrund og må ikke kopieres til kunden uden særskilt godkendelse." : "",
  ].filter(Boolean).join("\n\n");
  return { fakta, kilder, kundesvar, aiSvar, harKundegodkendtLoesning: Boolean(kundeKilde), mangler };
}

export function supportKildevisning(traad = {}) {
  return Array.isArray(traad.aiArbejdsrum?.aktivtForslag?.kilder) ? traad.aiArbejdsrum.aktivtForslag.kilder : [];
}

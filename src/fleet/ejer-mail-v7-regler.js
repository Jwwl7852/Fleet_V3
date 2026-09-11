export const MAIL_SIDESTOERRELSE = 25;

const liste = (objekt) => Object.entries(objekt || {}).map(([id, post]) => ({ id, ...post }));
const tekst = (vaerdi) => String(vaerdi || "").trim().toLowerCase();
const aaben = (traad) => traad?.status !== "afsluttet";

export function arbejdsomraadeMatcher(traad, postkasse, ejerUid) {
  const kilder = Object.values(traad?.postkasseKilder || {});
  if (postkasse === "mine") return kilder.some((kilde) => kilde?.type === "personlig" && kilde?.ejerUid === ejerUid);
  if (postkasse === "info") return kilder.some((kilde) => tekst(kilde?.adresse) === "info@veyrosystems.com");
  return traad?.delingsstatus === "delt";
}

export function mappeMatcher(traad, mappe = "indbakke") {
  if (mappe === "arkiv") return !aaben(traad);
  if (!aaben(traad)) return false;
  if (mappe === "kunder") return Boolean(traad?.links?.virksomhedId) && !["intern", "leverandoer"].includes(traad?.sagstype);
  if (mappe === "interne") return traad?.sagstype === "intern";
  if (mappe === "domicil") return traad?.sagstype === "intern" && tekst(traad?.internMappe || traad?.emne).includes("domicil");
  if (mappe === "energi") return traad?.sagstype === "intern" && tekst(traad?.internMappe || traad?.emne).includes("energi");
  if (mappe === "leverandoerer") return traad?.sagstype === "leverandoer";
  return true;
}

export function filtrerMailtraade(traade, {
  postkasse = "faelles", ejerUid = "", status = "aabne", mappe = "indbakke",
  kunMine = false, soegning = "", visning = "indbakker",
} = {}) {
  const q = tekst(soegning);
  return liste(traade).filter((traad) => {
    if (!arbejdsomraadeMatcher(traad, postkasse, ejerUid)) return false;
    if (visning === "sager" && !["intern", "leverandoer"].includes(traad.sagstype)) return false;
    if (visning === "sendt" && traad.senesteRetning !== "udgaaende") return false;
    if (visning === "indbakker" && ["intern", "leverandoer"].includes(traad.sagstype)) return false;
    if (!mappeMatcher(traad, mappe)) return false;
    if (status === "aabne" && !aaben(traad)) return false;
    if (status !== "aabne" && traad.status !== status) return false;
    if (kunMine && traad.ansvarligUid !== ejerUid) return false;
    if (q && !tekst(`${traad.emne} ${traad.virksomhedsnavn} ${traad.kontaktNavn} ${traad.kontaktEmail} ${traad.preview}`).includes(q)) return false;
    return true;
  }).sort((a, b) => Number(b.senesteAktivitetMs || 0) - Number(a.senesteAktivitetMs || 0));
}

export function paginerMailtraade(traade, side = 1, sidestoerrelse = MAIL_SIDESTOERRELSE) {
  const sider = Math.max(1, Math.ceil(traade.length / sidestoerrelse));
  const aktuelSide = Math.min(sider, Math.max(1, Math.trunc(Number(side) || 1)));
  const start = (aktuelSide - 1) * sidestoerrelse;
  return { poster: traade.slice(start, start + sidestoerrelse), side: aktuelSide, sider, total: traade.length };
}

export function bygAiOpmærksomhedspunkter(traade, nu = Date.now()) {
  const punkter = [];
  for (const traad of traade) {
    const navn = traad.virksomhedsnavn || traad.kontaktNavn || traad.kontaktEmail || "Ukendt kontakt";
    const ansvarligUid = traad.ansvarligUid || "";
    const alder = Math.max(0, nu - Number(traad.senesteAktivitetMs || nu));
    const opfoelgning = liste(traad.opfoelgninger).find((post) => ["kladde", "godkendt", "fejlet"].includes(post.status));
    if (opfoelgning) punkter.push({ id: `${traad.id}-opfoelgning`, traadId: traad.id, navn, ansvarligUid, art: "forslag", aarsag: opfoelgning.status === "godkendt" ? "Godkendt opfølgning afventer afsendelse" : "Opfølgningsudkast kræver gennemgang", tidspunktMs: opfoelgning.forfalderMs, kilde: "Registreret opfølgning", sikkerhed: "Konstateret status" });
    if (traad.sagstype === "support" && !["loest", "lukket"].includes(traad.support?.status)) punkter.push({ id: `${traad.id}-support`, traadId: traad.id, navn, ansvarligUid, art: "frist", aarsag: `Support kræver handling${traad.support?.modul ? ` i ${traad.support.modul}` : ""}`, tidspunktMs: traad.support?.fristMs, kilde: "Supportfrist", sikkerhed: "Konstateret status" });
    const analyse = liste(traad.analyser).sort((a, b) => Number(b.oprettetMs || 0) - Number(a.oprettetMs || 0))[0];
    if (analyse?.manglendeOplysninger?.length) punkter.push({ id: `${traad.id}-mangler`, traadId: traad.id, navn, ansvarligUid, art: "forslag", aarsag: `Mangler: ${analyse.manglendeOplysninger.slice(0, 2).join(", ")}`, tidspunktMs: traad.senesteAktivitetMs, kilde: "Lokal AI-analyse af sagen", sikkerhed: "Forslag — gennemgå kilden" });
    if (traad.status === "afventer_os" && alder >= 24 * 60 * 60 * 1000) punkter.push({ id: `${traad.id}-frist`, traadId: traad.id, navn, ansvarligUid, art: "frist", aarsag: "Svarfristen er overskredet", tidspunktMs: traad.senesteAktivitetMs, kilde: "Seneste indgående aktivitet", sikkerhed: "Konstateret tidspunkt" });
  }
  return punkter.sort((a, b) => Number(a.tidspunktMs || Infinity) - Number(b.tidspunktMs || Infinity)).slice(0, 8);
}

export function lokaltSvarforslag({ navn = "", mangler = [], instruktion = "", signatur = "Veyro Systems" } = {}) {
  const kort = /kort|kortere|konkret/i.test(instruktion);
  const afklaring = mangler.filter(Boolean).slice(0, kort ? 2 : 3);
  const linjer = [
    `Hej${navn ? ` ${navn.split(" ")[0]}` : ""}.`,
    "Tak for din besked. Vi har gennemgået den registrerede sag.",
    afklaring.length ? `For at komme videre vil vi gerne afklare ${afklaring.join(" og ")}.` : "Vi vender tilbage med det aftalte næste skridt.",
    kort ? "" : "Svar gerne direkte i denne tråd, så samler vi det videre forløb samme sted.",
    `Venlig hilsen\n${signatur}`,
  ];
  return linjer.filter(Boolean).join("\n\n");
}

import { MODUL } from "./moduler.js";
import { tilfoejKalendermaaneder } from "./ejer-tilbud-regler.js";

const DAGS_MS = 86_400_000;

export function foreslaaPilotEvaluering(pilotStart, pilotMaaneder) {
  const pilotSlut = tilfoejKalendermaaneder(pilotStart, Number(pilotMaaneder));
  if (!pilotStart || !pilotSlut) return null;
  const fjortenDageFoer = new Date(`${pilotSlut}T00:00:00Z`).getTime() - 14 * DAGS_MS;
  return new Date(Math.max(new Date(`${pilotStart}T00:00:00Z`).getTime(), fjortenDageFoer)).toISOString().slice(0, 10);
}

export function pilotEvalueringAdvarsel(pilotStart, pilotSlut, evaluering) {
  if (!pilotStart || !pilotSlut || !evaluering) return "";
  return evaluering < pilotStart || evaluering > pilotSlut
    ? "Den manuelt valgte evaluering ligger uden for pilotperioden."
    : "";
}

const liste = (vaerdi) => (Array.isArray(vaerdi) ? vaerdi : String(vaerdi || "").split(/[\n,;]/))
  .map((v) => String(v || "").trim()).filter(Boolean);
const unik = (vaerdier) => [...new Set(vaerdier)];
const opremsning = (vaerdier) => {
  const rene = unik(liste(vaerdier));
  if (rene.length < 2) return rene[0] || "";
  return `${rene.slice(0, -1).join(", ")} og ${rene.at(-1)}`;
};

/**
 * Deterministisk, lokal tilbudsadapter til emulator/review.
 *
 * Understøttede sælgeranvisninger er en kortere/mere konkret tekst og tydelig
 * pilotafgrænsning. Adapteren bruger kun den strukturerede kontekst, som
 * tilbudskladden sender med; instruktionen kopieres aldrig til kundeteksten.
 */
export function lokaltTilbudsforslag({ felt, kunde = "Kunden", instruks = "", pilot = false, kontekst = {} } = {}) {
  const kort = /kort|kortere|konkret/i.test(instruks);
  const fremhaevPilot = pilot && (/pilot|afgræns|omfang/i.test(instruks) || kort);
  const moduler = opremsning(kontekst.moduler);
  const aktiviteter = opremsning(kontekst.aktiviteter);
  const pilotMaaneder = Number(kontekst.pilotMaaneder);
  const periode = pilotMaaneder > 0
    ? `${pilotMaaneder} ${pilotMaaneder === 1 ? "kalendermåned" : "kalendermåneder"}${kontekst.pilotStart ? ` fra ${kontekst.pilotStart}` : ""}`
    : "";
  const omfang = String(kontekst.omfang || "").trim();
  const udenfor = opremsning(kontekst.udenfor);
  const uafklaret = unik(liste(kontekst.uafklaret));
  if (pilot && !periode) uafklaret.push("pilotens varighed");
  if (pilot && !omfang) uafklaret.push("pilotens aftalte omfang");
  const afklaringer = opremsning(uafklaret);
  const omfatter = [moduler && `modulerne ${moduler}`, aktiviteter && `aktiviteterne ${aktiviteter}`].filter(Boolean).join(" samt ");
  const fakta = [
    omfatter && `Piloten omfatter ${omfatter}.`,
    periode && `Den løber i ${periode}.`,
    omfang && `Det aftalte omfang er ${omfang}.`,
    udenfor && `Uden for piloten er ${udenfor}.`,
    afklaringer && `Før opstart skal vi afklare ${afklaringer}.`,
    kontekst.vejledendeDrift && "En eventuel efterfølgende driftsaftale er en separat, vejledende fase og aktiveres ikke automatisk.",
  ].filter(Boolean);

  if (pilot && (felt === "indledning" || felt === "loesningsbeskrivelse" || felt === "behovstekst")) {
    const indledning = felt === "indledning"
      ? `Tak for dialogen. Her er et kildebaseret pilotforslag til ${kunde}.`
      : felt === "behovstekst"
        ? `${kunde} ønsker et afgrænset pilotforløb på dokumenterede vilkår.`
        : `Veyro leverer et afgrænset pilotforløb til ${kunde}.`;
    if (kort || fremhaevPilot) return [indledning, ...fakta].join(" ");
    return [
      felt === "indledning"
        ? `Tak for den gode dialog. Dette tilbud beskriver et konkret pilotforløb for ${kunde} på baggrund af de oplysninger, der er registreret i sagen.`
        : indledning,
      ...fakta,
      "Omfang og næste skridt gennemgås sammen før opstart, så pilotens resultat kan vurderes på et fælles grundlag.",
    ].join(" ");
  }

  const tekster = {
    indledning: kort
      ? `Tak for dialogen. Her er et samlet forslag til ${kunde}.`
      : `Tak for den gode dialog. Dette tilbud samler ${kunde}s bekræftede behov i et konkret og gennemgåeligt oplæg.`,
    behovstekst: kort
      ? `${kunde} ønsker et samlet overblik og en tydelig opstart.`
      : `${kunde} har behov for et samlet overblik, klare ansvarsområder og en tydelig opstart. Omfang, startdato og eventuelle integrationer bekræftes før aftale.`,
    loesningsbeskrivelse: kort
      ? `Veyro samler de valgte moduler i én løsning med en aftalt opstartsplan.`
      : `Veyro samler de valgte moduler i én løsning. Implementering, ansvar og leverancer gennemgås i en fælles opstartsplan, så løsningen kan tages i brug på et dokumenteret grundlag.`,
  };
  return tekster[felt] || "";
}

export function solgteModulerFraTilbud(tilbud = {}, { fraMs = 0, tilMs = Number.MAX_SAFE_INTEGER, forloeb = "drift" } = {}) {
  const set = new Map();
  for (const [tilbudId, post] of Object.entries(tilbud || {})) {
    const acceptMs = Number(post?.accept?.ms || 0);
    if (!acceptMs || acceptMs < fraMs || acceptMs > tilMs) continue;
    const snapshot = post?.versioner?.[post.accept?.version]?.snapshot;
    if (!snapshot) continue;
    const erPilot = snapshot.tilbudstype === "pilot";
    if ((forloeb === "pilot") !== erPilot) continue;
    for (const linje of snapshot.beregning?.linjer || snapshot.linjer || []) {
      const modulId = linje.modulId;
      if (!modulId || !MODUL[modulId] || MODUL[modulId].altid || modulId === "fakturacenter") continue;
      const noegle = `${post.virksomhedId || snapshot.virksomhedId}|${modulId}`;
      if (!set.has(noegle)) set.set(noegle, { tilbudId, virksomhedId: post.virksomhedId || snapshot.virksomhedId, modulId, label: MODUL[modulId].label, acceptMs });
    }
  }
  return [...set.values()];
}

export function grupperSolgteModuler(poster = []) {
  return Object.values(poster.reduce((sum, post) => {
    sum[post.modulId] ||= { modulId: post.modulId, label: post.label, antal: 0, poster: [] };
    sum[post.modulId].antal += 1;
    sum[post.modulId].poster.push(post);
    return sum;
  }, {})).sort((a, b) => b.antal - a.antal || a.label.localeCompare(b.label, "da"));
}

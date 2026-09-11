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

export function lokaltTilbudsforslag({ felt, kunde = "Kunden", instruks = "", pilot = false } = {}) {
  const kort = /kort|kortere|konkret/i.test(instruks);
  const pilotTekst = pilot ? " Piloten afgrænses i tid og evalueres før en eventuel driftsaftale." : "";
  const tekster = {
    indledning: kort
      ? `Tak for dialogen. Her er et samlet forslag til ${kunde}.`
      : `Tak for den gode dialog. Dette tilbud samler ${kunde}s bekræftede behov i et konkret og gennemgåeligt oplæg.`,
    behovstekst: kort
      ? `${kunde} ønsker et samlet overblik og en tydelig opstart.${pilotTekst}`
      : `${kunde} har behov for et samlet overblik, klare ansvarsområder og en tydelig opstart. Omfang, startdato og eventuelle integrationer bekræftes før aftale.${pilotTekst}`,
    loesningsbeskrivelse: kort
      ? `Veyro samler de valgte moduler i én løsning med en aftalt opstartsplan.${pilotTekst}`
      : `Veyro samler de valgte moduler i én løsning. Implementering, ansvar og leverancer gennemgås i en fælles opstartsplan, så løsningen kan tages i brug på et dokumenteret grundlag.${pilotTekst}`,
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

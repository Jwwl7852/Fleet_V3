import { REFERENCEART, REGELNIVEAU, referenceNoegle } from "../planning-basic.js";

export const OPTIMERINGSSTATUS = Object.freeze({ KLAR: "KLAR", BEREGNET: "BEREGNET", UGYLDIG: "UGYLDIG", BEGRAENSET: "BEGRAENSET" });
export const MATRIXKILDE = "SYNTETISK";
export const ALGORITME = Object.freeze({ navn: "DETERMINISTISK_BLOK_INDSAETTELSE", version: 1 });
export const OPTIMERINGSKODE = Object.freeze({
  JOB_UGYLDIGT: "OPT_JOB_UGYLDIGT",
  INPUTVERSION_MANGLER: "OPT_INPUTVERSION_MANGLER",
  BEREGNINGSTID_MANGLER: "OPT_BEREGNINGSTID_MANGLER",
  TENANT_UOVERENSSTEMMELSE: "OPT_TENANT_UOVERENSSTEMMELSE",
  REFERENCE_UKENDT: "OPT_REFERENCE_UKENDT",
  MATRIX_DUBLET: "OPT_MATRIX_DUBLET",
  MATRIX_SEGMENT_UGYLDIGT: "OPT_MATRIX_SEGMENT_UGYLDIGT",
  MATRIX_VERSION_FORKERT: "OPT_MATRIX_VERSION_FORKERT",
  MATRIXSEGMENT_MANGLER: "OPT_MATRIXSEGMENT_MANGLER",
  ADRESSE_IKKE_KLAR: "OPT_ADRESSE_IKKE_KLAR",
  MEDARBEJDER_MANGLER: "OPT_MEDARBEJDER_MANGLER",
  KOMPETENCE_MANGLER: "OPT_KOMPETENCE_MANGLER",
  CERTIFIKAT_MANGLER: "OPT_CERTIFIKAT_MANGLER",
  CERTIFIKAT_UDLOEBET: "OPT_CERTIFIKAT_UDLOEBET",
  VAGT_MANGLER: "OPT_VAGT_MANGLER",
  FRAVAER_OVERLAP: "OPT_FRAVAER_OVERLAP",
  KOERETOEJ_MANGLER: "OPT_KOERETOEJ_MANGLER",
  KOERETOEJSTYPE_FORKERT: "OPT_KOERETOEJSTYPE_FORKERT",
  KAPACITET_UTILSTRAEKKELIG: "OPT_KAPACITET_UTILSTRAEKKELIG",
  UDSTYR_MANGLER: "OPT_UDSTYR_MANGLER",
  TIDSRUM_MANGLER: "OPT_TIDSRUM_MANGLER",
  AFHAENGIGHED_UGYLDIG: "OPT_AFHAENGIGHED_UGYLDIG",
  KONTINUITET_UGYLDIG: "OPT_KONTINUITET_UGYLDIG",
  KONTROLLERET_UNDTAGELSE_KRAEVER_GODKENDELSE: "OPT_KONTROLLERET_UNDTAGELSE_KRAEVER_GODKENDELSE",
  RESSOURCEKONFLIKT: "OPT_RESSOURCEKONFLIKT",
  OPERATIONS_GRAENSE: "OPT_OPERATIONS_GRAENSE",
  RESULTAT_UGYLDIGT: "OPT_RESULTAT_UGYLDIGT",
});

const TEKSTER = Object.freeze({
  [OPTIMERINGSKODE.JOB_UGYLDIGT]: "Optimeringsjobbet er strukturelt ugyldigt.",
  [OPTIMERINGSKODE.INPUTVERSION_MANGLER]: "Inputversionen mangler.",
  [OPTIMERINGSKODE.BEREGNINGSTID_MANGLER]: "Beregningstidspunktet mangler.",
  [OPTIMERINGSKODE.TENANT_UOVERENSSTEMMELSE]: "Data tilhører ikke jobbets tenant.",
  [OPTIMERINGSKODE.REFERENCE_UKENDT]: "En typed reference peger på et ukendt objekt.",
  [OPTIMERINGSKODE.MATRIX_DUBLET]: "Rejsetidsmatrixen indeholder et dubleret segment.",
  [OPTIMERINGSKODE.MATRIX_SEGMENT_UGYLDIGT]: "Rejsetidsmatrixen indeholder et ugyldigt segment.",
  [OPTIMERINGSKODE.MATRIX_VERSION_FORKERT]: "Et matrixsegment har en anden version end matrixen.",
  [OPTIMERINGSKODE.MATRIXSEGMENT_MANGLER]: "Et nødvendigt matrixsegment mangler; der anvendes ingen fallback eller gæt.",
  [OPTIMERINGSKODE.ADRESSE_IKKE_KLAR]: "Adresse eller matrixpunkt er ikke klar til planlægning.",
  [OPTIMERINGSKODE.MEDARBEJDER_MANGLER]: "Ingen egnet medarbejder kan tildeles.",
  [OPTIMERINGSKODE.KOMPETENCE_MANGLER]: "En nødvendig medarbejderkompetence mangler.",
  [OPTIMERINGSKODE.CERTIFIKAT_MANGLER]: "Et nødvendigt certifikat mangler.",
  [OPTIMERINGSKODE.CERTIFIKAT_UDLOEBET]: "Et nødvendigt certifikat er udløbet på beregningstidspunktet.",
  [OPTIMERINGSKODE.VAGT_MANGLER]: "Opgaven kan ikke rummes i medarbejderens vagt.",
  [OPTIMERINGSKODE.FRAVAER_OVERLAP]: "Opgaven overlapper medarbejderens fravær eller blokerede interval.",
  [OPTIMERINGSKODE.KOERETOEJ_MANGLER]: "Opgaven kræver et køretøj, men intet egnet køretøj er ledigt.",
  [OPTIMERINGSKODE.KOERETOEJSTYPE_FORKERT]: "Ingen ledige køretøjer har den krævede type.",
  [OPTIMERINGSKODE.KAPACITET_UTILSTRAEKKELIG]: "Ingen ledige køretøjer har tilstrækkelig normaliseret kapacitet.",
  [OPTIMERINGSKODE.UDSTYR_MANGLER]: "Nødvendigt udstyr mangler eller er allerede disponeret.",
  [OPTIMERINGSKODE.TIDSRUM_MANGLER]: "Der findes intet lovligt tidsrum for opgaven.",
  [OPTIMERINGSKODE.AFHAENGIGHED_UGYLDIG]: "En opgaveafhængighed kan ikke opfyldes.",
  [OPTIMERINGSKODE.KONTINUITET_UGYLDIG]: "Et bindende kontinuitetskrav kan ikke opfyldes.",
  [OPTIMERINGSKODE.KONTROLLERET_UNDTAGELSE_KRAEVER_GODKENDELSE]: "En kontrolleret undtagelse kræver senere eksplicit disponentgodkendelse.",
  [OPTIMERINGSKODE.RESSOURCEKONFLIKT]: "Ressourcen ville blive dobbeltbooket.",
  [OPTIMERINGSKODE.OPERATIONS_GRAENSE]: "Beregningens eksplicitte operationsgrænse blev nået.",
  [OPTIMERINGSKODE.RESULTAT_UGYLDIGT]: "Det beregnede resultat opfylder ikke resultatkontrakten.",
});

export function optimeringsfund(kode, detaljer = {}) {
  return { kode, tekst: TEKSTER[kode] || kode, niveau: REGELNIVEAU.HARD, detaljer };
}

const liste = (v) => Array.isArray(v) ? v : [];
const erTid = (v) => Number.isFinite(v) && v >= 0;

export function segmentNoegle(fraRef, tilRef) {
  return `${referenceNoegle(fraRef)}>${referenceNoegle(tilRef)}`;
}

export function opretMatrixOpslag(matrix) {
  return new Map(liste(matrix?.segmenter).map((segment) => [segmentNoegle(segment.fraLokationRef, segment.tilLokationRef), segment]));
}

export function validerRejsetidsmatrix(matrix, { tenantRef, lokationer = [] } = {}) {
  const fund = [];
  if (!matrix || !matrix.version || matrix.kilde !== MATRIXKILDE) fund.push(optimeringsfund(OPTIMERINGSKODE.JOB_UGYLDIGT, { sti: "matrix" }));
  if (matrix?.tenantRef !== tenantRef) fund.push(optimeringsfund(OPTIMERINGSKODE.TENANT_UOVERENSSTEMMELSE, { sti: "matrix.tenantRef" }));
  const kendte = new Set(lokationer.map((lokation) => referenceNoegle(lokation.reference)));
  const sete = new Set();
  for (const [indeks, segment] of liste(matrix?.segmenter).entries()) {
    const fra = referenceNoegle(segment?.fraLokationRef);
    const til = referenceNoegle(segment?.tilLokationRef);
    const noegle = segmentNoegle(segment?.fraLokationRef, segment?.tilLokationRef);
    if (!fra || !til || !kendte.has(fra) || !kendte.has(til)) fund.push(optimeringsfund(OPTIMERINGSKODE.REFERENCE_UKENDT, { indeks, fra, til }));
    if (sete.has(noegle)) fund.push(optimeringsfund(OPTIMERINGSKODE.MATRIX_DUBLET, { indeks, noegle }));
    sete.add(noegle);
    const diagonalGyldig = fra !== til || (segment.rejsetidMin === 0 && segment.afstandMeter === 0);
    if (!erTid(segment?.rejsetidMin) || !erTid(segment?.afstandMeter) || !diagonalGyldig || segment?.kilde !== MATRIXKILDE) fund.push(optimeringsfund(OPTIMERINGSKODE.MATRIX_SEGMENT_UGYLDIGT, { indeks, noegle }));
    if (segment?.matrixversion !== matrix?.version) fund.push(optimeringsfund(OPTIMERINGSKODE.MATRIX_VERSION_FORKERT, { indeks, noegle }));
  }
  return { ok: fund.length === 0, fund };
}

export function validerOptimeringsjob(job) {
  const fund = [];
  if (!job?.id || !job?.tenantRef || !job?.dato || !job?.tidszone || !Array.isArray(job?.planlaegningspulje)) fund.push(optimeringsfund(OPTIMERINGSKODE.JOB_UGYLDIGT));
  if (!job?.inputversion) fund.push(optimeringsfund(OPTIMERINGSKODE.INPUTVERSION_MANGLER));
  if (!Number.isFinite(job?.beregningMs)) fund.push(optimeringsfund(OPTIMERINGSKODE.BEREGNINGSTID_MANGLER));
  if (!Number.isInteger(job?.maksOperationer) || job.maksOperationer <= 0) fund.push(optimeringsfund(OPTIMERINGSKODE.JOB_UGYLDIGT, { sti: "maksOperationer" }));
  if (!job?.profil?.id || !job?.profil?.version || !job?.profil?.vaegte) fund.push(optimeringsfund(OPTIMERINGSKODE.JOB_UGYLDIGT, { sti: "profil" }));
  const lokationer = liste(job?.lokationer);
  const matrixSvar = validerRejsetidsmatrix(job?.matrix, { tenantRef: job?.tenantRef, lokationer });
  fund.push(...matrixSvar.fund);
  const alle = [job, ...liste(job?.planlaegningspulje), ...liste(job?.ressourcer?.medarbejdere), ...liste(job?.ressourcer?.koeretoejer), ...liste(job?.ressourcer?.udstyr), ...lokationer];
  for (const post of alle) if (post?.tenantRef && post.tenantRef !== job?.tenantRef) fund.push(optimeringsfund(OPTIMERINGSKODE.TENANT_UOVERENSSTEMMELSE, { id: post.id || referenceNoegle(post.reference) }));
  for (const medarbejder of liste(job?.ressourcer?.medarbejdere)) if (medarbejder.reference?.art !== REFERENCEART.MEDARBEJDER) fund.push(optimeringsfund(OPTIMERINGSKODE.JOB_UGYLDIGT, { sti: "ressourcer.medarbejdere" }));
  for (const koeretoej of liste(job?.ressourcer?.koeretoejer)) if (koeretoej.reference?.art !== REFERENCEART.KOERETOEJ) fund.push(optimeringsfund(OPTIMERINGSKODE.JOB_UGYLDIGT, { sti: "ressourcer.koeretoejer" }));
  return { ok: fund.length === 0, fund };
}

export function validerOptimeringsresultat(resultat) {
  const fund = [];
  if (!resultat?.jobId || !resultat?.inputversion || !Object.values(OPTIMERINGSSTATUS).includes(resultat?.status)) fund.push(optimeringsfund(OPTIMERINGSKODE.RESULTAT_UGYLDIGT));
  if (resultat?.globaltOptimalitetsbevis !== false || resultat?.algoritme?.navn !== ALGORITME.navn) fund.push(optimeringsfund(OPTIMERINGSKODE.RESULTAT_UGYLDIGT));
  const planlagte = resultat?.dagsplanskladde?.ruter?.flatMap((rute) => rute.stop.map((stop) => stop.opgaveforekomstId)) || [];
  const ikkePlanlagte = resultat?.ikkePlanlagte?.flatMap((post) => post.forekomstIder || []) || [];
  const alle = [...planlagte, ...ikkePlanlagte];
  if (new Set(alle).size !== alle.length) fund.push(optimeringsfund(OPTIMERINGSKODE.RESULTAT_UGYLDIGT, { årsag: "dublet" }));
  const forventede = resultat?.snapshot?.opgaveforekomster?.map((forekomst) => forekomst.id) || [];
  if (forventede.length !== alle.length || forventede.some((id) => !alle.includes(id))) fund.push(optimeringsfund(OPTIMERINGSKODE.RESULTAT_UGYLDIGT, { årsag: "ufuldstændigt" }));
  if (!resultat?.maalinger?.foer || !resultat?.maalinger?.efter || !resultat?.maalinger?.delta) fund.push(optimeringsfund(OPTIMERINGSKODE.RESULTAT_UGYLDIGT, { årsag: "målinger" }));
  return { ok: fund.length === 0, fund };
}

import { createHash } from "node:crypto";

export const TRAAD_STATUS = new Set(["ny", "afventer_os", "afventer_kunden", "afsluttet"]);
export const VIDEN_STATUS = new Set(["tilgaengelig", "under_udvikling", "saerskilt_aftale"]);
export const OPFOELGNING_STATUS = new Set(["planlagt", "kladde", "godkendt", "udskudt", "pauset", "annulleret", "afsender", "accepteret_af_graph", "dokumenteret_sendt", "fejlet", "ukendt"]);

export function tekst(vaerdi, maks = 10_000) {
  return typeof vaerdi === "string" ? vaerdi.trim().slice(0, maks) : "";
}

export function normaliserEmail(vaerdi) {
  const email = tekst(vaerdi, 320).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export function stabilJson(vaerdi) {
  if (Array.isArray(vaerdi)) return `[${vaerdi.map(stabilJson).join(",")}]`;
  if (vaerdi && typeof vaerdi === "object") return `{${Object.keys(vaerdi).sort().map((k) => `${JSON.stringify(k)}:${stabilJson(vaerdi[k])}`).join(",")}}`;
  return JSON.stringify(vaerdi);
}

export const sha256 = (vaerdi) => createHash("sha256").update(typeof vaerdi === "string" || Buffer.isBuffer(vaerdi) || vaerdi instanceof Uint8Array ? vaerdi : stabilJson(vaerdi)).digest("hex");

export function dedupeNoegle(besked) {
  const korrelation = tekst(besked.eksternKorrelationId, 200);
  if (korrelation) return `korrelation:${sha256(korrelation)}`;
  const internetMessageId = tekst(besked.internetMessageId, 500).toLowerCase();
  if (internetMessageId) return `message:${sha256(internetMessageId)}`;
  // Provider-id'et er kun stabilt i den enkelte postkasse. Den samme mail kan
  // derfor have flere provider-id'er hos Dennis, Jørn og info-postkassen.
  const providerId = tekst(besked.providerId, 500);
  if (providerId) return `${tekst(besked.provider, 40) || "provider"}:${sha256(providerId)}`;
  return `indhold:${sha256({
    fra: normaliserEmail(besked.fra), til: normaliserEmail(besked.til),
    emne: tekst(besked.emne, 500), sendtMs: Number(besked.sendtMs) || 0,
    tekst: tekst(besked.tekst, 50_000),
  })}`;
}

export function traadNoegle(besked) {
  const samtale = tekst(besked.samtaleId, 500);
  return samtale ? `samtale_${sha256(samtale).slice(0, 32)}` : `traad_${sha256(`${normaliserEmail(besked.fra)}|${normaliserEmail(besked.til)}|${tekst(besked.emne, 500).replace(/^(re|sv|fw|vs):\s*/i, "").toLowerCase()}`).slice(0, 32)}`;
}

export function normaliserBesked(input) {
  const retning = input?.retning === "udgaaende" ? "udgaaende" : "indgaaende";
  const fra = normaliserEmail(input?.fra);
  const til = normaliserEmail(input?.til);
  const emne = tekst(input?.emne, 500) || "(Intet emne)";
  const brødtekst = tekst(input?.tekst, 100_000);
  if (!fra || !til || !brødtekst) throw new Error("Mail kræver gyldig afsender, modtager og tekst.");
  const vedhaeftninger = Array.isArray(input?.vedhaeftninger) ? input.vedhaeftninger.slice(0, 30).map((v) => ({
    id: tekst(v?.id, 500), navn: tekst(v?.navn, 500) || "Vedhæftning",
    mime: tekst(v?.mime, 160) || "application/octet-stream",
    stoerrelse: Math.max(0, Math.trunc(Number(v?.stoerrelse) || 0)),
    storagePath: tekst(v?.storagePath, 1_000), sha256: tekst(v?.sha256, 80),
    status: tekst(v?.status, 40) || "metadata",
  })) : [];
  const post = {
    provider: tekst(input?.provider, 40) || "ukendt", providerId: tekst(input?.providerId, 500),
    internetMessageId: tekst(input?.internetMessageId, 500), samtaleId: tekst(input?.samtaleId, 500),
    eksternKorrelationId: tekst(input?.eksternKorrelationId, 200), retning, fra, til, emne,
    tekst: brødtekst, sendtMs: Math.max(0, Math.trunc(Number(input?.sendtMs) || Date.now())),
    vedhaeftninger, kilde: tekst(input?.kilde, 80) || (retning === "indgaaende" ? "mail" : "microsoft365_sendt"),
  };
  const kontakt = input?.kontakt && typeof input.kontakt === "object" ? {
    navn: tekst(input.kontakt.navn, 300), email: normaliserEmail(input.kontakt.email || fra),
    telefon: tekst(input.kontakt.telefon, 100),
  } : null;
  const angivetTraad = tekst(input?.traadId, 160);
  const traadId = /^[A-Za-z0-9_-]+$/.test(angivetTraad) ? angivetTraad : traadNoegle(post);
  return { ...post, ...(kontakt ? { kontakt } : {}), dedupeNoegle: dedupeNoegle(post), traadId };
}

export function mailIndholdHash(post) {
  return sha256({ fra: post.fra || "", til: post.til, emne: post.emne, tekst: post.tekst, signatur: post.signatur || "", vedhaeftninger: post.vedhaeftninger || [] });
}

export function godkendelseErAktuel(opfoelgning, traad) {
  return opfoelgning?.status === "godkendt"
    && opfoelgning.godkendtIndholdHash === opfoelgning.indholdHash
    && Number(opfoelgning.basisAktivitetMs) === Number(traad?.senesteAktivitetMs || 0)
    && traad?.status !== "afsluttet";
}

export function vurderForfaldenOpfoelgning(opfoelgning, traad, nu = Date.now()) {
  if (!["planlagt", "udskudt"].includes(opfoelgning?.status) || Number(opfoelgning?.forfalderMs) > Number(nu)) return "uændret";
  if (traad?.status === "afsluttet") return "pauset_sag_afsluttet";
  if (Number(opfoelgning?.basisAktivitetMs) !== Number(traad?.senesteAktivitetMs || 0)) return "pauset_ny_aktivitet";
  return "klar_til_godkendelse";
}

/** Sidste, rene kontrol efter at et mailjob er reserveret og umiddelbart før transport. */
export function vurderMailjobFoerTransport({ job, traad, opfoelgning, svarKladde, tilbudStatus, tilbud } = {}) {
  if (job?.art === "opfoelgning") {
    if (tilbudStatus === "accepteret" || tilbud?.accept?.version) return { tilladt: false, aarsag: "tilbud_accepteret" };
    if (tilbudStatus === "afvist") return { tilladt: false, aarsag: "tilbud_afvist" };
    if (!godkendelseErAktuel(opfoelgning, traad)) return { tilladt: false, aarsag: "godkendelse_forældet" };
  }
  if (job?.art === "sagssvar") {
    const aktuelHash = mailIndholdHash(svarKladde || {});
    const aktuel = svarKladde?.status === "godkendt"
      && svarKladde.godkendtIndholdHash === aktuelHash
      && job.indholdHash === aktuelHash
      && Number(svarKladde.basisAktivitetMs) === Number(traad?.senesteAktivitetMs || 0)
      && traad?.status !== "afsluttet";
    if (!aktuel) return { tilladt: false, aarsag: "godkendelse_forældet" };
  }
  return { tilladt: true, aarsag: null };
}

export function aiBudgetKanReserveres(forbrug = {}, graense = {}, inputEstimat, outputMaks) {
  const requests = Number(forbrug.requests || 0);
  const reserveretInput = Number(forbrug.reserveretInputTokens || 0);
  const reserveretOutput = Number(forbrug.reserveretOutputTokens || 0);
  const input = Number(forbrug.inputTokens || 0);
  const output = Number(forbrug.outputTokens || 0);
  return requests + 1 <= Number(graense.requests || 0)
    && input + reserveretInput + inputEstimat <= Number(graense.inputTokens || 0)
    && output + reserveretOutput + outputMaks <= Number(graense.outputTokens || 0);
}

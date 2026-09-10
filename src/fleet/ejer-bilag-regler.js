export const BILAG_MIME = Object.freeze(["application/pdf", "image/jpeg", "image/png"]);
export const BILAG_MAX_BYTES = 20 * 1024 * 1024;
export const BILAG_STATUS = Object.freeze([
  "upload_afventer", "ny", "under_behandling", "til_gennemgang", "mulig_dublet",
  "godkendt", "klargoering_dinero", "klar_til_dinero", "matchet_dinero", "afvist", "arkiveret",
]);

const tekst = (v, n) => typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null;
const heltalEllerNull = (v) => v == null || v === "" ? null : Number.isSafeInteger(Number(v)) ? Number(v) : NaN;

export function validerBilagsfil({ filnavn, contentType, stoerrelse }) {
  const fejl = [];
  if (!tekst(filnavn, 240)) fejl.push("Filnavnet mangler.");
  if (!BILAG_MIME.includes(contentType)) fejl.push("Kun PDF, JPEG og PNG kan modtages.");
  if (!Number.isSafeInteger(stoerrelse) || stoerrelse <= 0 || stoerrelse > BILAG_MAX_BYTES) fejl.push("Filen er tom eller over 20 MB.");
  return fejl;
}

export function filsignaturMatcher(bytes, contentType) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (contentType === "application/pdf") return b.length >= 5 && String.fromCharCode(...b.slice(0, 5)) === "%PDF-";
  if (contentType === "image/jpeg") return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (contentType === "image/png") return b.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v);
  return false;
}

export function normaliserBilagsmetadata(input = {}) {
  const post = {
    leverandoer: tekst(input.leverandoer, 200), leverandoerId: tekst(input.leverandoerId, 100),
    dokumentnummer: tekst(input.dokumentnummer, 100), dato: tekst(input.dato, 10),
    forfaldsdato: tekst(input.forfaldsdato, 10), valuta: tekst(input.valuta, 3)?.toUpperCase() || "DKK",
    beloebEksklMomsOere: heltalEllerNull(input.beloebEksklMomsOere),
    momsOere: heltalEllerNull(input.momsOere), totalOere: heltalEllerNull(input.totalOere),
    kategori: tekst(input.kategori, 100), betalingsreference: tekst(input.betalingsreference, 160),
  };
  const fejl = [];
  if (post.dato && !/^\d{4}-\d{2}-\d{2}$/.test(post.dato)) fejl.push("Dato skal have formatet ÅÅÅÅ-MM-DD.");
  if (post.forfaldsdato && !/^\d{4}-\d{2}-\d{2}$/.test(post.forfaldsdato)) fejl.push("Forfaldsdato skal have formatet ÅÅÅÅ-MM-DD.");
  if (!/^[A-Z]{3}$/.test(post.valuta)) fejl.push("Valuta skal være en ISO-kode på tre bogstaver.");
  for (const felt of ["beloebEksklMomsOere", "momsOere", "totalOere"]) {
    if (Number.isNaN(post[felt]) || (post[felt] != null && post[felt] < 0)) fejl.push(`${felt} skal være et ikke-negativt heltalsbeløb i øre.`);
  }
  if (post.beloebEksklMomsOere != null && post.momsOere != null && post.totalOere != null
      && post.beloebEksklMomsOere + post.momsOere !== post.totalOere) fejl.push("Beløb ekskl. moms plus moms skal svare til totalen.");
  return { ok: fejl.length === 0, fejl, post };
}

export function bilagDedupeSignaler(a, b) {
  if (a?.fil?.sha256 && a.fil.sha256 === b?.fil?.sha256) return { art: "eksakt_fil", score: 100, grunde: ["Samme filhash"] };
  if (a?.kilde?.id && a.kilde.id === b?.kilde?.id) return { art: "eksakt_kilde", score: 100, grunde: ["Samme kilde-id"] };
  const x = a?.metadata?.aktuel || a?.metadata || {};
  const y = b?.metadata?.aktuel || b?.metadata || {};
  const grunde = [];
  if (x.leverandoerId && x.leverandoerId === y.leverandoerId) grunde.push("Samme leverandør-id");
  else if (x.leverandoer && x.leverandoer.toLowerCase() === y.leverandoer?.toLowerCase()) grunde.push("Samme leverandørnavn");
  if (x.dokumentnummer && x.dokumentnummer.toLowerCase() === y.dokumentnummer?.toLowerCase()) grunde.push("Samme dokumentnummer");
  if (x.dato && x.dato === y.dato) grunde.push("Samme dato");
  if (x.valuta && x.valuta === y.valuta) grunde.push("Samme valuta");
  if (Number.isSafeInteger(x.totalOere) && x.totalOere === y.totalOere) grunde.push("Samme total");
  const score = grunde.reduce((s, g) => s + ({ "Samme leverandør-id": 25, "Samme leverandørnavn": 15, "Samme dokumentnummer": 35, "Samme dato": 10, "Samme valuta": 5, "Samme total": 25 }[g] || 0), 0);
  return score >= 60 ? { art: "mulig", score: Math.min(99, score), grunde } : null;
}

export function beregnBogfoerteOmkostninger(posteringer, kontomapping) {
  const raekker = []; const umappede = [];
  for (const post of Object.values(posteringer || {})) {
    const mapping = kontomapping?.[post.kontonummer];
    if (!mapping?.resultatkonto) { umappede.push(post); continue; }
    const koefficient = mapping.koefficient === -1 ? -1 : 1;
    if (!Number.isSafeInteger(post.beloebOere)) { umappede.push(post); continue; }
    raekker.push({ ...post, kategori: mapping.kategori, omkostningOere: post.beloebOere * koefficient });
  }
  return { raekker, umappede, ialtOere: raekker.reduce((sum, post) => sum + post.omkostningOere, 0) };
}

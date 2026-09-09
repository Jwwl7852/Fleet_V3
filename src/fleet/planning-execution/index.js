/* Planning execution — ren kontrakt for udførelseskrav og snapshots.
 * Ingen React, Firebase, browser-API, netværk eller persistence.
 */

export const UDFOERELSESSKABELONSTATUS = Object.freeze({ AKTIV: "AKTIV", INAKTIV: "INAKTIV" });
export const KRAVNIVEAU = Object.freeze({ HARD: "HARD", ADVARSEL: "ADVARSEL", FRIVILLIG: "FRIVILLIG" });
export const MODTAGERMETODE = Object.freeze({ CHAUFFOER_INDTASTER_MAIL: "CHAUFFOER_INDTASTER_MAIL" });
export const SPOERGSMAALTYPE = Object.freeze({
  JA_NEJ: "JA_NEJ", KORT_TEKST: "KORT_TEKST", LANG_TEKST: "LANG_TEKST", TAL: "TAL",
  ENKELTVALG: "ENKELTVALG", FLERVALG: "FLERVALG", DATO: "DATO", KLOKKESLAET: "KLOKKESLAET",
  MATERIALEFORBRUG: "MATERIALEFORBRUG", BEKRAEFTELSE: "BEKRAEFTELSE",
});
export const BETINGELSESOPERATOR = Object.freeze({ ER: "ER", STOERRE_END: "STOERRE_END", MINDRE_END: "MINDRE_END" });
export const FOTOKATEGORI = Object.freeze({
  FOER: "FOER", EFTER: "EFTER", SYNLIG_SKADE: "SYNLIG_SKADE", EMBALLAGE: "EMBALLAGE",
  PLACERING: "PLACERING", LEVERINGSKVITTERING: "LEVERINGSKVITTERING", ANDET: "ANDET",
});
export const DATAKLASSIFIKATION = Object.freeze({
  UNDERSKRIFT: "FORTROLIG_PERSONOPLYSNING", FOTO: "FORTROLIG_DOKUMENTATION",
  MODTAGERMAIL: "PERSONOPLYSNING", SPOERGSMAALSVAR: "KUNDEDEFINERET_KLASSIFIKATION",
  MATERIALEREGISTRERING: "DRIFTSDATA",
});

export const UDFOERELSESKODE = Object.freeze({
  ID_MANGLER: "UDF_ID_MANGLER", VERSION_UGYLDIG: "UDF_VERSION_UGYLDIG",
  STOPREFERENCE_UKENDT: "UDF_STOPREFERENCE_UKENDT", DOKUMENTREFERENCE_MANGLER: "UDF_DOKUMENTREFERENCE_MANGLER",
  UNDERSKRIFT_UDEN_DOKUMENT: "UDF_UNDERSKRIFT_UDEN_DOKUMENT", MODTAGERMETODE_UGYLDIG: "UDF_MODTAGERMETODE_UGYLDIG",
  FOTO_ANTAL_UGYLDIGT: "UDF_FOTO_ANTAL_UGYLDIGT", SPOERGSMAAL_TEKST_MANGLER: "UDF_SPOERGSMAAL_TEKST_MANGLER",
  VALGMULIGHEDER_MANGLER: "UDF_VALGMULIGHEDER_MANGLER", BETINGELSE_REFERENCE_UKENDT: "UDF_BETINGELSE_REFERENCE_UKENDT",
  BETINGELSE_SELREFERENCE: "UDF_BETINGELSE_SELREFERENCE", BETINGELSE_CYKLUS: "UDF_BETINGELSE_CYKLUS",
  BETINGELSE_SENERE_SPOERGSMAAL: "UDF_BETINGELSE_SENERE_SPOERGSMAAL", BETINGELSE_TYPE_UGYLDIG: "UDF_BETINGELSE_TYPE_UGYLDIG",
  BETINGELSE_OPERATOR_UGYLDIG: "UDF_BETINGELSE_OPERATOR_UGYLDIG", MATERIALEKATALOG_MANGLER: "UDF_MATERIALEKATALOG_MANGLER",
  MATERIALE_ENHED_MANGLER: "UDF_MATERIALE_ENHED_MANGLER", MATERIALE_INAKTIVT: "UDF_MATERIALE_INAKTIVT",
  MATERIALE_ANTAL_UGYLDIGT: "UDF_MATERIALE_ANTAL_UGYLDIGT", SKABELON_INAKTIV: "UDF_SKABELON_INAKTIV",
});

const klon = (vaerdi) => vaerdi == null ? vaerdi : JSON.parse(JSON.stringify(vaerdi));
const liste = (vaerdi) => Array.isArray(vaerdi) ? vaerdi : [];
const fund = (kode, tekst, sti, niveau = KRAVNIVEAU.HARD) => ({ kode, niveau, tekst, sti });
const resultat = (fundVaerdi) => ({ ok: !fundVaerdi.some((post) => post.niveau === KRAVNIVEAU.HARD), fund: fundVaerdi });

export function opretMaterialetype(input) {
  return Object.freeze({
    id: String(input.id || "").trim(), navn: String(input.navn || "").trim(),
    reference: String(input.reference || "").trim(), enhed: String(input.enhed || "").trim(),
    aktiv: input.aktiv !== false, beskrivelse: String(input.beskrivelse || "").trim(),
  });
}

export function deaktiverMaterialetype(materiale) {
  return { ...klon(materiale), aktiv: false };
}

export function validerMaterialekatalog(materialer) {
  const fundVaerdi = [];
  const ider = new Set();
  for (const [indeks, materiale] of liste(materialer).entries()) {
    const sti = `materialer[${indeks}]`;
    if (!materiale.id || ider.has(materiale.id)) fundVaerdi.push(fund(UDFOERELSESKODE.ID_MANGLER, "Materialet skal have et unikt ID.", `${sti}.id`));
    ider.add(materiale.id);
    if (!materiale.enhed?.trim()) fundVaerdi.push(fund(UDFOERELSESKODE.MATERIALE_ENHED_MANGLER, "Materialet mangler en enhed.", `${sti}.enhed`));
  }
  return resultat(fundVaerdi);
}

function validerBetingelser(spoergsmaal) {
  const fundVaerdi = [];
  const indeksPrId = new Map(spoergsmaal.map((post, indeks) => [post.id, indeks]));
  const kanter = new Map(spoergsmaal.map((post) => [post.id, []]));
  for (const [indeks, post] of spoergsmaal.entries()) {
    const betingelse = post.betingelse;
    if (!betingelse) continue;
    const sti = `spoergsmaal[${indeks}].betingelse`;
    if (betingelse.spoergsmaalId === post.id) fundVaerdi.push(fund(UDFOERELSESKODE.BETINGELSE_SELREFERENCE, "Et spørgsmål må ikke afhænge af sig selv.", sti));
    const referenceIndeks = indeksPrId.get(betingelse.spoergsmaalId);
    if (referenceIndeks == null) fundVaerdi.push(fund(UDFOERELSESKODE.BETINGELSE_REFERENCE_UKENDT, "Betingelsen peger på et ukendt spørgsmål.", sti));
    else {
      kanter.get(post.id).push(betingelse.spoergsmaalId);
      if (referenceIndeks >= indeks) fundVaerdi.push(fund(UDFOERELSESKODE.BETINGELSE_SENERE_SPOERGSMAAL, "Betingelsen må kun pege på et tidligere spørgsmål.", sti));
      const kilde = spoergsmaal[referenceIndeks];
      const talOperator = [BETINGELSESOPERATOR.STOERRE_END, BETINGELSESOPERATOR.MINDRE_END].includes(betingelse.operator);
      if (talOperator && kilde.type !== SPOERGSMAALTYPE.TAL) fundVaerdi.push(fund(UDFOERELSESKODE.BETINGELSE_TYPE_UGYLDIG, "En numerisk sammenligning kræver et talspørgsmål.", sti));
      if (!Object.values(BETINGELSESOPERATOR).includes(betingelse.operator)) fundVaerdi.push(fund(UDFOERELSESKODE.BETINGELSE_OPERATOR_UGYLDIG, "Betingelsesoperatoren er ugyldig.", sti));
    }
  }
  const besoeger = new Set();
  const besoegt = new Set();
  function besog(id) {
    if (besoeger.has(id)) return true;
    if (besoegt.has(id)) return false;
    besoeger.add(id);
    for (const naeste of kanter.get(id) || []) if (besog(naeste)) return true;
    besoeger.delete(id);
    besoegt.add(id);
    return false;
  }
  if (spoergsmaal.some((post) => besog(post.id))) fundVaerdi.push(fund(UDFOERELSESKODE.BETINGELSE_CYKLUS, "Spørgsmålsbetingelserne indeholder en cirkel.", "spoergsmaal"));
  return fundVaerdi;
}

export function validerUdfoerelsesskabelon(skabelon, { stopIder = null, materialer = [] } = {}) {
  const fundVaerdi = [];
  if (!skabelon?.id) fundVaerdi.push(fund(UDFOERELSESKODE.ID_MANGLER, "Udførelsesskabelonen mangler et ID.", "id"));
  if (!Number.isInteger(skabelon?.version) || skabelon.version < 1) fundVaerdi.push(fund(UDFOERELSESKODE.VERSION_UGYLDIG, "Skabelonversionen skal være et positivt heltal.", "version"));
  const aktiveMaterialer = liste(materialer).filter((post) => post.aktiv !== false);
  for (const [profilIndeks, profil] of liste(skabelon?.stopprofiler).entries()) {
    const basis = `stopprofiler[${profilIndeks}]`;
    if (stopIder && !stopIder.includes(profil.stopId)) fundVaerdi.push(fund(UDFOERELSESKODE.STOPREFERENCE_UKENDT, "Udførelseskravet peger på et ukendt stop.", `${basis}.stopId`));
    for (const [indeks, dokument] of liste(profil.dokumenter).entries()) {
      if (!dokument.dokumentRef) fundVaerdi.push(fund(UDFOERELSESKODE.DOKUMENTREFERENCE_MANGLER, "Dokumentkravet mangler en dokumentreference.", `${basis}.dokumenter[${indeks}]`));
      if (dokument.underskrift?.paakraevet && !dokument.dokumentRef) fundVaerdi.push(fund(UDFOERELSESKODE.UNDERSKRIFT_UDEN_DOKUMENT, "Obligatorisk underskrift kræver et dokument.", `${basis}.dokumenter[${indeks}].underskrift`));
      if (dokument.underskrift?.kopiKanSendes && dokument.underskrift.modtagermetode !== MODTAGERMETODE.CHAUFFOER_INDTASTER_MAIL) fundVaerdi.push(fund(UDFOERELSESKODE.MODTAGERMETODE_UGYLDIG, "Modtagermetoden skal være CHAUFFOER_INDTASTER_MAIL.", `${basis}.dokumenter[${indeks}].underskrift.modtagermetode`));
    }
    for (const [indeks, foto] of liste(profil.fotos).entries()) {
      if (!Number.isInteger(foto.minimumAntal) || !Number.isInteger(foto.maksimumAntal) || foto.minimumAntal < 0 || foto.maksimumAntal < foto.minimumAntal) fundVaerdi.push(fund(UDFOERELSESKODE.FOTO_ANTAL_UGYLDIGT, "Fotokravets minimum og maksimum er ugyldigt.", `${basis}.fotos[${indeks}]`));
    }
    const spoergsmaal = [...liste(profil.spoergsmaal)].sort((a, b) => a.raekkefoelge - b.raekkefoelge);
    for (const [indeks, post] of spoergsmaal.entries()) {
      if (!post.tekst?.trim()) fundVaerdi.push(fund(UDFOERELSESKODE.SPOERGSMAAL_TEKST_MANGLER, "Spørgsmålet mangler tekst.", `${basis}.spoergsmaal[${indeks}].tekst`));
      if ([SPOERGSMAALTYPE.ENKELTVALG, SPOERGSMAALTYPE.FLERVALG].includes(post.type) && !liste(post.svarmuligheder).length) fundVaerdi.push(fund(UDFOERELSESKODE.VALGMULIGHEDER_MANGLER, "Et valgspørgsmål skal have svarmuligheder.", `${basis}.spoergsmaal[${indeks}].svarmuligheder`));
      if (post.type === SPOERGSMAALTYPE.MATERIALEFORBRUG && !aktiveMaterialer.length) fundVaerdi.push(fund(UDFOERELSESKODE.MATERIALEKATALOG_MANGLER, "Materialespørgsmålet kræver mindst ét aktivt materiale.", `${basis}.spoergsmaal[${indeks}]`));
    }
    fundVaerdi.push(...validerBetingelser(spoergsmaal).map((post) => ({ ...post, sti: `${basis}.${post.sti}` })));
  }
  return resultat(fundVaerdi);
}

export function opretUdfoerelsesskabelon(input, { idGenerator, tidspunktMs } = {}) {
  if (typeof idGenerator !== "function" || !Number.isFinite(tidspunktMs)) throw new TypeError("ID-generator og tidspunktMs skal injiceres.");
  return {
    ...klon(input), id: input.id || idGenerator("udfoerelsesskabelon"), version: 1,
    status: input.status || UDFOERELSESSKABELONSTATUS.AKTIV, oprettetMs: tidspunktMs, aendretMs: tidspunktMs,
  };
}

export function redigerUdfoerelsesskabelon(skabelon, aendringer, tidspunktMs) {
  if (!Number.isFinite(tidspunktMs)) throw new TypeError("tidspunktMs skal angives.");
  return { ...klon(skabelon), ...klon(aendringer), aendretMs: tidspunktMs };
}

export function opretNySkabelonVersion(skabelon, aendringer, tidspunktMs) {
  const naeste = redigerUdfoerelsesskabelon(skabelon, aendringer, tidspunktMs);
  return { ...naeste, version: skabelon.version + 1, tidligereVersion: skabelon.version };
}

export function deaktiverUdfoerelsesskabelon(skabelon, tidspunktMs) {
  return redigerUdfoerelsesskabelon(skabelon, { status: UDFOERELSESSKABELONSTATUS.INAKTIV }, tidspunktMs);
}

export function evaluerBetingelse(betingelse, svar) {
  if (!betingelse) return true;
  const vaerdi = svar?.[betingelse.spoergsmaalId];
  if (betingelse.operator === BETINGELSESOPERATOR.ER) return vaerdi === betingelse.vaerdi;
  if (betingelse.operator === BETINGELSESOPERATOR.STOERRE_END) return Number(vaerdi) > Number(betingelse.vaerdi);
  if (betingelse.operator === BETINGELSESOPERATOR.MINDRE_END) return Number(vaerdi) < Number(betingelse.vaerdi);
  return false;
}

export function snapshotUdfoerelseskrav(skabelon, stop, materialer, tidspunktMs) {
  if (!Number.isFinite(tidspunktMs)) throw new TypeError("tidspunktMs skal angives.");
  const opgavestop = liste(stop);
  const anvendteStop = new Set();
  const bindingsfund = [];
  const bundneProfiler = liste(skabelon?.stopprofiler).map((profil, indeks) => {
    const match = opgavestop.find((post) => post.id === profil.stopId)
      || opgavestop.find((post) => post.udfoerelsesprofilId === profil.id && !anvendteStop.has(post.id))
      || opgavestop.find((post) => post.type === profil.stoptype && !anvendteStop.has(post.id));
    if (!match) {
      bindingsfund.push(fund(UDFOERELSESKODE.STOPREFERENCE_UKENDT, "Udførelsesprofilen kan ikke knyttes til et stop på opgaven.", `stopprofiler[${indeks}].stopId`));
      return klon(profil);
    }
    anvendteStop.add(match.id);
    return {
      ...klon(profil), stopId: match.id,
      dokumenter: liste(profil.dokumenter).map((dokument) => ({ ...klon(dokument), stopId: match.id })),
    };
  });
  const validering = validerUdfoerelsesskabelon({ ...skabelon, stopprofiler: bundneProfiler }, { stopIder: opgavestop.map((post) => post.id), materialer });
  if (!validering.ok || skabelon.status !== UDFOERELSESSKABELONSTATUS.AKTIV) {
    const ekstra = skabelon.status === UDFOERELSESSKABELONSTATUS.AKTIV ? [] : [fund(UDFOERELSESKODE.SKABELON_INAKTIV, "En inaktiv skabelon kan ikke vælges til en ny opgave.", "status")];
    return { ok: false, fund: [...bindingsfund, ...validering.fund, ...ekstra], snapshot: null };
  }
  const anvendteMaterialer = new Map(liste(materialer).map((post) => [post.id, post]));
  const snapshot = {
    skabelonId: skabelon.id, skabelonVersion: skabelon.version, navn: skabelon.navn,
    snapshotMs: tidspunktMs, dataklassifikation: klon(DATAKLASSIFIKATION),
    stopprofiler: bundneProfiler.map((profil) => ({
      ...klon(profil),
      materialer: liste(profil.materialeIder).map((id) => anvendteMaterialer.get(id)).filter(Boolean).map((post) => ({ id: post.id, navn: post.navn, reference: post.reference, enhed: post.enhed })),
    })),
  };
  return { ok: true, fund: [], snapshot };
}

export function validerMaterialeforbrug(registrering, snapshot) {
  const tilladte = new Map(liste(snapshot?.stopprofiler).flatMap((profil) => liste(profil.materialer)).map((post) => [post.id, post]));
  const fundVaerdi = [];
  for (const [indeks, linje] of liste(registrering).entries()) {
    const materiale = tilladte.get(linje.materialeId);
    if (!materiale) fundVaerdi.push(fund(UDFOERELSESKODE.MATERIALE_INAKTIVT, "Materialet findes ikke i opgavens snapshot.", `registrering[${indeks}].materialeId`));
    if (!(Number(linje.antal) > 0)) fundVaerdi.push(fund(UDFOERELSESKODE.MATERIALE_ANTAL_UGYLDIGT, "Materialeantal skal være positivt.", `registrering[${indeks}].antal`));
  }
  return resultat(fundVaerdi);
}

export function mobilFlowForStop(stopprofil, svar = {}) {
  const trin = ["Ankommet", "Se opgaven"];
  if (liste(stopprofil?.spoergsmaal).some((post) => evaluerBetingelse(post.betingelse, svar))) trin.push("Besvar kundens spørgsmål");
  if (liste(stopprofil?.spoergsmaal).some((post) => post.type === SPOERGSMAALTYPE.MATERIALEFORBRUG && evaluerBetingelse(post.betingelse, svar))) trin.push("Registrér materialer");
  if (liste(stopprofil?.fotos).length) trin.push("Tag påkrævede billeder · Ikke tilsluttet endnu");
  if (liste(stopprofil?.dokumenter).length) trin.push("Åbn dokument · Ikke tilsluttet endnu");
  if (liste(stopprofil?.dokumenter).some((post) => post.underskrift?.paakraevet)) trin.push("Indhent modtagers underskrift · Ikke tilsluttet endnu", "Indtast modtagerens mailadresse · Ikke tilsluttet endnu", "Bekræft ønsket om afsendelse · Ikke tilsluttet endnu");
  return [...trin, "Afslut stop", "Afgået"];
}

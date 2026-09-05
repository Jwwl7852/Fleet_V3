/* src/fleet/planning-basic-validering.js
 * Rene, deterministiske Planning-validatorer. Modulet har ingen imports.
 * Facaden leverer kontraktens vokabular for at undgå en cirkulær import.
 */

export function opretPlanningValidering(k) {
  const {
    REGELNIVEAU, TIDSFORM, KILDE, REFERENCEART, OPGAVESTATUS,
    FOREKOMSTSTATUS, RUTESTATUS, DAGSPLANSTATUS, FELTKLASSIFIKATION,
    ADRESSESTATUS, GENTAGELSESART, AFHAENGIGHEDSART, AARSAGSKODE,
    referenceNoegle,
  } = k;

  const set = (o) => new Set(Object.values(o));
  const niveauer = set(REGELNIVEAU);
  const kilder = set(KILDE);
  const arter = set(REFERENCEART);
  const opgavestatusser = set(OPGAVESTATUS);
  const forekomststatusser = set(FOREKOMSTSTATUS);
  const rutestatusser = set(RUTESTATUS);
  const dagsplanstatusser = set(DAGSPLANSTATUS);
  const klassifikationer = set(FELTKLASSIFIKATION);
  const adressestatusser = set(ADRESSESTATUS);
  const gentagelsesarter = set(GENTAGELSESART);
  const afhaengighedsarter = set(AFHAENGIGHEDSART);
  const prioriteter = new Set(["lav", "normal", "hoej", "akut"]);
  const frigivneRuter = new Set([RUTESTATUS.FRIGIVET, RUTESTATUS.I_GANG, RUTESTATUS.AFSLUTTET]);
  const obj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
  const tekst = (v) => typeof v === "string" && v.trim().length > 0;
  const tid = Number.isFinite;
  const liste = (v) => Array.isArray(v) ? v : [];
  const sti = (a, b) => a ? `${a}.${b}` : b;

  function nytFund(kode, danskTekst, {
    niveau = REGELNIVEAU.HARD, sti: feltsti = null, objektId = null,
    objektReference = null, detaljer = null, reference = null,
  } = {}) {
    const objekt = referenceNoegle(objektReference) || objektId || "ukendt";
    return {
      kode, tekst: danskTekst, niveau, sti: feltsti, objektId,
      objektReference, detaljer,
      reference: reference || `${kode}:${objekt}:${feltsti || "objekt"}`,
    };
  }

  function resultat(fund = []) {
    const alle = fund.filter(Boolean);
    return {
      ok: !alle.some((f) => f.niveau === REGELNIVEAU.HARD || f.niveau === REGELNIVEAU.CONTROLLED_EXCEPTION),
      harKontrolleredeUndtagelser: alle.some((f) => f.niveau === REGELNIVEAU.CONTROLLED_EXCEPTION),
      fund: alle,
    };
  }

  function validerTypedReference(ref, {
    forventetArt = null, tilladteArter = null, tilladteKilder = null,
    sti: feltsti = "reference", objektId = null, paakraevet = true,
  } = {}) {
    const fund = [];
    if (ref == null) {
      if (paakraevet) fund.push(nytFund(AARSAGSKODE.REFERENCE_MANGLER, "Referencen mangler.", { sti: feltsti, objektId }));
      return resultat(fund);
    }
    if (!obj(ref) || !tekst(ref.kilde) || !tekst(ref.art) || !tekst(ref.id)) {
      fund.push(nytFund(AARSAGSKODE.REFERENCE_MANGLER, "En typed reference skal have kilde, art og stabilt id.", { sti: feltsti, objektId, objektReference: obj(ref) ? ref : null }));
      return resultat(fund);
    }
    if (!kilder.has(ref.kilde)) fund.push(nytFund(AARSAGSKODE.REFERENCE_KILDE_UKENDT, `Ukendt referencekilde: ${ref.kilde}.`, { sti: sti(feltsti, "kilde"), objektId, objektReference: ref }));
    if (!arter.has(ref.art)) fund.push(nytFund(AARSAGSKODE.REFERENCE_ART_UKENDT, `Ukendt referenceart: ${ref.art}.`, { sti: sti(feltsti, "art"), objektId, objektReference: ref }));
    const forventede = forventetArt ? [forventetArt] : tilladteArter;
    if (forventede && !forventede.includes(ref.art)) fund.push(nytFund(AARSAGSKODE.REFERENCE_ART_FORKERT, `Feltet kræver referencearten ${forventede.join(" eller ")}, men fik ${ref.art}.`, { sti: sti(feltsti, "art"), objektId, objektReference: ref, detaljer: { forventet: forventede } }));
    if (tilladteKilder && !tilladteKilder.includes(ref.kilde)) fund.push(nytFund(AARSAGSKODE.REFERENCE_EJERSKAB_UKLART, `Kilden ${ref.kilde} må ikke eje referencen i dette felt.`, { sti: sti(feltsti, "kilde"), objektId, objektReference: ref }));
    return resultat(fund);
  }

  function validerKlassificeretFelt(felt, { sti: feltsti = "felt", objektId = null } = {}) {
    const fund = [];
    if (!obj(felt) || !tekst(felt.noegle)) return resultat([nytFund(AARSAGSKODE.FELT_MANGLER, "Det klassificerede felt mangler en feltnøgle.", { sti: feltsti, objektId })]);
    if (!klassifikationer.has(felt.klassifikation)) fund.push(nytFund(AARSAGSKODE.KLASSIFIKATION_MANGLER, "Feltet skal have en kendt klassifikation.", { sti: sti(feltsti, "klassifikation"), objektId }));
    const harRoller = obj(felt.synlighed) && Array.isArray(felt.synlighed.roller) && felt.synlighed.roller.length > 0 && felt.synlighed.roller.every(tekst);
    const harPolitik = obj(felt.synlighed) && tekst(felt.synlighed.politik);
    if (!harRoller && !harPolitik) fund.push(nytFund(AARSAGSKODE.SYNLIGHEDSMETADATA_MANGLER, "Feltet skal have tilladte roller eller en synlighedspolitik.", { sti: sti(feltsti, "synlighed"), objektId }));
    const harVaerdi = Object.prototype.hasOwnProperty.call(felt, "vaerdi");
    const harVaerdiRef = tekst(felt.vaerdiReference);
    if (harVaerdi === harVaerdiRef) fund.push(nytFund(AARSAGSKODE.KLASSIFICERET_VAERDI_MANGLER, "Angiv præcis én af værdi eller reference til beskyttet værdi.", { sti: feltsti, objektId }));
    return resultat(fund);
  }

  function klassificerede(felter, { sti: feltsti, objektId }) {
    if (!Array.isArray(felter)) return resultat([nytFund(AARSAGSKODE.KLASSIFIKATION_MANGLER, "Adgangsstyrede oplysninger skal være en liste af klassificerede felter.", { sti: feltsti, objektId })]);
    return resultat(felter.flatMap((f, i) => validerKlassificeretFelt(f, { sti: `${feltsti}[${i}]`, objektId }).fund));
  }

  function validerTidskrav(tidskrav, { varighedMin = null, sti: feltsti = "tidskrav", objektId = null } = {}) {
    const fund = [];
    if (!obj(tidskrav) || !set(TIDSFORM).has(tidskrav.art)) return resultat([nytFund(AARSAGSKODE.TID_ART_UKENDT, "Opgaven skal have én kendt tidsform.", { sti: feltsti, objektId })]);
    const tidsfelter = ["startMs", "fraMs", "tilMs", "deadlineMs"];
    const krav = {
      [TIDSFORM.FAST]: ["startMs"], [TIDSFORM.VINDUE]: ["fraMs", "tilMs"],
      [TIDSFORM.DEADLINE]: ["deadlineMs"], [TIDSFORM.FRI]: [],
    }[tidskrav.art];
    for (const felt of krav) if (!tid(tidskrav[felt])) fund.push(nytFund(AARSAGSKODE.TID_FELT_MANGLER, `Tidsformen ${tidskrav.art} kræver ${felt}.`, { sti: sti(feltsti, felt), objektId }));
    const modstridende = tidsfelter.filter((f) => !krav.includes(f) && tidskrav[f] != null);
    if (modstridende.length) fund.push(nytFund(AARSAGSKODE.TID_MODSTRIDENDE_FELTER, `Tidsformen ${tidskrav.art} må ikke samtidig have ${modstridende.join(", ")}.`, { sti: feltsti, objektId, detaljer: { felter: modstridende } }));
    if (tidskrav.art === TIDSFORM.VINDUE && tid(tidskrav.fraMs) && tid(tidskrav.tilMs) && tidskrav.tilMs <= tidskrav.fraMs) fund.push(nytFund(AARSAGSKODE.TID_INTERVAL_UGYLDIGT, "Tidsvinduets slutning skal ligge efter starten.", { sti: feltsti, objektId }));
    if (!Number.isFinite(varighedMin) || varighedMin <= 0) fund.push(nytFund(AARSAGSKODE.FELT_UGYLDIGT, "Opgavens varighed skal være et positivt antal minutter.", { sti: "varighedMin", objektId }));
    else if (tidskrav.art === TIDSFORM.VINDUE && tid(tidskrav.fraMs) && tid(tidskrav.tilMs) && tidskrav.tilMs - tidskrav.fraMs < varighedMin * 60000) fund.push(nytFund(AARSAGSKODE.TID_VARIGHED_PASSER_IKKE, "Opgavens varighed kan ikke være i tidsvinduet.", { sti: feltsti, objektId }));
    return resultat(fund);
  }

  function kontrollerPlanlagtTid(opgave, fraMs, tilMs) {
    const fund = [];
    const objektId = opgave?.id || null;
    if (!tid(fraMs) || !tid(tilMs) || tilMs <= fraMs) return resultat([nytFund(AARSAGSKODE.TID_INTERVAL_UGYLDIGT, "Den planlagte tid er ugyldig.", { objektId, sti: "planlagtTid" })]);
    if (Number.isFinite(opgave?.varighedMin) && tilMs - fraMs !== opgave.varighedMin * 60000) fund.push(nytFund(AARSAGSKODE.TID_VARIGHED_PASSER_IKKE, "Den planlagte varighed svarer ikke til opgavens varighed.", { objektId, sti: "planlagtTid" }));
    const t = opgave?.tidskrav || {};
    if (t.art === TIDSFORM.FAST && fraMs !== t.startMs) fund.push(nytFund(AARSAGSKODE.FAST_TID_BRUD, "Opgaven starter ikke på den faste mødetid.", { objektId, sti: "tidskrav.startMs" }));
    if (t.art === TIDSFORM.VINDUE && (fraMs < t.fraMs || tilMs > t.tilMs)) fund.push(nytFund(AARSAGSKODE.TIDSVINDUE_BRUD, "Opgaven ligger uden for tidsvinduet.", { objektId, sti: "tidskrav" }));
    if (t.art === TIDSFORM.DEADLINE && tilMs > t.deadlineMs) fund.push(nytFund(AARSAGSKODE.DEADLINE_OVERSKREDET, "Opgavens deadline overskrides.", { objektId, sti: "tidskrav.deadlineMs" }));
    return resultat(fund);
  }

  function validerGentagelse(g, { sti: feltsti = "gentagelse", objektId = null } = {}) {
    if (g == null) return resultat([]);
    const fund = [];
    if (!obj(g) || !gentagelsesarter.has(g.art)) return resultat([nytFund(AARSAGSKODE.GENTAGELSE_UGYLDIG, "Ukendt gentagelsesregel.", { sti: feltsti, objektId })]);
    if ([GENTAGELSESART.DAGLIG, GENTAGELSESART.HVER_N_UGE, GENTAGELSESART.HVER_N_MAANED].includes(g.art) && (!Number.isInteger(g.interval) || g.interval <= 0)) fund.push(nytFund(AARSAGSKODE.GENTAGELSE_UGYLDIG, "Gentagelsesintervallet skal være et positivt heltal.", { sti: sti(feltsti, "interval"), objektId }));
    if ([GENTAGELSESART.UGEDAGE, GENTAGELSESART.HVER_N_UGE].includes(g.art)) {
      const dage = g.ugedage;
      if (!Array.isArray(dage) || !dage.length || dage.some((d) => !Number.isInteger(d) || d < 1 || d > 7) || new Set(dage).size !== dage.length) fund.push(nytFund(AARSAGSKODE.GENTAGELSE_UGYLDIG, "Ugedage skal være unikke heltal fra 1 til 7.", { sti: sti(feltsti, "ugedage"), objektId }));
    }
    if (g.art === GENTAGELSESART.HVER_N_MAANED && (!Number.isInteger(g.maanedsdag) || g.maanedsdag < 1 || g.maanedsdag > 31)) fund.push(nytFund(AARSAGSKODE.GENTAGELSE_UGYLDIG, "Månedsdagen skal være mellem 1 og 31.", { sti: sti(feltsti, "maanedsdag"), objektId }));
    if (g.art === GENTAGELSESART.KOPI && !tekst(g.kildeDagsplanId) && !tekst(g.kildeRuteId)) fund.push(nytFund(AARSAGSKODE.GENTAGELSE_UGYLDIG, "En kopiregel skal pege på en tidligere dagsplan eller rute.", { sti: feltsti, objektId }));
    return resultat(fund);
  }

  function kontinuitetsdefinition(v, { sti: feltsti, objektId }) {
    if (v == null) return resultat([]);
    const fund = [];
    if (!obj(v) || !tekst(v.noegle)) fund.push(nytFund(AARSAGSKODE.KONTINUITET_UGYLDIG, "Kontinuitet skal have en stabil nøgle.", { sti: feltsti, objektId }));
    if (!niveauer.has(v?.niveau)) fund.push(nytFund(AARSAGSKODE.REGELNIVEAU_UKENDT, "Kontinuitet skal have et kendt regelniveau.", { sti: sti(feltsti, "niveau"), objektId }));
    return resultat(fund);
  }

  function validerOpgave(o, { sti: basis = `opgaver.${o?.id || "ukendt"}` } = {}) {
    const objektId = o?.id || null;
    const fund = [];
    if (!obj(o) || !tekst(o.id)) return resultat([nytFund(AARSAGSKODE.ID_MANGLER, "Planning-opgaven mangler et stabilt id.", { sti: basis, objektId })]);
    fund.push(...validerTypedReference(o.reference, { forventetArt: REFERENCEART.OPGAVE, tilladteKilder: [KILDE.PLANNING], sti: sti(basis, "reference"), objektId }).fund);
    if (o.reference?.id !== o.id) fund.push(nytFund(AARSAGSKODE.REFERENCE_EJERSKAB_UKLART, "Opgavens reference-id skal være lig opgavens id.", { sti: sti(basis, "reference.id"), objektId }));
    if (!tekst(o.titel)) fund.push(nytFund(AARSAGSKODE.FELT_MANGLER, "Opgaven mangler en titel.", { sti: sti(basis, "titel"), objektId }));
    if (!opgavestatusser.has(o.status)) fund.push(nytFund(AARSAGSKODE.STATUS_UGYLDIG, "Opgaven har en ukendt status.", { sti: sti(basis, "status"), objektId }));
    if (!prioriteter.has(o.prioritet)) fund.push(nytFund(AARSAGSKODE.FELT_UGYLDIGT, "Opgaven har en ukendt prioritet.", { sti: sti(basis, "prioritet"), objektId }));
    fund.push(...validerTidskrav(o.tidskrav, { varighedMin: o.varighedMin, sti: sti(basis, "tidskrav"), objektId }).fund);
    fund.push(...validerGentagelse(o.gentagelse, { sti: sti(basis, "gentagelse"), objektId }).fund);
    fund.push(...kontinuitetsdefinition(o.kontinuitet, { sti: sti(basis, "kontinuitet"), objektId }).fund);
    fund.push(...validerTypedReference(o.kundeRef, { forventetArt: REFERENCEART.KUNDE, sti: sti(basis, "kundeRef"), objektId, paakraevet: false }).fund);
    fund.push(...validerTypedReference(o.lokationRef, { forventetArt: REFERENCEART.LOKATION, sti: sti(basis, "lokationRef"), objektId }).fund);
    for (const [i, a] of liste(o.afhaengigheder).entries()) {
      const p = `${basis}.afhaengigheder[${i}]`;
      if (!afhaengighedsarter.has(a?.art)) fund.push(nytFund(AARSAGSKODE.FELT_UGYLDIGT, "Ukendt afhængighedsart.", { sti: p, objektId }));
      if (a?.art !== AFHAENGIGHEDSART.UAFHAENGIG) fund.push(...validerTypedReference(a?.opgaveRef, { forventetArt: REFERENCEART.OPGAVE, sti: sti(p, "opgaveRef"), objektId }).fund);
      if (a?.niveau != null && !niveauer.has(a.niveau)) fund.push(nytFund(AARSAGSKODE.REGELNIVEAU_UKENDT, "Afhængigheden har et ukendt regelniveau.", { sti: sti(p, "niveau"), objektId }));
    }
    for (const [i, ref] of liste(o.krav?.udstyrRefs).entries()) fund.push(...validerTypedReference(ref, { forventetArt: REFERENCEART.UDSTYR, sti: `${basis}.krav.udstyrRefs[${i}]`, objektId }).fund);
    const bil = o.krav?.koeretoej;
    if (bil != null && !obj(bil)) fund.push(nytFund(AARSAGSKODE.FELT_UGYLDIGT, "Køretøjskravet skal være et objekt.", { sti: `${basis}.krav.koeretoej`, objektId }));
    else if (obj(bil) && bil.paakraevet === false && (liste(bil.typer).length || Object.keys(bil.kapacitet || {}).length)) fund.push(nytFund(AARSAGSKODE.FELT_UGYLDIGT, "Køretøj kan ikke være valgfrit samtidig med type- eller kapacitetskrav.", { sti: `${basis}.krav.koeretoej`, objektId }));
    for (const navn of ["praktiskeNoter", "ekstrafelter"]) if (o[navn] != null) fund.push(...klassificerede(o[navn], { sti: sti(basis, navn), objektId }).fund);
    return resultat(fund);
  }

  const gyldigDato = (dato) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dato || "")) return false;
    const [a, m, d] = dato.split("-").map(Number);
    const t = new Date(Date.UTC(a, m - 1, d));
    return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  };

  function validerOpgaveforekomst(f, { sti: basis = `opgaveforekomster.${f?.id || "ukendt"}` } = {}) {
    const objektId = f?.id || null;
    const fund = [];
    if (!obj(f) || !tekst(f.id)) return resultat([nytFund(AARSAGSKODE.ID_MANGLER, "Opgaveforekomsten mangler et stabilt id.", { sti: basis, objektId })]);
    fund.push(...validerTypedReference(f.opgaveRef, { forventetArt: REFERENCEART.OPGAVE, sti: sti(basis, "opgaveRef"), objektId }).fund);
    if (!gyldigDato(f.dato)) fund.push(nytFund(AARSAGSKODE.DAGSPLAN_DATO_UGYLDIG, "Opgaveforekomsten mangler en gyldig lokal kalenderdato.", { sti: sti(basis, "dato"), objektId }));
    if (!forekomststatusser.has(f.status)) fund.push(nytFund(AARSAGSKODE.STATUS_UGYLDIG, "Opgaveforekomsten har en ukendt status.", { sti: sti(basis, "status"), objektId }));
    return resultat(fund);
  }

  function interval(v, { sti: feltsti, objektId, kode = AARSAGSKODE.TID_INTERVAL_UGYLDIGT }) {
    return tid(v?.fraMs) && tid(v?.tilMs) && v.tilMs > v.fraMs
      ? resultat([])
      : resultat([nytFund(kode, "Intervallet skal have konkrete tider og slutte efter starten.", { sti: feltsti, objektId })]);
  }

  function validerRessource(r, { sti: basis = `ressourcer.${referenceNoegle(r?.reference) || "ukendt"}` } = {}) {
    const objektId = r?.reference?.id || null;
    const fund = [];
    fund.push(...validerTypedReference(r?.reference, { tilladteArter: [REFERENCEART.MEDARBEJDER, REFERENCEART.TEAM, REFERENCEART.KOERETOEJ, REFERENCEART.UDSTYR], sti: sti(basis, "reference"), objektId }).fund);
    if (r?.ejerKilde !== r?.reference?.kilde) fund.push(nytFund(AARSAGSKODE.REFERENCE_EJERSKAB_UKLART, "Ressourcens ejerKilde skal svare til referencekilden.", { sti: sti(basis, "ejerKilde"), objektId, objektReference: r?.reference }));
    if (!tekst(r?.visningsnavn)) fund.push(nytFund(AARSAGSKODE.FELT_MANGLER, "Ressourcen mangler et visningsnavn.", { sti: sti(basis, "visningsnavn"), objektId }));
    if (r?.reference?.art === REFERENCEART.TEAM) {
      if (r.kandidatgruppe !== true) fund.push(nytFund(AARSAGSKODE.TEAM_IKKE_KANDIDATGRUPPE, "Et team skal være markeret som kandidatgruppe.", { sti: sti(basis, "kandidatgruppe"), objektId }));
      for (const [i, ref] of liste(r.medlemRefs).entries()) fund.push(...validerTypedReference(ref, { forventetArt: REFERENCEART.MEDARBEJDER, sti: `${basis}.medlemRefs[${i}]`, objektId }).fund);
    }
    if (r?.reference?.art === REFERENCEART.KOERETOEJ && !tekst(r.koeretoej?.type)) fund.push(nytFund(AARSAGSKODE.FELT_MANGLER, "Køretøjsressourcen mangler en normaliseret type.", { sti: `${basis}.koeretoej.type`, objektId }));
    if (r?.reference?.art === REFERENCEART.MEDARBEJDER) {
      for (const [i, v] of liste(r.tilgaengelighed?.vagter).entries()) fund.push(...interval(v, { sti: `${basis}.tilgaengelighed.vagter[${i}]`, objektId }).fund);
      for (const [i, f] of liste(r.tilgaengelighed?.fravaer).entries()) {
        const p = `${basis}.tilgaengelighed.fravaer[${i}]`;
        fund.push(...interval(f, { sti: p, objektId }).fund);
        const forbudte = ["art", "aarsag", "årsag", "note", "diagnose"].filter((x) => f && x in f);
        if (forbudte.length) fund.push(nytFund(AARSAGSKODE.FRAVAER_FOELSOMT_FELT, "Normaliseret fravær må ikke afsløre fraværsårsag eller note.", { sti: p, objektId, detaljer: { felter: forbudte } }));
      }
    }
    return resultat(fund);
  }

  function validerKunde(v, { sti: basis = `kunder.${referenceNoegle(v?.reference) || "ukendt"}` } = {}) {
    const objektId = v?.reference?.id || null;
    const fund = validerTypedReference(v?.reference, { forventetArt: REFERENCEART.KUNDE, sti: sti(basis, "reference"), objektId }).fund;
    if (v?.ejerKilde !== v?.reference?.kilde) fund.push(nytFund(AARSAGSKODE.REFERENCE_EJERSKAB_UKLART, "Kundens ejerKilde skal svare til referencekilden.", { sti: sti(basis, "ejerKilde"), objektId }));
    if (!tekst(v?.navn) && !tekst(v?.kundenummer)) fund.push(nytFund(AARSAGSKODE.FELT_MANGLER, "Kunden skal have navn eller kundenummer.", { sti: basis, objektId }));
    for (const navn of ["telefon", "email", "kontakt", "kontaktperson"]) if (v?.[navn] != null) fund.push(nytFund(AARSAGSKODE.KLASSIFIKATION_MANGLER, `Kontaktfeltet ${navn} skal ligge som et klassificeret felt.`, { sti: sti(basis, navn), objektId }));
    for (const navn of ["kontaktoplysninger", "ekstrafelter"]) if (v?.[navn] != null) fund.push(...klassificerede(v[navn], { sti: sti(basis, navn), objektId }).fund);
    return resultat(fund);
  }

  function validerLokation(v, { sti: basis = `lokationer.${referenceNoegle(v?.reference) || "ukendt"}` } = {}) {
    const objektId = v?.reference?.id || null;
    const fund = validerTypedReference(v?.reference, { forventetArt: REFERENCEART.LOKATION, sti: sti(basis, "reference"), objektId }).fund;
    if (v?.ejerKilde !== v?.reference?.kilde) fund.push(nytFund(AARSAGSKODE.REFERENCE_EJERSKAB_UKLART, "Lokationens ejerKilde skal svare til referencekilden.", { sti: sti(basis, "ejerKilde"), objektId }));
    fund.push(...validerTypedReference(v?.kundeRef, { forventetArt: REFERENCEART.KUNDE, sti: sti(basis, "kundeRef"), objektId, paakraevet: false }).fund);
    if (!obj(v?.adresse) || !tekst(v.adresse.adresselinje)) fund.push(nytFund(AARSAGSKODE.FELT_MANGLER, "Lokationen mangler en adresse.", { sti: sti(basis, "adresse"), objektId }));
    if (!adressestatusser.has(v?.valideringsstatus)) fund.push(nytFund(AARSAGSKODE.FELT_UGYLDIGT, "Lokationen har en ukendt adressevalideringsstatus.", { sti: sti(basis, "valideringsstatus"), objektId }));
    if (v?.position != null && (!Number.isFinite(v.position.breddegrad) || !Number.isFinite(v.position.laengdegrad) || !tekst(v.position.oprindelse))) fund.push(nytFund(AARSAGSKODE.FELT_UGYLDIGT, "Koordinater skal have breddegrad, længdegrad og oprindelse.", { sti: sti(basis, "position"), objektId }));
    for (const navn of ["telefon", "email", "kontakt", "kontaktperson", "adgangsnote", "adgangsnotat"]) if (v?.[navn] != null) fund.push(nytFund(AARSAGSKODE.KLASSIFIKATION_MANGLER, `Feltet ${navn} skal ligge som et klassificeret felt.`, { sti: sti(basis, navn), objektId }));
    for (const navn of ["kontaktoplysninger", "adgangsnoter", "ekstrafelter"]) if (v?.[navn] != null) fund.push(...klassificerede(v[navn], { sti: sti(basis, navn), objektId }).fund);
    return resultat(fund);
  }

  function validerRute(r, { snapshot = null, sti: basis = `ruter.${r?.id || "ukendt"}` } = {}) {
    const objektId = r?.id || null;
    const fund = [];
    if (!obj(r) || !tekst(r.id)) return resultat([nytFund(AARSAGSKODE.ID_MANGLER, "Ruten mangler et stabilt id.", { sti: basis, objektId })]);
    fund.push(...validerTypedReference(r.reference, { forventetArt: REFERENCEART.RUTE, tilladteKilder: [KILDE.PLANNING], sti: sti(basis, "reference"), objektId }).fund);
    if (r.reference?.id !== r.id) fund.push(nytFund(AARSAGSKODE.REFERENCE_EJERSKAB_UKLART, "Rutens reference-id skal være lig rutens id.", { sti: `${basis}.reference.id`, objektId }));
    if (!rutestatusser.has(r.status)) fund.push(nytFund(AARSAGSKODE.STATUS_UGYLDIG, "Ruten har en ukendt status.", { sti: sti(basis, "status"), objektId }));
    fund.push(...interval(r, { sti: basis, objektId }).fund);
    fund.push(...validerTypedReference(r.kandidatTeamRef, { forventetArt: REFERENCEART.TEAM, sti: sti(basis, "kandidatTeamRef"), objektId, paakraevet: false }).fund);
    const medarbejdere = liste(r.medarbejderRefs);
    const biler = liste(r.koeretoejRefs);
    const udstyr = liste(r.udstyrRefs);
    for (const [i, ref] of medarbejdere.entries()) fund.push(...validerTypedReference(ref, { forventetArt: REFERENCEART.MEDARBEJDER, sti: `${basis}.medarbejderRefs[${i}]`, objektId }).fund);
    for (const [i, ref] of biler.entries()) fund.push(...validerTypedReference(ref, { forventetArt: REFERENCEART.KOERETOEJ, sti: `${basis}.koeretoejRefs[${i}]`, objektId }).fund);
    for (const [i, ref] of udstyr.entries()) fund.push(...validerTypedReference(ref, { forventetArt: REFERENCEART.UDSTYR, sti: `${basis}.udstyrRefs[${i}]`, objektId }).fund);
    fund.push(...validerTypedReference(r.startLokationRef, { forventetArt: REFERENCEART.LOKATION, sti: sti(basis, "startLokationRef"), objektId }).fund);
    fund.push(...validerTypedReference(r.slutLokationRef, { forventetArt: REFERENCEART.LOKATION, sti: sti(basis, "slutLokationRef"), objektId }).fund);
    if (frigivneRuter.has(r.status) && medarbejdere.length === 0) fund.push(nytFund(AARSAGSKODE.FRIGIVET_RUTE_UDEN_MEDARBEJDER, "En frigivet udførbar rute kræver en konkret medarbejder.", { sti: sti(basis, "medarbejderRefs"), objektId }));
    let forrige = -Infinity;
    const forekomster = new Set();
    for (const [i, s] of liste(r.stop).entries()) {
      const p = `${basis}.stop[${i}]`;
      if (!tekst(s?.id) || !Number.isInteger(s?.raekkefoelge) || s.raekkefoelge <= forrige) fund.push(nytFund(AARSAGSKODE.STOP_RAEKKEFOELGE_UGYLDIG, "Rutestop skal have stabilt id og entydigt stigende rækkefølge.", { sti: p, objektId }));
      forrige = s?.raekkefoelge;
      if (!tekst(s?.opgaveforekomstId)) fund.push(nytFund(AARSAGSKODE.FELT_MANGLER, "Rutestoppet mangler opgaveforekomst-id.", { sti: sti(p, "opgaveforekomstId"), objektId }));
      else if (forekomster.has(s.opgaveforekomstId)) fund.push(nytFund(AARSAGSKODE.FOREKOMST_DUBLET_TILDELING, "Opgaveforekomsten er tildelt flere gange på samme rute.", { sti: sti(p, "opgaveforekomstId"), objektId }));
      else forekomster.add(s.opgaveforekomstId);
      fund.push(...validerTypedReference(s?.opgaveRef, { forventetArt: REFERENCEART.OPGAVE, sti: sti(p, "opgaveRef"), objektId }).fund);
      fund.push(...validerTypedReference(s?.lokationRef, { forventetArt: REFERENCEART.LOKATION, sti: sti(p, "lokationRef"), objektId }).fund);
      fund.push(...validerTypedReference(s?.eksternKildeRef, { tilladteArter: [REFERENCEART.OPGAVE, REFERENCEART.RUTE], sti: sti(p, "eksternKildeRef"), objektId, paakraevet: false }).fund);
      fund.push(...interval(s, { sti: p, objektId }).fund);
      if (tid(s?.fraMs) && tid(s?.tilMs) && (s.fraMs < r.fraMs || s.tilMs > r.tilMs)) fund.push(nytFund(AARSAGSKODE.STOP_UDEN_FOR_RUTE, "Rutestoppet ligger uden for rutens planlagte interval.", { sti: p, objektId }));
      if (snapshot) {
        const f = liste(snapshot.opgaveforekomster).find((x) => x.id === s?.opgaveforekomstId);
        if (!f && tekst(s?.opgaveforekomstId)) fund.push(nytFund(AARSAGSKODE.FOREKOMST_UKENDT, "Rutestoppet peger på en ukendt opgaveforekomst.", { sti: sti(p, "opgaveforekomstId"), objektId: s.opgaveforekomstId }));
        else if (f && referenceNoegle(f.opgaveRef) !== referenceNoegle(s.opgaveRef)) fund.push(nytFund(AARSAGSKODE.STOP_FOREKOMST_UOVERENSSTEMMELSE, "Rutestoppets opgave svarer ikke til opgaveforekomsten.", { sti: p, objektId }));
      }
    }
    for (const [i, b] of liste(r.ressourcebrug).entries()) {
      const p = `${basis}.ressourcebrug[${i}]`;
      fund.push(...validerTypedReference(b?.ressourceRef, { tilladteArter: [REFERENCEART.MEDARBEJDER, REFERENCEART.KOERETOEJ, REFERENCEART.UDSTYR, REFERENCEART.LOKATION], sti: sti(p, "ressourceRef"), objektId }).fund);
      if (b?.ressourceRef?.art === REFERENCEART.TEAM) fund.push(nytFund(AARSAGSKODE.TEAM_RESERVERET_DIREKTE, "Et kandidatteam må ikke reserveres direkte.", { sti: sti(p, "ressourceRef"), objektId }));
      fund.push(...interval(b, { sti: p, objektId, kode: AARSAGSKODE.RESSOURCEINTERVAL_UGYLDIGT }).fund);
      if (tid(b?.fraMs) && tid(b?.tilMs) && (b.fraMs < r.fraMs || b.tilMs > r.tilMs)) fund.push(nytFund(AARSAGSKODE.RESSOURCEINTERVAL_UGYLDIGT, "Ressourcebrugen ligger uden for rutens interval.", { sti: p, objektId }));
    }
    return resultat(fund);
  }

  function gyldigTidszone(z) {
    if (!tekst(z) || !z.includes("/")) return false;
    try { new Intl.DateTimeFormat("da-DK", { timeZone: z }).format(0); return true; } catch { return false; }
  }

  function validerDagsplan(d, { snapshot = null, beregningMs } = {}) {
    const basis = `dagsplaner.${d?.id || "ukendt"}`;
    const objektId = d?.id || null;
    const fund = [];
    if (!obj(d) || !tekst(d.id)) return resultat([nytFund(AARSAGSKODE.ID_MANGLER, "Dagsplanen mangler et stabilt id.", { sti: basis, objektId })]);
    if (!gyldigDato(d.dato)) fund.push(nytFund(AARSAGSKODE.DAGSPLAN_DATO_UGYLDIG, "Dagsplanen skal have en gyldig lokal kalenderdato.", { sti: `${basis}.dato`, objektId }));
    if (!gyldigTidszone(d.tidszone)) fund.push(nytFund(AARSAGSKODE.TIDSZONE_UGYLDIG, "Dagsplanen skal have en gyldig IANA-tidszone.", { sti: `${basis}.tidszone`, objektId }));
    if (!Number.isInteger(d.version) || d.version <= 0) fund.push(nytFund(AARSAGSKODE.VERSION_UGYLDIG, "Dagsplanens version skal være et positivt heltal.", { sti: `${basis}.version`, objektId }));
    if (!dagsplanstatusser.has(d.status)) fund.push(nytFund(AARSAGSKODE.STATUS_UGYLDIG, "Dagsplanen har en ukendt status.", { sti: `${basis}.status`, objektId }));
    if (!tid(beregningMs) || !tid(d.beregnetMs)) fund.push(nytFund(AARSAGSKODE.BEREGNINGSTID_MANGLER, "Beregningstid skal gives eksplicit både som input og på dagsplanen.", { sti: `${basis}.beregnetMs`, objektId }));
    fund.push(...validerTypedReference(d.depotRef, { forventetArt: REFERENCEART.LOKATION, sti: `${basis}.depotRef`, objektId, paakraevet: false }).fund);
    for (const [i, r] of liste(d.ruter).entries()) {
      if (r?.dagsplanId !== d.id) fund.push(nytFund(AARSAGSKODE.REFERENCE_EJERSKAB_UKLART, "Ruten skal pege tilbage på dagsplanens id.", { sti: `${basis}.ruter[${i}].dagsplanId`, objektId: r?.id || objektId }));
      fund.push(...validerRute(r, { snapshot, sti: `${basis}.ruter[${i}]` }).fund);
    }
    const tildelte = new Set(liste(d.ruter).flatMap((r) => liste(r.stop).map((s) => s.opgaveforekomstId)));
    const forekomstIder = new Set(liste(snapshot?.opgaveforekomster).filter((f) => f.dato === d.dato).map((f) => f.id));
    const tildelingsantal = new Map();
    for (const r of liste(d.ruter)) for (const s of liste(r.stop)) tildelingsantal.set(s.opgaveforekomstId, (tildelingsantal.get(s.opgaveforekomstId) || 0) + 1);
    for (const [id, antal] of tildelingsantal) if (tekst(id) && antal > 1) fund.push(nytFund(AARSAGSKODE.FOREKOMST_DUBLET_TILDELING, "Opgaveforekomsten er tildelt flere ruter.", { sti: `${basis}.ruter`, objektId: id }));
    for (const id of liste(d.ikkeTildelteForekomstIder)) {
      if (tildelte.has(id)) fund.push(nytFund(AARSAGSKODE.IKKE_TILDELT_UOVERENSSTEMMELSE, "En opgaveforekomst kan ikke både være tildelt og ikke-tildelt.", { sti: `${basis}.ikkeTildelteForekomstIder`, objektId: id }));
      if (snapshot && !forekomstIder.has(id)) fund.push(nytFund(AARSAGSKODE.FOREKOMST_UKENDT, "Dagsplanens ikke-tildelte liste peger på en ukendt forekomst for datoen.", { sti: `${basis}.ikkeTildelteForekomstIder`, objektId: id }));
    }
    if (snapshot) {
      fund.push(...validerTildelinger(d, snapshot, beregningMs).fund);
      fund.push(...validerKontinuitet(d, snapshot).fund);
      fund.push(...kontrollerInterneTidskonflikter(d).fund);
    }
    return resultat(fund);
  }

  function validerAfhaengigheder(opgaver = []) {
    const fund = [];
    const kendte = new Map(opgaver.map((o) => [referenceNoegle(o.reference), o]));
    const kanter = new Map();
    for (const o of opgaver) {
      const fra = referenceNoegle(o.reference);
      const maal = [];
      for (const a of liste(o.afhaengigheder)) {
        if (a?.art === AFHAENGIGHEDSART.UAFHAENGIG) continue;
        const til = referenceNoegle(a?.opgaveRef);
        if (!til || !kendte.has(til)) fund.push(nytFund(AARSAGSKODE.AFHAENGIGHED_UKENDT, "Afhængigheden peger på en ukendt opgave.", { sti: `opgaver.${o.id}.afhaengigheder`, objektId: o.id, objektReference: a?.opgaveRef }));
        else if (til === fra) fund.push(nytFund(AARSAGSKODE.AFHAENGIGHED_SELREFERENCE, "En opgave må ikke afhænge af sig selv.", { sti: `opgaver.${o.id}.afhaengigheder`, objektId: o.id }));
        else if ([AFHAENGIGHEDSART.EFTER, AFHAENGIGHEDSART.AFHENTNING_FOER_LEVERING].includes(a.art)) maal.push(til);
      }
      kanter.set(fra, maal);
    }
    const farve = new Map();
    const stak = [];
    const seteCykler = new Set();
    function besoeg(n) {
      farve.set(n, 1); stak.push(n);
      for (const nabo of kanter.get(n) || []) {
        if (!farve.has(nabo)) besoeg(nabo);
        else if (farve.get(nabo) === 1) {
          const cyklus = [...stak.slice(stak.indexOf(nabo)), nabo];
          const signatur = [...new Set(cyklus)].sort().join("|");
          if (!seteCykler.has(signatur)) { seteCykler.add(signatur); fund.push(nytFund(AARSAGSKODE.AFHAENGIGHED_CYKLUS, "Opgavernes afhængigheder danner en cirkel.", { sti: "opgaver.afhaengigheder", detaljer: { cyklus } })); }
        }
      }
      stak.pop(); farve.set(n, 2);
    }
    for (const n of kanter.keys()) if (!farve.has(n)) besoeg(n);
    return resultat(fund);
  }

  const findRessourcer = (snapshot, refs, art) => {
    const noegler = new Set(liste(refs).filter((r) => !art || r.art === art).map(referenceNoegle));
    return liste(snapshot?.ressourcer).filter((r) => noegler.has(referenceNoegle(r.reference)));
  };

  function kontrollerKompetencerOgCertifikater(o, medarbejdere = [], beregningMs) {
    const fund = [];
    if (!tid(beregningMs)) return resultat([nytFund(AARSAGSKODE.BEREGNINGSTID_MANGLER, "Kompetencekontrol kræver eksplicit beregningstid.", { objektId: o?.id, sti: "beregningMs" })]);
    const kompetencer = new Set(medarbejdere.flatMap((m) => liste(m.kompetencer)));
    const certifikater = medarbejdere.flatMap((m) => liste(m.certifikater));
    for (const kode of liste(o?.krav?.kompetencer)) if (!kompetencer.has(kode)) fund.push(nytFund(AARSAGSKODE.KOMPETENCE_MANGLER, `Ingen tildelt medarbejder har kompetencen ${kode}.`, { objektId: o?.id, sti: "krav.kompetencer", detaljer: { kode } }));
    for (const kode of liste(o?.krav?.certifikater)) {
      const match = certifikater.filter((c) => c.kode === kode);
      if (!match.length) fund.push(nytFund(AARSAGSKODE.CERTIFIKAT_MANGLER, `Ingen tildelt medarbejder har certifikatet ${kode}.`, { objektId: o?.id, sti: "krav.certifikater", detaljer: { kode } }));
      else if (!match.some((c) => tid(c.udloeberMs) && c.udloeberMs >= beregningMs)) fund.push(nytFund(AARSAGSKODE.CERTIFIKAT_UDLOEBET, `Certifikatet ${kode} er udløbet på beregningstidspunktet.`, { objektId: o?.id, sti: "krav.certifikater", detaljer: { kode } }));
    }
    return resultat(fund);
  }

  const overlapper = (a, b) => a.fraMs < b.tilMs && b.fraMs < a.tilMs;

  function kontrollerInterneTidskonflikter(dagsplan) {
    const fund = [];
    const intervaller = new Map();
    for (const r of liste(dagsplan?.ruter)) {
      for (const b of liste(r.ressourcebrug)) {
        const noegle = referenceNoegle(b?.ressourceRef);
        if (!noegle || !tid(b?.fraMs) || !tid(b?.tilMs) || b.tilMs <= b.fraMs) continue;
        const gruppe = intervaller.get(noegle) || [];
        gruppe.push({ fraMs: b.fraMs, tilMs: b.tilMs, ruteId: r.id, brugId: b.id });
        intervaller.set(noegle, gruppe);
      }
    }
    for (const [noegle, gruppe] of intervaller) {
      gruppe.sort((a, b) => a.fraMs - b.fraMs || a.tilMs - b.tilMs);
      for (let i = 1; i < gruppe.length; i += 1) {
        if (overlapper(gruppe[i - 1], gruppe[i])) fund.push(nytFund(AARSAGSKODE.INTERN_TIDSKONFLIKT, `Ressourcen ${noegle} anvendes i overlappende Planning-intervaller.`, { sti: "dagsplan.ruter.ressourcebrug", objektId: dagsplan?.id || null, detaljer: { ressource: noegle, intervaller: [gruppe[i - 1], gruppe[i]] } }));
      }
    }
    return resultat(fund);
  }

  function kontrollerTilgaengelighed(medarbejdere = [], fraMs, tilMs) {
    const fund = [];
    if (!tid(fraMs) || !tid(tilMs) || tilMs <= fraMs) return resultat([nytFund(AARSAGSKODE.TID_INTERVAL_UGYLDIGT, "Tilgængelighedskontrollen kræver et gyldigt interval.", { sti: "interval" })]);
    for (const m of medarbejdere) {
      const vagter = liste(m.tilgaengelighed?.vagter);
      if (!vagter.length) fund.push(nytFund(AARSAGSKODE.VAGT_MANGLER, "Medarbejderen har ingen normaliseret vagt i snapshotet.", { objektReference: m.reference, sti: "tilgaengelighed.vagter" }));
      else if (!vagter.some((v) => v.fraMs <= fraMs && v.tilMs >= tilMs)) fund.push(nytFund(AARSAGSKODE.UDEN_FOR_VAGT, "Opgaven ligger uden for medarbejderens vagt.", { objektReference: m.reference, sti: "tilgaengelighed.vagter" }));
      if (liste(m.tilgaengelighed?.fravaer).some((f) => overlapper(f, { fraMs, tilMs }))) fund.push(nytFund(AARSAGSKODE.FRAVAER_OVERLAP, "Medarbejderen er registreret utilgængelig i intervallet.", { objektReference: m.reference, sti: "tilgaengelighed.fravaer" }));
    }
    return resultat(fund);
  }

  function kontrollerKoeretoejstypeOgKapacitet(o, koeretoejer = []) {
    const fund = [];
    const krav = o?.krav?.koeretoej;
    if (!krav || (!krav.paakraevet && !liste(krav.typer).length && !Object.keys(krav.kapacitet || {}).length)) return resultat(fund);
    if (!koeretoejer.length) return resultat([nytFund(AARSAGSKODE.KOERETOEJ_MANGLER, "Opgaven kræver et egnet køretøj.", { objektId: o?.id, sti: "krav.koeretoej" })]);
    if (liste(krav.typer).length && !koeretoejer.some((x) => krav.typer.includes(x.koeretoej?.type))) fund.push(nytFund(AARSAGSKODE.KOERETOEJSTYPE_FORKERT, "Ingen tildelte køretøjer har en krævet type.", { objektId: o?.id, sti: "krav.koeretoej.typer" }));
    for (const [felt, minimum] of Object.entries(krav.kapacitet || {})) {
      const sum = koeretoejer.reduce((n, x) => n + (Number(x.koeretoej?.kapacitet?.[felt]) || 0), 0);
      if (sum < minimum) fund.push(nytFund(AARSAGSKODE.KOERETOEJSKAPACITET_UTILSTRAEKKELIG, `Køretøjernes samlede ${felt}-kapacitet er ${sum}, men kravet er ${minimum}.`, { objektId: o?.id, sti: `krav.koeretoej.kapacitet.${felt}`, detaljer: { sum, minimum } }));
    }
    return resultat(fund);
  }

  function validerTildelinger(d, snapshot, beregningMs) {
    const fund = [];
    const opgaver = new Map(liste(snapshot.opgaver).map((o) => [referenceNoegle(o.reference), o]));
    const forekomster = new Map(liste(snapshot.opgaveforekomster).map((f) => [f.id, f]));
    for (const r of liste(d.ruter)) {
      const medarbejdere = findRessourcer(snapshot, r.medarbejderRefs, REFERENCEART.MEDARBEJDER);
      const biler = findRessourcer(snapshot, r.koeretoejRefs, REFERENCEART.KOERETOEJ);
      const udstyr = new Set(liste(r.udstyrRefs).map(referenceNoegle));
      for (const s of liste(r.stop)) {
        const o = opgaver.get(referenceNoegle(s.opgaveRef));
        if (!o || !forekomster.has(s.opgaveforekomstId)) continue;
        fund.push(...kontrollerPlanlagtTid(o, s.fraMs, s.tilMs).fund);
        fund.push(...kontrollerKompetencerOgCertifikater(o, medarbejdere, beregningMs).fund);
        fund.push(...kontrollerTilgaengelighed(medarbejdere, s.fraMs, s.tilMs).fund);
        fund.push(...kontrollerKoeretoejstypeOgKapacitet(o, biler).fund);
        for (const ref of liste(o.krav?.udstyrRefs)) if (!udstyr.has(referenceNoegle(ref))) fund.push(nytFund(AARSAGSKODE.UDSTYR_MANGLER, "Opgavens krævede udstyr er ikke tildelt ruten.", { objektId: o.id, objektReference: ref, sti: "krav.udstyrRefs" }));
      }
    }
    return resultat(fund);
  }

  function validerKontinuitet(dagsplan, snapshot) {
    const fund = [];
    const opgaver = new Map(liste(snapshot?.opgaver).map((o) => [referenceNoegle(o.reference), o]));
    const grupper = new Map();
    for (const r of liste(dagsplan?.ruter)) {
      const medarbejdere = liste(r.medarbejderRefs).map(referenceNoegle).filter(Boolean).sort();
      for (const s of liste(r.stop)) {
        const o = opgaver.get(referenceNoegle(s.opgaveRef));
        if (!o?.kontinuitet?.noegle || !medarbejdere.length) continue;
        const g = grupper.get(o.kontinuitet.noegle) || [];
        g.push({ opgave: o, medarbejdere }); grupper.set(o.kontinuitet.noegle, g);
      }
    }
    for (const [noegle, g] of grupper) {
      const tildelinger = new Set(g.map((x) => x.medarbejdere.join("|")));
      if (tildelinger.size <= 1) continue;
      const niveau = g.some((x) => x.opgave.kontinuitet.niveau === REGELNIVEAU.HARD) ? REGELNIVEAU.HARD : g.some((x) => x.opgave.kontinuitet.niveau === REGELNIVEAU.CONTROLLED_EXCEPTION) ? REGELNIVEAU.CONTROLLED_EXCEPTION : REGELNIVEAU.PREFERENCE;
      fund.push(nytFund(AARSAGSKODE.KONTINUITET_BRUD, `Kontinuitetsgruppen ${noegle} er tildelt forskellige medarbejdere.`, { niveau, sti: "dagsplan.ruter", detaljer: { noegle, tildelinger: [...tildelinger] } }));
    }
    return resultat(fund);
  }

  function validerKontrolleretUndtagelse(u, { oprindeligtFund = null } = {}) {
    const fund = [];
    const p = `undtagelser.${u?.id || "ukendt"}`;
    if (!obj(u) || !tekst(u.id) || !tekst(u.fundReference) || !tekst(u.begrundelse) || !tid(u.godkendtMs) || !tekst(u.korrelationsId)) fund.push(nytFund(AARSAGSKODE.UNDTAGELSE_UGYLDIG, "En kontrolleret undtagelse mangler id, fundreference, begrundelse, tidspunkt eller korrelations-id.", { sti: p, objektId: u?.id || null }));
    const person = obj(u?.godkendtAf) && u.godkendtAf.personRef != null;
    const rolle = obj(u?.godkendtAf) && tekst(u.godkendtAf.rolle);
    if (person === rolle) fund.push(nytFund(AARSAGSKODE.UNDTAGELSE_UGYLDIG, "Godkender skal angives med præcis én rolle eller personreference.", { sti: `${p}.godkendtAf`, objektId: u?.id || null }));
    else if (person) fund.push(...validerTypedReference(u.godkendtAf.personRef, { forventetArt: REFERENCEART.MEDARBEJDER, sti: `${p}.godkendtAf.personRef`, objektId: u?.id || null }).fund);
    if (oprindeligtFund?.niveau === REGELNIVEAU.HARD) fund.push(nytFund(AARSAGSKODE.HARD_KAN_IKKE_UNDTAGES, "Et HARD-fund kan aldrig godkendes som en undtagelse.", { sti: p, objektId: u?.id || null }));
    else if (oprindeligtFund && oprindeligtFund.niveau !== REGELNIVEAU.CONTROLLED_EXCEPTION) fund.push(nytFund(AARSAGSKODE.UNDTAGELSE_UGYLDIG, "Kun et CONTROLLED_EXCEPTION-fund kan godkendes.", { sti: p, objektId: u?.id || null }));
    return resultat(fund);
  }

  function anvendKontrolleredeUndtagelser(svar, undtagelser = []) {
    const resterende = [...(svar?.fund || [])];
    const ekstra = [];
    const godkendte = [];
    for (const u of undtagelser) {
      const i = resterende.findIndex((f) => f.reference === u?.fundReference);
      const oprindeligt = i >= 0 ? resterende[i] : null;
      const kontrol = validerKontrolleretUndtagelse(u, { oprindeligtFund: oprindeligt });
      if (!oprindeligt) ekstra.push(nytFund(AARSAGSKODE.UNDTAGELSE_UGYLDIG, "Undtagelsen peger ikke på et fund i resultatet.", { sti: `undtagelser.${u?.id || "ukendt"}.fundReference`, objektId: u?.id || null }));
      else if (kontrol.ok && oprindeligt.niveau === REGELNIVEAU.CONTROLLED_EXCEPTION) { resterende.splice(i, 1); godkendte.push({ fund: oprindeligt, undtagelse: u }); }
      ekstra.push(...kontrol.fund);
    }
    return { ...resultat([...resterende, ...ekstra]), godkendteUndtagelser: godkendte };
  }

  function validerSnapshot(snapshot, { beregningMs } = {}) {
    const fund = [];
    if (!tid(beregningMs)) fund.push(nytFund(AARSAGSKODE.BEREGNINGSTID_MANGLER, "Snapshotvalidering kræver eksplicit beregningstid.", { sti: "beregningMs" }));
    for (const [i, o] of liste(snapshot?.opgaver).entries()) fund.push(...validerOpgave(o, { sti: `opgaver[${i}]` }).fund);
    for (const [i, f] of liste(snapshot?.opgaveforekomster).entries()) fund.push(...validerOpgaveforekomst(f, { sti: `opgaveforekomster[${i}]` }).fund);
    for (const [i, r] of liste(snapshot?.ressourcer).entries()) fund.push(...validerRessource(r, { sti: `ressourcer[${i}]` }).fund);
    for (const [i, x] of liste(snapshot?.kunder).entries()) fund.push(...validerKunde(x, { sti: `kunder[${i}]` }).fund);
    for (const [i, x] of liste(snapshot?.lokationer).entries()) fund.push(...validerLokation(x, { sti: `lokationer[${i}]` }).fund);
    fund.push(...validerAfhaengigheder(liste(snapshot?.opgaver)).fund);

    const register = new Map();
    const registrerbare = [...liste(snapshot?.opgaver), ...liste(snapshot?.ressourcer), ...liste(snapshot?.kunder), ...liste(snapshot?.lokationer), ...liste(snapshot?.dagsplaner).flatMap((d) => liste(d.ruter))];
    for (const x of registrerbare) {
      const n = referenceNoegle(x?.reference);
      if (!n) continue;
      if (register.has(n)) fund.push(nytFund(AARSAGSKODE.REFERENCE_DUBLET, `Den typed reference ${n} forekommer flere gange.`, { sti: "snapshot", objektReference: x.reference }));
      else register.set(n, x);
    }
    for (const gruppe of ["opgaver", "opgaveforekomster", "dagsplaner"]) {
      const sete = new Set();
      for (const x of liste(snapshot?.[gruppe])) if (tekst(x?.id)) { if (sete.has(x.id)) fund.push(nytFund(AARSAGSKODE.ID_DUBLET, `Id'et ${x.id} forekommer flere gange i ${gruppe}.`, { sti: gruppe, objektId: x.id })); sete.add(x.id); }
    }
    const brugte = [];
    const brug = (ref, p, art = null) => { if (ref != null) brugte.push({ ref, p, art }); };
    for (const o of liste(snapshot?.opgaver)) {
      brug(o.kundeRef, `opgaver.${o.id}.kundeRef`, REFERENCEART.KUNDE); brug(o.lokationRef, `opgaver.${o.id}.lokationRef`, REFERENCEART.LOKATION);
      liste(o.afhaengigheder).forEach((a, i) => { if (a.art !== AFHAENGIGHEDSART.UAFHAENGIG) brug(a.opgaveRef, `opgaver.${o.id}.afhaengigheder[${i}].opgaveRef`, REFERENCEART.OPGAVE); });
      liste(o.krav?.udstyrRefs).forEach((r, i) => brug(r, `opgaver.${o.id}.krav.udstyrRefs[${i}]`, REFERENCEART.UDSTYR));
    }
    for (const f of liste(snapshot?.opgaveforekomster)) brug(f.opgaveRef, `opgaveforekomster.${f.id}.opgaveRef`, REFERENCEART.OPGAVE);
    for (const x of liste(snapshot?.lokationer)) brug(x.kundeRef, `lokationer.${referenceNoegle(x.reference)}.kundeRef`, REFERENCEART.KUNDE);
    for (const r of liste(snapshot?.ressourcer)) { liste(r.medlemRefs).forEach((x, i) => brug(x, `ressourcer.${referenceNoegle(r.reference)}.medlemRefs[${i}]`, REFERENCEART.MEDARBEJDER)); brug(r.stationeringRef, `ressourcer.${referenceNoegle(r.reference)}.stationeringRef`, REFERENCEART.LOKATION); }
    for (const d of liste(snapshot?.dagsplaner)) {
      brug(d.depotRef, `dagsplaner.${d.id}.depotRef`, REFERENCEART.LOKATION);
      for (const r of liste(d.ruter)) {
        brug(r.kandidatTeamRef, `ruter.${r.id}.kandidatTeamRef`, REFERENCEART.TEAM);
        liste(r.medarbejderRefs).forEach((x, i) => brug(x, `ruter.${r.id}.medarbejderRefs[${i}]`, REFERENCEART.MEDARBEJDER));
        liste(r.koeretoejRefs).forEach((x, i) => brug(x, `ruter.${r.id}.koeretoejRefs[${i}]`, REFERENCEART.KOERETOEJ));
        liste(r.udstyrRefs).forEach((x, i) => brug(x, `ruter.${r.id}.udstyrRefs[${i}]`, REFERENCEART.UDSTYR));
        brug(r.startLokationRef, `ruter.${r.id}.startLokationRef`, REFERENCEART.LOKATION); brug(r.slutLokationRef, `ruter.${r.id}.slutLokationRef`, REFERENCEART.LOKATION);
        liste(r.stop).forEach((s, i) => { brug(s.opgaveRef, `ruter.${r.id}.stop[${i}].opgaveRef`, REFERENCEART.OPGAVE); brug(s.lokationRef, `ruter.${r.id}.stop[${i}].lokationRef`, REFERENCEART.LOKATION); brug(s.eksternKildeRef, `ruter.${r.id}.stop[${i}].eksternKildeRef`); });
        liste(r.ressourcebrug).forEach((b, i) => brug(b.ressourceRef, `ruter.${r.id}.ressourcebrug[${i}].ressourceRef`));
      }
    }
    for (const x of brugte) {
      const n = referenceNoegle(x.ref);
      if (n && !register.has(n)) fund.push(nytFund(AARSAGSKODE.REFERENCE_UKENDT, `Referencen ${n} findes ikke i snapshotet.`, { sti: x.p, objektReference: x.ref }));
      if (x.art && x.ref?.art !== x.art) fund.push(nytFund(AARSAGSKODE.REFERENCE_ART_FORKERT, `Referencen i ${x.p} skal være ${x.art}.`, { sti: x.p, objektReference: x.ref }));
    }
    for (const d of liste(snapshot?.dagsplaner)) fund.push(...validerDagsplan(d, { snapshot, beregningMs }).fund);
    return resultat(fund);
  }

  return Object.freeze({
    resultat, validerTypedReference, validerKlassificeretFelt, validerTidskrav,
    kontrollerPlanlagtTid, validerGentagelse, validerOpgave, validerOpgaveforekomst,
    validerRessource, validerKunde, validerLokation, validerRute, validerDagsplan,
    validerAfhaengigheder, validerKontinuitet, validerKontrolleretUndtagelse,
    anvendKontrolleredeUndtagelser, kontrollerKompetencerOgCertifikater,
    kontrollerTilgaengelighed, kontrollerKoeretoejstypeOgKapacitet,
    kontrollerInterneTidskonflikter, validerSnapshot,
  });
}

/*
 * Isoleret lokal supporttransport til demo og kontrakttests.
 * Den bruger samme sag for kunde og ejer, men kontakter ingen backend.
 */
import {
  SUPPORT_AFSENDER,
  SUPPORT_ANSVAR,
  SUPPORT_KANAL,
  SUPPORT_KONTRAKT_VERSION,
  SUPPORT_SYNLIGHED,
  gyldigtSupportAnmodningId,
  kontekstFilter,
  kundesynligSupportSag,
  kundesynligeSupportBeskeder,
  maaEjerBehandleSupport,
  maaKundeLaeseSupportSag,
  maaPublicereSupportAi,
  renSupportTekst,
  supportStatusskift,
} from "./support.js";
import { lokaltSupportAiSvar } from "./support-ai.js";

const tomTilstand = () => ({
  sager: {}, beskeder: {}, interneNoter: {}, internAi: {}, idempotens: {},
});

const kopi = (v) => JSON.parse(JSON.stringify(v));
const sorter = (poster) => [...poster].sort((a, b) =>
  Number(a.oprettetMs || 0) - Number(b.oprettetMs || 0)
  || String(a.id).localeCompare(String(b.id), "da"));

function fejl(kode, besked) {
  const e = new Error(besked);
  e.code = kode;
  return e;
}

function idempotensNoegle(bruger, anmodningId) {
  if (!gyldigtSupportAnmodningId(anmodningId)) {
    throw fejl("invalid-argument", "anmodningId skal være 8-80 tegn og må kun indeholde bogstaver, tal, _ og -.");
  }
  return `${bruger.uid}:${anmodningId}`;
}

export function opretSupportHukommelseslager({
  storage = null,
  storageKey = "veyro:support:lokal:v1",
  viden = [],
  nu = () => Date.now(),
} = {}) {
  let memory = tomTilstand();

  const laes = () => {
    if (!storage) return kopi(memory);
    try { return { ...tomTilstand(), ...JSON.parse(storage.getItem(storageKey) || "{}") }; }
    catch { return tomTilstand(); }
  };
  const gem = (state) => {
    memory = kopi(state);
    if (storage) storage.setItem(storageKey, JSON.stringify(state));
  };
  const identitet = (bruger) => {
    if (!bruger?.uid || !bruger?.tenant) throw fejl("unauthenticated", "En verificeret kundeidentitet mangler.");
    return bruger;
  };
  const sagForKunde = (state, bruger, sagId) => {
    const sag = state.sager[sagId];
    if (!maaKundeLaeseSupportSag(sag, bruger)) throw fejl("permission-denied", "Supportsagen tilhører ikke denne bruger og tenant.");
    return sag;
  };
  const sagForEjer = (state, bruger, sagId) => {
    if (!maaEjerBehandleSupport(bruger)) throw fejl("permission-denied", "Kræver udbyderadgang.");
    const sag = state.sager[sagId];
    if (!sag) throw fejl("not-found", "Supportsagen findes ikke.");
    return sag;
  };
  const svarTilKunde = (state, sag) => ({
    sag: kundesynligSupportSag(sag),
    beskeder: sorter(Object.values(kundesynligeSupportBeskeder(state.beskeder[sag.id] || {}))),
  });
  const gemBesked = (state, sag, {
    id, anmodningId, afsenderType, afsenderUid, tekst, kilde = null,
    vedhaeftninger = [], tidspunkt = nu(),
  }) => {
    state.beskeder[sag.id] ||= {};
    state.beskeder[sag.id][id] ||= {
      id, anmodningId, synlighed: SUPPORT_SYNLIGHED.kunde,
      afsenderType, afsenderUid: afsenderUid || null,
      kanal: SUPPORT_KANAL.portal, tekst, kilde,
      vedhaeftninger, oprettetMs: tidspunkt,
    };
    return state.beskeder[sag.id][id];
  };
  const opdaterIndeks = (state, sag) => {
    state.tenantIndeks ||= {};
    state.tenantIndeks[sag.tenantId] ||= {};
    state.tenantIndeks[sag.tenantId][sag.id] = {
      oprettetAfUid: sag.oprettetAfUid, status: sag.status, opdateretMs: sag.opdateretMs,
    };
  };

  function aiKlargor(sag, tekst) {
    return {
      sagId: sag.id,
      startRevision: sag.revision,
      svar: lokaltSupportAiSvar({ tekst, viden, kontekst: sag }),
    };
  }

  function aiPublicer(kladde, anmodningId = `ai_${kladde.startRevision}_${kladde.sagId}`) {
    const state = laes();
    const sag = state.sager[kladde.sagId];
    if (!maaPublicereSupportAi(sag, kladde.startRevision)) return { publiceret: false, aarsag: "ansvar-eller-revision-aendret" };
    if (!gyldigtSupportAnmodningId(anmodningId)) anmodningId = `ai_${String(kladde.sagId).replace(/[^A-Za-z0-9_-]/g, "_")}_${kladde.startRevision}`;
    const id = `m_${anmodningId}`;
    gemBesked(state, sag, {
      id, anmodningId, afsenderType: SUPPORT_AFSENDER.ai,
      tekst: kladde.svar.tekst, kilde: kladde.svar.kilde,
    });
    sag.revision += 1;
    sag.opdateretMs = nu();
    if (kladde.svar.kilde) sag.anvendteKilder = [kladde.svar.kilde];
    if (kladde.svar.eskaler) {
      Object.assign(sag, supportStatusskift(sag, "eskaler"));
      sag.eskaleringsaarsag = kladde.svar.eskaleringsaarsag;
      sag.eskaleretMs = sag.opdateretMs;
    }
    opdaterIndeks(state, sag);
    gem(state);
    return { publiceret: true, ...svarTilKunde(state, sag) };
  }

  const kunde = (raaBruger) => {
    const bruger = identitet(raaBruger);
    return {
      async list() {
        const state = laes();
        return Object.values(state.sager)
          .filter((sag) => maaKundeLaeseSupportSag(sag, bruger))
          .map(kundesynligSupportSag)
          .sort((a, b) => Number(b.opdateretMs) - Number(a.opdateretMs));
      },
      async hent(sagId) {
        const state = laes();
        return svarTilKunde(state, sagForKunde(state, bruger, sagId));
      },
      async start({ anmodningId, emne, tekst, kontekst = {}, vedhaeftninger = [], udskydAi = false }) {
        const state = laes();
        const idem = idempotensNoegle(bruger, anmodningId);
        const tidligere = state.idempotens[idem];
        if (tidligere) return svarTilKunde(state, sagForKunde(state, bruger, tidligere.sagId));
        const rentEmne = renSupportTekst(emne, 140);
        const renTekst = renSupportTekst(tekst);
        if (!rentEmne || !renTekst) throw fejl("invalid-argument", "Emne og problembeskrivelse er påkrævet og skal holde længdegrænserne.");
        const sagId = `sup_${bruger.uid}_${anmodningId}`.replace(/[^A-Za-z0-9_-]/g, "_");
        const tidspunkt = nu();
        const filtreret = kontekstFilter(kontekst).tilladt;
        const loebenummer = String(Object.keys(state.sager).length + 1).padStart(5, "0");
        const sag = {
          kontraktVersion: SUPPORT_KONTRAKT_VERSION,
          id: sagId, nummer: `SUP-${new Date(tidspunkt).getFullYear()}-${loebenummer}`,
          tenantId: bruger.tenant, oprettetAfUid: bruger.uid,
          status: "aiDialog", ansvarstype: SUPPORT_ANSVAR.ai, ansvarligUid: null,
          emne: rentEmne, problemResume: renTekst, modul: filtreret.modul || null,
          programversion: filtreret.version || null, side: filtreret.side || null,
          kontekst: filtreret, afproevedeTrin: [], anvendteKilder: [], eskaleringsaarsag: null,
          mailTraadId: null, revision: 1, oprettetMs: tidspunkt, opdateretMs: tidspunkt,
          eskaleretMs: null, overtagetMs: null, loestMs: null,
        };
        state.sager[sagId] = sag;
        state.idempotens[idem] = { operation: "start", sagId };
        gemBesked(state, sag, {
          id: `m_${anmodningId}`, anmodningId, afsenderType: SUPPORT_AFSENDER.kunde,
          afsenderUid: bruger.uid, tekst: renTekst, vedhaeftninger, tidspunkt,
        });
        opdaterIndeks(state, sag);
        gem(state);
        const kladde = aiKlargor(sag, renTekst);
        if (udskydAi) return { ...svarTilKunde(state, sag), aiKladde: kladde };
        const publicering = aiPublicer(kladde);
        return publicering.publiceret ? { sag: publicering.sag, beskeder: publicering.beskeder } : svarTilKunde(laes(), sag);
      },
      async send({ sagId, anmodningId, tekst, vedhaeftninger = [], udskydAi = false }) {
        const state = laes();
        const sag = sagForKunde(state, bruger, sagId);
        const idem = idempotensNoegle(bruger, anmodningId);
        if (state.idempotens[idem]) return svarTilKunde(state, sag);
        const renTekst = renSupportTekst(tekst);
        if (!renTekst) throw fejl("invalid-argument", "Beskeden er tom eller for lang.");
        gemBesked(state, sag, {
          id: `m_${anmodningId}`, anmodningId, afsenderType: SUPPORT_AFSENDER.kunde,
          afsenderUid: bruger.uid, tekst: renTekst, vedhaeftninger,
        });
        state.idempotens[idem] = { operation: "send", sagId };
        sag.revision += 1;
        sag.opdateretMs = nu();
        opdaterIndeks(state, sag);
        gem(state);
        if (sag.ansvarstype === SUPPORT_ANSVAR.ejer || sag.status !== "aiDialog") return svarTilKunde(state, sag);
        const kladde = aiKlargor(sag, renTekst);
        if (udskydAi) return { ...svarTilKunde(state, sag), aiKladde: kladde };
        const publicering = aiPublicer(kladde);
        return publicering.publiceret ? { sag: publicering.sag, beskeder: publicering.beskeder } : svarTilKunde(laes(), sag);
      },
      async eskaler({ sagId, anmodningId, aarsag = "Kunden bad om menneskelig hjælp." }) {
        const state = laes();
        const sag = sagForKunde(state, bruger, sagId);
        const idem = idempotensNoegle(bruger, anmodningId);
        if (!state.idempotens[idem]) {
          const skift = supportStatusskift(sag, "eskaler");
          if (!skift) throw fejl("failed-precondition", "Sagen kan ikke eskaleres i sin nuværende status.");
          Object.assign(sag, skift);
          sag.eskaleringsaarsag = renSupportTekst(aarsag, 500) || "Kunden bad om menneskelig hjælp.";
          sag.eskaleretMs = sag.opdateretMs = nu();
          sag.revision += 1;
          state.idempotens[idem] = { operation: "eskaler", sagId };
          opdaterIndeks(state, sag);
          gem(state);
        }
        return svarTilKunde(state, sag);
      },
      async loes({ sagId, anmodningId }) {
        const state = laes(); const sag = sagForKunde(state, bruger, sagId);
        const idem = idempotensNoegle(bruger, anmodningId);
        if (!state.idempotens[idem]) {
          Object.assign(sag, supportStatusskift(sag, "loes"));
          sag.loestMs = sag.opdateretMs = nu(); sag.revision += 1;
          state.idempotens[idem] = { operation: "loes", sagId }; opdaterIndeks(state, sag); gem(state);
        }
        return svarTilKunde(state, sag);
      },
      async genaabn({ sagId, anmodningId }) {
        const state = laes(); const sag = sagForKunde(state, bruger, sagId);
        const idem = idempotensNoegle(bruger, anmodningId);
        if (!state.idempotens[idem]) {
          const skift = supportStatusskift(sag, "genaabn");
          if (!skift) throw fejl("failed-precondition", "Kun en løst sag kan genåbnes.");
          Object.assign(sag, skift); sag.loestMs = null; sag.eskaleretMs = sag.opdateretMs = nu(); sag.revision += 1;
          state.idempotens[idem] = { operation: "genaabn", sagId }; opdaterIndeks(state, sag); gem(state);
        }
        return svarTilKunde(state, sag);
      },
    };
  };

  const ejer = (bruger) => {
    if (!maaEjerBehandleSupport(bruger)) throw fejl("permission-denied", "Kræver udbyderadgang.");
    const hentEjer = async (sagId) => {
      const state = laes(); const sag = sagForEjer(state, bruger, sagId);
      return {
        sag: kopi(sag), beskeder: sorter(Object.values(state.beskeder[sagId] || {})),
        interneNoter: sorter(Object.values(state.interneNoter[sagId] || {})),
        internAi: sorter(Object.values(state.internAi[sagId] || {})),
      };
    };
    const api = {
      async list() { return Object.values(laes().sager).map(kopi).sort((a, b) => Number(b.opdateretMs) - Number(a.opdateretMs)); },
      hent: hentEjer,
      async overtag({ sagId, anmodningId, forventetRevision }) {
        const state = laes(); const sag = sagForEjer(state, bruger, sagId);
        const idem = idempotensNoegle({ uid: `ejer_${bruger.uid}` }, anmodningId);
        if (state.idempotens[idem]) return hentEjer(sagId);
        if (sag.revision !== forventetRevision) throw fejl("aborted", "Sagen er ændret. Hent den igen.");
        const skift = supportStatusskift(sag, "overtag");
        if (!skift) throw fejl("failed-precondition", "Kun en sag der afventer support kan overtages.");
        Object.assign(sag, skift, { ansvarligUid: bruger.uid });
        sag.overtagetMs = sag.opdateretMs = nu(); sag.revision += 1;
        state.idempotens[idem] = { operation: "overtag", sagId }; opdaterIndeks(state, sag); gem(state);
        return hentEjer(sagId);
      },
      async svar({ sagId, anmodningId, forventetRevision, tekst }) {
        const state = laes(); const sag = sagForEjer(state, bruger, sagId);
        const idem = idempotensNoegle({ uid: `ejer_${bruger.uid}` }, anmodningId);
        if (state.idempotens[idem]) return hentEjer(sagId);
        if (sag.revision !== forventetRevision) throw fejl("aborted", "Sagen er ændret. Hent den igen.");
        if (sag.ansvarligUid !== bruger.uid || sag.ansvarstype !== SUPPORT_ANSVAR.ejer) throw fejl("permission-denied", "Overtag sagen før du svarer.");
        const renTekst = renSupportTekst(tekst);
        if (!renTekst) throw fejl("invalid-argument", "Svaret er tomt eller for langt.");
        gemBesked(state, sag, { id: `m_${anmodningId}`, anmodningId, afsenderType: SUPPORT_AFSENDER.ejer, afsenderUid: bruger.uid, tekst: renTekst });
        sag.status = "afventerKunde"; sag.opdateretMs = nu(); sag.revision += 1;
        state.idempotens[idem] = { operation: "svar", sagId }; opdaterIndeks(state, sag); gem(state);
        return hentEjer(sagId);
      },
      async internNote({ sagId, anmodningId, tekst }) {
        const state = laes(); sagForEjer(state, bruger, sagId);
        const idem = idempotensNoegle({ uid: `ejer_${bruger.uid}` }, anmodningId);
        if (!state.idempotens[idem]) {
          const rent = renSupportTekst(tekst);
          if (!rent) throw fejl("invalid-argument", "Noten er tom eller for lang.");
          state.interneNoter[sagId] ||= {};
          state.interneNoter[sagId][`n_${anmodningId}`] = { id: `n_${anmodningId}`, tekst: rent, oprettetAfUid: bruger.uid, oprettetMs: nu() };
          state.idempotens[idem] = { operation: "internNote", sagId }; gem(state);
        }
        return hentEjer(sagId);
      },
    };
    return api;
  };

  return { kunde, ejer, aiKlargor, aiPublicer, __laes: laes };
}

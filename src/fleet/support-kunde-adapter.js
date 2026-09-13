import { demoMode, kaldFunktion, miljoe } from "../firebase.js";
import { DEMO_SUPPORT_VIDEN } from "./demo-support-viden.js";
import { opretSupportHukommelseslager } from "./support-lokal.js";

const anmodningId = (praefiks) => `${praefiks}_${crypto.randomUUID().replace(/-/g, "_")}`;

export function opretSupportKundeAdapter(bruger) {
  if (demoMode) {
    const lager = opretSupportHukommelseslager({
      storage: window.localStorage,
      storageKey: `veyro:support:v1:${miljoe}:${bruger.tenant}:${bruger.uid}`,
      viden: DEMO_SUPPORT_VIDEN,
    });
    const kunde = lager.kunde(bruger);
    return {
      lokalPrototype: true,
      list: () => kunde.list(),
      hent: (sagId) => kunde.hent(sagId),
      start: (data) => kunde.start({ ...data, anmodningId: data.anmodningId || anmodningId("start") }),
      send: (data) => kunde.send({ ...data, anmodningId: data.anmodningId || anmodningId("besked") }),
      eskaler: (data) => kunde.eskaler({ ...data, anmodningId: data.anmodningId || anmodningId("eskaler") }),
      loes: (data) => kunde.loes({ ...data, anmodningId: data.anmodningId || anmodningId("loes") }),
      genaabn: (data) => kunde.genaabn({ ...data, anmodningId: data.anmodningId || anmodningId("genaabn") }),
    };
  }
  const kald = async (navn, data = {}) => (await kaldFunktion(navn, data)).data;
  return {
    lokalPrototype: false,
    list: () => kald("supportSamtalerList"),
    hent: (sagId) => kald("supportSamtaleHent", { sagId }),
    start: (data) => kald("supportSamtaleStart", { ...data, anmodningId: data.anmodningId || anmodningId("start") }),
    send: (data) => kald("supportBeskedSend", { ...data, anmodningId: data.anmodningId || anmodningId("besked") }),
    eskaler: (data) => kald("supportEskaler", { ...data, anmodningId: data.anmodningId || anmodningId("eskaler") }),
    loes: (data) => kald("supportSagLoes", { ...data, anmodningId: data.anmodningId || anmodningId("loes") }),
    genaabn: (data) => kald("supportSagGenaabn", { ...data, anmodningId: data.anmodningId || anmodningId("genaabn") }),
  };
}

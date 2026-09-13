import { kaldFunktion } from "../firebase.js";
import {
  afsendKommunikationssvar,
  gemKommunikationsAiChat,
  gemKommunikationsSagsoplysning,
  gemKommunikationssvarkladde,
  gemSupportAiForslag,
  godkendKommunikationssvar,
  hentSalgsplatform,
  opdaterSalgstraad,
  opdaterSupportsag,
  opretSalgsnote,
} from "./ejer-salgsindbakke.js";
import { UDBYDERSVAR, tolkUdbyderfejl } from "./udbyder-regler.js";
import {
  EJER_SUPPORT_ADAPTER_STATUS,
  bygPortalAiPayload,
  bygPortalBaggrundPayload,
  erPortalSupport,
  opretEjerSupportAdapter,
  stabiltSupportAnmodningId,
  supportKanal,
} from "./ejer-support-kontrakt.js";

const udenAdapterfelt = ({ kildeAdapter: _kildeAdapter, ...payload }) => payload;

async function kaldPortal(navn, data = {}) {
  try {
    const svar = await kaldFunktion(navn, data);
    return { ok: true, art: UDBYDERSVAR.ok, data: svar?.data || null };
  } catch (fejl) {
    return { ok: false, ...tolkUdbyderfejl(fejl), data: null, kode: String(fejl?.code || "") };
  }
}

async function hentPlatform() {
  const [lokalResultat, portal] = await Promise.all([
    hentSalgsplatform().then((data) => ({ ok: true, data })).catch((fejl) => ({ ok: false, fejl })),
    kaldPortal("supportEjerKoelist"),
  ]);
  const lokal = lokalResultat.ok ? lokalResultat.data : { traade: {} };
  if (!portal.ok) {
    return {
      ...lokal,
      supportKontrakt: {
        ...EJER_SUPPORT_ADAPTER_STATUS,
        endpointTilgaengelig: false,
        privatMailEndpointTilgaengelig: lokalResultat.ok,
        fejl: portal.besked,
      },
    };
  }
  return {
    ...lokal,
    traade: { ...(lokal.traade || {}), ...(portal.data?.traade || {}) },
    supportKontrakt: {
      ...EJER_SUPPORT_ADAPTER_STATUS,
      endpointTilgaengelig: true,
      privatMailEndpointTilgaengelig: lokalResultat.ok,
    },
  };
}

const portalEllerLokal = (portalNavn, lokalHandling, bygPortalPayload) => async (payload) => {
  if (!erPortalSupport(payload)) return lokalHandling(udenAdapterfelt(payload));
  return kaldPortal(portalNavn, bygPortalPayload(payload));
};

const opdaterStatus = portalEllerLokal("supportEjerStatusOpdater", opdaterSupportsag, (payload) => ({
  sagId: payload.traadId,
  anmodningId: stabiltSupportAnmodningId(payload, "status"),
  status: payload.status,
  forventetRevision: payload.forventetRevision,
}));

const overtag = portalEllerLokal("supportEjerOvertag", opdaterSalgstraad, (payload) => ({
  sagId: payload.traadId,
  anmodningId: stabiltSupportAnmodningId(payload, "overtag"),
  forventetRevision: payload.forventetRevision,
}));

const noteSkriv = portalEllerLokal("supportEjerNoteSkriv", opretSalgsnote, (payload) => ({
  sagId: payload.traadId,
  anmodningId: stabiltSupportAnmodningId(payload, "note"),
  tekst: payload.tekst,
}));

const kladdeGem = portalEllerLokal("supportEjerSvarKladdeGem", gemKommunikationssvarkladde, (payload) => ({
  sagId: payload.traadId,
  anmodningId: stabiltSupportAnmodningId(payload, "kladde"),
  id: payload.id || "portal",
  kanal: "portal",
  tekst: payload.tekst,
  signatur: payload.signatur || "",
  vedhaeftninger: payload.vedhaeftninger || [],
  forventetSagRevision: payload.forventetSagRevision,
  forventetRevision: payload.forventetRevision || 0,
}));

const svarGodkend = portalEllerLokal("supportEjerSvarGodkend", godkendKommunikationssvar, (payload) => ({
  sagId: payload.traadId,
  anmodningId: stabiltSupportAnmodningId(payload, "godkend"),
  id: payload.id,
  forventetRevision: payload.forventetRevision,
}));

const svarSend = portalEllerLokal("supportEjerSvarTransporter", afsendKommunikationssvar, (payload) => ({
  sagId: payload.traadId,
  anmodningId: stabiltSupportAnmodningId(payload, "transport"),
  id: payload.id,
  forventetRevision: payload.forventetRevision,
}));

const aiSkriv = portalEllerLokal("supportEjerAiForslagGem", gemSupportAiForslag, bygPortalAiPayload);
const generelAiSkriv = portalEllerLokal("supportEjerAiForslagGem", gemKommunikationsAiChat, bygPortalAiPayload);
const oplysningSkriv = portalEllerLokal("supportEjerBaggrundGem", gemKommunikationsSagsoplysning, bygPortalBaggrundPayload);

export const ejerSupportAdapter = opretEjerSupportAdapter({
  hentPlatform,
  hentSag: async (payload) => erPortalSupport(payload)
    ? kaldPortal("supportEjerSagHent", { sagId: payload.traadId })
    : { ok: false, art: UDBYDERSVAR.ugyldig, data: null, besked: "Eksisterende mailtråde hentes gennem den samlede platform." },
  kanalFor: supportKanal,
  opdaterStatus,
  overtag,
  noteSkriv,
  aiSkriv,
  generelAiSkriv,
  oplysningSkriv,
  kladdeGem,
  svarGodkend,
  svarSend,
});

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
  erPortalSupport,
  opretEjerSupportAdapter,
  supportKanal,
} from "./ejer-support-kontrakt.js";

const anmodningId = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll("-", "_")}`;
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
  const lokal = await hentSalgsplatform();
  const portal = await kaldPortal("supportEjerKoelist");
  if (!portal.ok) {
    return { ...lokal, supportKontrakt: { ...EJER_SUPPORT_ADAPTER_STATUS, endpointTilgaengelig: false, fejl: portal.besked } };
  }
  return {
    ...lokal,
    traade: { ...(lokal.traade || {}), ...(portal.data?.traade || {}) },
    supportKontrakt: { ...EJER_SUPPORT_ADAPTER_STATUS, endpointTilgaengelig: true },
  };
}

const portalEllerLokal = (portalNavn, lokalHandling, bygPortalPayload) => async (payload) => {
  if (!erPortalSupport(payload)) return lokalHandling(udenAdapterfelt(payload));
  return kaldPortal(portalNavn, bygPortalPayload(payload));
};

const opdaterStatus = portalEllerLokal("supportEjerStatusOpdater", opdaterSupportsag, (payload) => ({
  sagId: payload.traadId,
  anmodningId: anmodningId("status"),
  status: payload.status,
  forventetRevision: payload.forventetRevision,
}));

const overtag = portalEllerLokal("supportEjerOvertag", opdaterSalgstraad, (payload) => ({
  sagId: payload.traadId,
  anmodningId: anmodningId("overtag"),
  forventetRevision: payload.forventetRevision,
}));

const noteSkriv = portalEllerLokal("supportEjerNoteSkriv", opretSalgsnote, (payload) => ({
  sagId: payload.traadId,
  anmodningId: anmodningId("note"),
  tekst: payload.tekst,
}));

const kladdeGem = portalEllerLokal("supportEjerSvarKladdeGem", gemKommunikationssvarkladde, (payload) => ({
  sagId: payload.traadId,
  anmodningId: anmodningId("kladde"),
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
  anmodningId: anmodningId("godkend"),
  id: payload.id,
  forventetRevision: payload.forventetRevision,
}));

const svarSend = portalEllerLokal("supportEjerSvarTransporter", afsendKommunikationssvar, (payload) => ({
  sagId: payload.traadId,
  anmodningId: payload.anmodningId || anmodningId("transport"),
  id: payload.id,
  forventetRevision: payload.forventetRevision,
}));

const portalInternFunktionMangler = async () => ({
  ok: false,
  art: UDBYDERSVAR.ugyldig,
  data: null,
  besked: "Intern AI og sagsoplysninger for portalsager afventer de fælles V1.1-endpoints. Intet er skrevet til en parallel mailtråd.",
});

const internPortalEllerLokal = (lokalHandling) => async (payload) => erPortalSupport(payload)
  ? portalInternFunktionMangler()
  : lokalHandling(udenAdapterfelt(payload));

export const ejerSupportAdapter = opretEjerSupportAdapter({
  hentPlatform,
  hentSag: async (payload) => erPortalSupport(payload)
    ? kaldPortal("supportEjerSagHent", { sagId: payload.traadId })
    : { ok: false, art: UDBYDERSVAR.ugyldig, data: null, besked: "Eksisterende mailtråde hentes gennem den samlede platform." },
  kanalFor: supportKanal,
  opdaterStatus,
  overtag,
  noteSkriv,
  aiSkriv: internPortalEllerLokal(gemSupportAiForslag),
  generelAiSkriv: internPortalEllerLokal(gemKommunikationsAiChat),
  oplysningSkriv: internPortalEllerLokal(gemKommunikationsSagsoplysning),
  kladdeGem,
  svarGodkend,
  svarSend,
});

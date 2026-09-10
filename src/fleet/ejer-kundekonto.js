import { db } from "../firebase.js";
import { kaldFunktion } from "../firebase.js";
import { tolkUdbyderfejl, UDBYDERSVAR } from "./udbyder-regler.js";

const tilListe = (objekt = {}) => Object.entries(objekt || {}).map(([id, post]) => ({ id, ...post }));

export async function hentKundekonto(tenantId) {
  const [virksomhed, moduler, abonnement, historik, konto, maalinger, invitationer, aftaler, prislister] = await Promise.all([
    db.ref(`tenants/${tenantId}/virksomhed`).once("value"),
    db.ref(`tenants/${tenantId}/moduler`).once("value"),
    db.ref(`tenants/${tenantId}/abonnement`).once("value"),
    db.ref(`tenants/${tenantId}/abonnementHistorik`).once("value"),
    db.ref(`udbyder/kundekonti/${tenantId}`).once("value"),
    db.ref(`udbyder/maalinger/${tenantId}`).once("value"),
    db.ref("udbyder/invitationer").orderByChild("tenantId").equalTo(tenantId).once("value"),
    db.ref("udbyder/aftaler").orderByChild("tenantId").equalTo(tenantId).once("value"),
    db.ref("udbyder/prisliste").orderByChild("gyldigFraMs").once("value"),
  ]);
  const maalingsliste = tilListe(maalinger.val()).sort((a, b) => String(b.id).localeCompare(String(a.id)));
  return {
    tenantId,
    virksomhed: virksomhed.val() || {}, moduler: moduler.val() || {},
    abonnement: abonnement.val() || {}, historik: historik.val() || {},
    konto: konto.val() || null, senesteMaaling: maalingsliste[0] || null,
    invitationer: tilListe(invitationer.val()).sort((a, b) => (b.oprettetMs || 0) - (a.oprettetMs || 0)),
    aftaler: tilListe(aftaler.val()).sort((a, b) => (b.opdateretMs || 0) - (a.opdateretMs || 0)),
    prislister: tilListe(prislister.val()).sort((a, b) => (b.gyldigFraMs || 0) - (a.gyldigFraMs || 0)),
  };
}

export async function gemKundekonto(data) {
  try {
    const svar = await kaldFunktion("kundekontogem", data);
    return { ok: true, art: UDBYDERSVAR.ok, data: svar?.data ?? null };
  } catch (fejl) {
    return { ok: false, ...tolkUdbyderfejl(fejl), data: null };
  }
}

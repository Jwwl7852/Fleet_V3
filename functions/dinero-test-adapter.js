/* Intern portkontrakt for en isoleret fakturatest.
 * Dette er ikke Dineros HTTP-format og må ikke anvendes som liveadapter. */

const heltal = (v) => Number.isSafeInteger(v);
export const TEST_SCENARIER = Object.freeze(["success", "timeout_after_create", "book_ok_send_fail"]);

export function byggFakturaPortPayload(snapshot, eksternReference) {
  return {
    operationKey: snapshot.forretningsnoegle,
    externalReference: eksternReference,
    documentType: "invoice",
    currency: "DKK",
    period: snapshot.periode,
    contact: {
      externalKey: snapshot.kundeId,
      name: snapshot.modtager?.navn || null,
      vatNumber: snapshot.modtager?.cvr || null,
      email: snapshot.modtager?.email || null,
      deliveryChannel: snapshot.modtager?.kanal || "manuel",
    },
    lines: (snapshot.linjer || []).map((linje, index) => ({
      sourceKey: `${snapshot.forretningsnoegle}:linje:${index + 1}`,
      description: linje.navn || [linje.modul, linje.akse, linje.brugerart].filter(Boolean).join(" · ") || `Linje ${index + 1}`,
      quantityMillis: linje.antal,
      unitAmountCents: linje.satsOere,
      vatRatePercent: linje.momssats,
      lineAmountCents: Math.round(((linje.antal || 0) * (linje.satsOere || 0)) / 1000),
    })),
    totals: { subtotalCents: snapshot.beloebOere, vatCents: snapshot.momsOere, totalCents: snapshot.ialtOere },
  };
}

export function validerFakturaPortPayload(payload) {
  const fejl = [];
  if (!payload?.operationKey || !payload.externalReference) fejl.push("Operationsnøgle eller ekstern reference mangler.");
  if (payload?.currency !== "DKK") fejl.push("Testadapteren accepterer kun DKK-kontrakten.");
  if (!payload?.contact?.externalKey || !payload.contact.name || !payload.contact.vatNumber) fejl.push("Kontaktens stabile nøgle, navn eller CVR mangler.");
  if (payload?.contact?.deliveryChannel === "email" && !payload.contact.email) fejl.push("Mailkanalen mangler modtageradresse.");
  if (!Array.isArray(payload?.lines) || !payload.lines.length) fejl.push("Fakturaen mangler linjer.");
  for (const [index, linje] of (payload?.lines || []).entries()) {
    if (!linje.sourceKey || !linje.description || !heltal(linje.quantityMillis)
        || !heltal(linje.unitAmountCents) || !heltal(linje.lineAmountCents)
        || !Number.isFinite(linje.vatRatePercent)) fejl.push(`Linje ${index + 1} bryder portkontrakten.`);
  }
  const subtotal = (payload?.lines || []).reduce((sum, linje) => sum + (linje.lineAmountCents || 0), 0);
  if (!heltal(payload?.totals?.subtotalCents) || !heltal(payload?.totals?.vatCents)
      || !heltal(payload?.totals?.totalCents) || subtotal !== payload.totals.subtotalCents
      || payload.totals.subtotalCents + payload.totals.vatCents !== payload.totals.totalCents) {
    fejl.push("Linjer, moms og totaler stemmer ikke i portkontrakten.");
  }
  return fejl;
}

export function simulerFakturaPort(payload, scenario) {
  const fejl = validerFakturaPortPayload(payload);
  if (!TEST_SCENARIER.includes(scenario)) fejl.push("Et eksplicit, tilladt testscenario mangler.");
  if (fejl.length) return { kind: "contract_error", errors: fejl };
  const base = {
    externalReference: payload.externalReference, contactExternalKey: payload.contact.externalKey,
    currency: payload.currency, subtotalCents: payload.totals.subtotalCents,
    vatCents: payload.totals.vatCents, totalCents: payload.totals.totalCents,
  };
  if (scenario === "timeout_after_create") return { kind: "unknown", draft: base };
  if (scenario === "book_ok_send_fail") return { kind: "send_error", invoice: { ...base, documentStatus: "booked" } };
  return { kind: "sent", invoice: { ...base, documentStatus: "booked", deliveryStatus: "sent" } };
}

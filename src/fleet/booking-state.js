/* src/fleet/booking-state.js
 * Bookingflowet som tilstandsmaskine. Tre roller, ikke én bruger.
 *
 *   casehandler  opretter forespørgsel
 *   disponent    laver 1-3 forslag
 *   koordinator  godkender, returnerer eller afviser
 *
 * Reglerne hører her — ikke i knapperne. Ellers kan en disponent godkende
 * sit eget forslag, og hele pointen med koordinatorleddet forsvinder.
 */

export const ROLLE = {
  casehandler: "casehandler",
  disponent: "disponent",
  koordinator: "koordinator",
  admin: "admin",
};

export const TILSTAND = {
  kladde:            { label: "Kladde",                 pill: "info"  },
  afventerPlan:      { label: "Afventer planlægning",   pill: "warn"  },
  afventerKoord:     { label: "Afventer koordinator",   pill: "warn"  },
  reserveret:        { label: "Reserveret / Booket",    pill: "ok"    },
  returneret:        { label: "Returneret til disponent", pill: "warn" },
  afvist:            { label: "Afvist",                 pill: "bad"   },
  annulleret:        { label: "Annulleret",             pill: "bad"   },
  udfoert:           { label: "Udført",                 pill: "ok"    },
};

/* fra → [{ til, roller, handling, kraeverForslag, kraeverBegrundelse }] */
const OVERGANGE = {
  kladde: [
    { til: "afventerPlan", roller: [ROLLE.casehandler, ROLLE.admin], handling: "Send til planlægning" },
    { til: "annulleret",   roller: [ROLLE.casehandler, ROLLE.admin], handling: "Annullér" },
  ],
  afventerPlan: [
    { til: "afventerKoord", roller: [ROLLE.disponent, ROLLE.admin], handling: "Send forslag", kraeverForslag: true },
    { til: "afvist",        roller: [ROLLE.disponent, ROLLE.admin], handling: "Kan ikke løses", kraeverBegrundelse: true },
  ],
  afventerKoord: [
    /* Bemærk: disponent står IKKE på listen. Den der har lavet forslaget
       må ikke godkende det. */
    { til: "reserveret",  roller: [ROLLE.koordinator, ROLLE.admin], handling: "Godkend valgt forslag", kraeverValgtForslag: true },
    { til: "returneret",  roller: [ROLLE.koordinator, ROLLE.admin], handling: "Returnér til disponent", kraeverBegrundelse: true },
    { til: "afvist",      roller: [ROLLE.koordinator, ROLLE.admin], handling: "Afvis alle", kraeverBegrundelse: true },
  ],
  returneret: [
    { til: "afventerKoord", roller: [ROLLE.disponent, ROLLE.admin], handling: "Send nye forslag", kraeverForslag: true },
    { til: "afvist",        roller: [ROLLE.disponent, ROLLE.admin], handling: "Kan ikke løses", kraeverBegrundelse: true },
  ],
  reserveret: [
    { til: "udfoert",    roller: [ROLLE.disponent, ROLLE.koordinator, ROLLE.admin], handling: "Markér udført" },
    { til: "annulleret", roller: [ROLLE.koordinator, ROLLE.admin], handling: "Annullér booking", kraeverBegrundelse: true },
  ],
  afvist: [
    { til: "afventerPlan", roller: [ROLLE.casehandler, ROLLE.admin], handling: "Genåbn forespørgsel" },
  ],
  udfoert: [],
  annulleret: [],
};

/** Hvad må denne rolle gøre lige nu. Driver knapperne i UI'et. */
export function tilgaengeligeHandlinger(tilstand, rolle) {
  return (OVERGANGE[tilstand] || []).filter((o) => o.roller.includes(rolle));
}

/**
 * kanSkifte(booking, tilTilstand, rolle, { begrundelse })
 * → { ok, aarsag }
 */
export function kanSkifte(booking, tilTilstand, rolle, { begrundelse } = {}) {
  const o = (OVERGANGE[booking.tilstand] || []).find((x) => x.til === tilTilstand);
  if (!o) return { ok: false, aarsag: `Kan ikke gå fra ${TILSTAND[booking.tilstand]?.label} til ${TILSTAND[tilTilstand]?.label}.` };
  if (!o.roller.includes(rolle)) return { ok: false, aarsag: `Din rolle må ikke udføre "${o.handling}".` };
  if (o.kraeverForslag && !(booking.forslag?.length > 0)) return { ok: false, aarsag: "Der skal være mindst ét forslag." };
  if (o.kraeverValgtForslag && !booking.valgtForslagId) return { ok: false, aarsag: "Vælg et forslag før godkendelse." };
  if (o.kraeverBegrundelse && !begrundelse?.trim()) return { ok: false, aarsag: "Angiv en begrundelse." };
  return { ok: true };
}

/**
 * Bygger den opdatering der skal skrives. Skriver ALTID til historik —
 * "Historik"-knappen i mockuppen skal have noget at vise, og en afvist
 * booking skal kunne forklares et halvt år senere.
 *
 * Selve skrivningen hører i en Cloud Function: rolletjek på klienten kan
 * omgås, og reservationen i reserveret-tilstanden skal oprettes atomisk
 * sammen med tilstandsskiftet.
 */
export function byggSkifte(booking, tilTilstand, { rolle, bruger, begrundelse, valgtForslagId }) {
  const nu = Date.now();
  return {
    tilstand: tilTilstand,
    valgtForslagId: valgtForslagId ?? booking.valgtForslagId ?? null,
    sidstAendretMs: nu,
    sidstAendretAf: bruger,
    [`historik/${nu}`]: {
      fra: booking.tilstand,
      til: tilTilstand,
      rolle,
      af: bruger,
      begrundelse: begrundelse || null,
      ms: nu,
    },
  };
}

/** Nummerserie. Bookingnumre skal komme fra en counter i en transaction,
 *  ikke fra en optælling af eksisterende bookinger. */
export async function naesteBookingnummer(db, path) {
  const aar = new Date().getFullYear();
  const ref = db.ref(path(`countere/booking/${aar}`));
  const res = await ref.transaction((n) => (n || 0) + 1);
  return `BKG-${aar}-${String(res.snapshot.val()).padStart(5, "0")}`;
}

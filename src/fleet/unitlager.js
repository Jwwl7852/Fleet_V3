import { kaldFunktion } from "../firebase.js";
import { tolkUdlaansfejl, UDLAANSSVAR } from "./udlaan-regler.js";

export const UNITLAGERFUNKTION = "unitlagerhandling";

/** Klientadapter til den fælles UNIT/WAREHOUSE-kontrakt. Kilden er eksplicit,
 * men tenant, bruger, fra-lokation og tidspunkt udledes altid på serveren. */
export async function unitlagerhandling({
  operationId, unitId, art, tilPladsId, bookingId, reference,
  kilde = "unitbooking",
}) {
  try {
    const svar = await kaldFunktion(UNITLAGERFUNKTION, {
      operationId, unitId, art, kilde,
      tilPladsId: tilPladsId || undefined,
      bookingId: bookingId || undefined,
      reference: reference || undefined,
    });
    return { ok: true, art: UDLAANSSVAR.ok, besked: null, data: svar?.data ?? null };
  } catch (fejl) {
    if (/ingen Firebase-app/i.test(String(fejl?.message))) {
      return { ok: false, art: UDLAANSSVAR.demo, besked: "Demo-tilstand: ingen fysisk bevægelse blev gemt.", data: null };
    }
    return { ok: false, ...tolkUdlaansfejl(fejl), data: null };
  }
}

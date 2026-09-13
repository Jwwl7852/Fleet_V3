import { kaldFunktion } from "../firebase.js";
import { tolkLagerfejl } from "./warehouse.js";

export const UNITLAGERFUNKTION = "unitlagerhandling";
export const UNITLAGEROPRETFUNKTION = "unitlageropret";

const operationId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `unit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export function nyUnitOperationId() {
  return operationId();
}

export async function opretWarehouseUnit({
  unitId, typeId, typeNavn, hjemPladsId, modtagelsesPladsId,
  reference, note, operationId: valgtOperationId,
}) {
  const id = valgtOperationId || operationId();
  try {
    const svar = await kaldFunktion(UNITLAGEROPRETFUNKTION, {
      kilde: "warehouse", operationId: id, unitId, typeId,
      typeNavn: typeNavn?.trim() || undefined,
      hjemPladsId: hjemPladsId || undefined, modtagelsesPladsId,
      reference: reference?.trim() || undefined,
      note: note?.trim() || undefined,
    });
    return { ok: true, data: svar?.data || null, operationId: id };
  } catch (fejl) {
    if (/ingen Firebase-app/i.test(String(fejl?.message))) {
      return {
        ok: false, art: "demo",
        besked: "Demo-tilstand: Du kan gennemgå formularen, men unitten bliver ikke gemt.",
        operationId: id,
      };
    }
    const tolket = tolkLagerfejl(fejl);
    return { ok: false, ...tolket, operationId: id };
  }
}

export async function skrivUnitLagerhandling({
  unitId, art, tilPladsId, bookingId, reference, operationId: valgtOperationId,
}) {
  const id = valgtOperationId || operationId();
  try {
    const svar = await kaldFunktion(UNITLAGERFUNKTION, {
      kilde: "warehouse",
      unitId,
      art,
      tilPladsId: tilPladsId || undefined,
      bookingId: bookingId || undefined,
      reference: reference?.trim() || undefined,
      operationId: id,
    });
    return { ok: true, data: svar?.data || null, operationId: id };
  } catch (fejl) {
    if (/ingen Firebase-app/i.test(String(fejl?.message))) {
      return {
        ok: false,
        art: "demo",
        besked: "Demo-tilstand: Du kan gennemgå handlingen, men placeringen bliver ikke ændret.",
        operationId: id,
      };
    }
    const tolket = tolkLagerfejl(fejl);
    return { ok: false, ...tolket, operationId: id };
  }
}

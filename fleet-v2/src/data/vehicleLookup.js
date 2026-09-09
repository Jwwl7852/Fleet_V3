export class VehicleLookupError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "VehicleLookupError";
    this.code = code;
  }
}

export function normalizeDanishRegistration(value = "") {
  return value
    .trim()
    .toLocaleUpperCase("da-DK")
    .replace(/[\s-]+/g, "")
    .replace(/[^0-9A-ZÆØÅ]/g, "");
}

export function normalizeExternalLength(value, unit = "cm") {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const factors = { mm: 0.1, cm: 1, m: 100 };
  if (!factors[unit]) return null;
  return Number((parsed * factors[unit]).toFixed(2));
}

export function mapVehicleLookupResult(result) {
  const dimensions = result.dimensions || {};
  return {
    source: result.source || "Ukendt datakilde",
    lookedUpAt: result.lookedUpAt || new Date().toISOString(),
    registration: normalizeDanishRegistration(result.registration),
    fields: {
      make: result.make || "",
      model: result.model || "",
      variant: result.variant || "",
      type: result.type || "",
      firstRegistrationDate: result.firstRegistrationDate || "",
      year: result.modelYear || "",
      fuel: result.fuel || "",
      serialNumber: result.serialNumber || "",
      color: result.color || "",
      curbWeightKg: result.curbWeightKg ?? "",
      grossWeightKg: result.grossWeightKg ?? "",
      lengthCm: normalizeExternalLength(dimensions.length, dimensions.unit),
      widthCm: normalizeExternalLength(dimensions.width, dimensions.unit),
      heightCm: normalizeExternalLength(dimensions.height, dimensions.unit),
    },
    historicalOdometer: result.historicalOdometer || null,
  };
}

export const disconnectedVehicleLookup = {
  kind: "not-configured",
  async lookup() {
    throw new VehicleLookupError(
      "not-configured",
      "Nummerpladeopslag er ikke tilsluttet. Vælg og godkend en server-side datakilde først.",
    );
  },
};

export const TECHNICAL_UNIT_TYPES = Object.freeze({
  traekker: "Trækker",
  lastbil: "Lastbil",
  varevogn: "Varevogn",
  bus: "Bus",
  minibus: "Minibus",
  scooter: "Scooter",
  truck: "Truck",
  trailer: "Trailer",
  paahaeng: "Påhængsvogn",
});

const FLEET_TYPE_BY_TECHNICAL_TYPE = Object.freeze({
  scooter: "scooter",
  truck: "machine",
  trailer: "equipment",
  paahaeng: "equipment",
});

export const fleetTypeForTechnicalType = (technicalType) =>
  FLEET_TYPE_BY_TECHNICAL_TYPE[technicalType] || "vehicle";

export const unitTypeKey = (unit = {}) => unit.categoryId || `legacy:${unit.type || "unknown"}`;

export function unitTypeById(types = [], id = "") {
  return types.find((type) => type.id === id) || null;
}

export function selectableUnitTypes(types = [], currentId = "") {
  return types.filter((type) => type.aktiv !== false || type.id === currentId);
}

/**
 * En eksisterende kategori-reference er altid den brugerrettede sandhed.
 * Den tekniske art er fortsat nødvendig for felter og beregninger, men den
 * må ikke stiltiende omskrive kategoriId. Uenigheder rapporteres derfor og
 * kræver et eksplicit valg eller en rettelse i Opsætning.
 */
export function resolveUnitType(unit = {}, types = []) {
  const categoryId = unit.categoryId || unit.kategoriId || "";
  const selected = unitTypeById(types, categoryId);
  if (!categoryId) {
    return {
      selected: null,
      name: null,
      conflict: unit.art
        ? `Enheden har den tekniske klassifikation ${unit.art}, men ingen Enhedstype.`
        : "Enheden har ingen Enhedstype.",
    };
  }
  if (!selected) {
    return {
      selected: null,
      name: `Ukendt enhedstype (${categoryId})`,
      conflict: `Enhedstypen ${categoryId} findes ikke længere i kundens opsætning.`,
    };
  }
  if (!selected.tekniskArt) {
    return {
      selected,
      name: selected.navn,
      conflict: `Enhedstypen ${selected.navn} mangler en teknisk grundtype i Opsætning.`,
    };
  }
  if (unit.art && selected.tekniskArt !== unit.art) {
    return {
      selected,
      name: selected.navn,
      conflict: `Enhedstypen ${selected.navn} bruger ${selected.tekniskArt}, mens enheden er gemt som ${unit.art}.`,
    };
  }
  return { selected, name: selected.navn, conflict: null };
}

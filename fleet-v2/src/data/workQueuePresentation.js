/**
 * Arbejdskøen viser både lokale prototypesager og serverstyrede servicesager.
 * Ressourcer/Enheder er autoritativ, men en lokal sag kan fortsat referere til
 * en lokal prototypeenhed. Bevar derfor de lokale relationer i køvisningen og
 * lad altid en autoritativ enhed med samme stabile id overskrive prototypen.
 */
export function workQueueUnits(localUnits = [], authoritativeUnits = []) {
  const byId = new Map(localUnits.map((unit) => [unit.id, unit]));
  authoritativeUnits.forEach((unit) => byId.set(unit.id, unit));
  return [...byId.values()];
}

/**
 * Den kompakte linje under sagstitlen er enhedsnummer og mærke/model. Hvis
 * relationen reelt mangler, sig præcist hvad der mangler i stedet for den
 * tidligere uspecifikke tekst "– Ikke oplyst".
 */
export function workQueueUnitLabel(item, unit) {
  if (unit) {
    const model = [unit.make, unit.model].filter(Boolean).join(" ") || "model ikke oplyst";
    return `${unit.number} · ${model}`;
  }
  if (item?.unitId) return `Enhed ${item.unitId} · stamdata ikke fundet`;
  return "Enhedsrelation mangler";
}

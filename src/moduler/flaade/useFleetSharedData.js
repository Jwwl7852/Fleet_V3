import { useListe } from "../../fleet/useListe.js";
import { DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";
import { DEFAULT_FLEET_CATEGORIES } from "../../../fleet-v2/src/data/fleetCategories.js";

const FALLBACK_CATEGORIES = DEFAULT_FLEET_CATEGORIES.map((item) => ({
  id: item.id,
  navn: item.name,
  aktiv: item.active,
  sortering: item.order,
  brugIndberetning: item.usages.report,
  brugOmkostning: item.usages.cost,
}));

/**
 * FLEETs fælles stamdata læses ét sted. Leverandørlisten er adgangsbevidst:
 * brugere uden leverandøradgang får ingen forespørgsel og ser fortsat deres
 * lovlige FLEET-ruter uden leverandørnavne. Kategorierne følger FLEETs brede
 * læseadgang og er nødvendige i både mobil indberetning og økonomi.
 */
export function useFleetSharedData({ mayReadCategories, mayReadSuppliers }) {
  const suppliers = useListe("leverandoerer", {
    ordnPaa: "navn",
    vindue: "alle",
    graense: 500,
    demo: DEMO_LEVERANDOERER,
    hent: mayReadSuppliers,
  });
  const categories = useListe("fleetKategorier", {
    ordnPaa: "sortering",
    vindue: "alle",
    graense: 500,
    demo: FALLBACK_CATEGORIES,
    hent: mayReadCategories,
  });
  return { categories, suppliers };
}

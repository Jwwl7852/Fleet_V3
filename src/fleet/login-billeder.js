import fleet from "../assets/login/web/fleet.jpg";
import facility from "../assets/login/web/facility.jpg";
import planning from "../assets/login/web/planning.jpg";
import procure from "../assets/login/web/procure.jpg";
import fakturacenter from "../assets/login/web/fakturacenter.jpg";
import workforce from "../assets/login/web/workforce.jpg";
import warehouse from "../assets/login/web/warehouse.jpg";
import unitBooking from "../assets/login/web/unit-booking.jpg";
import samletDrift from "../assets/login/web/samlet-drift.jpg";

/**
 * Generel serie, som må vises før login. Kataloget må derfor aldrig indeholde
 * tenant-, abonnements- eller brugeroplysninger. Fokuspunktet bruges direkte
 * som CSS object-position ved responsiv beskæring.
 */
export const LOGIN_BILLEDER = Object.freeze([
  { id: "fleet", motiv: "FLEET", tekst: "Overblik over flåden.", src: fleet, fokus: "50% 52%" },
  { id: "facility", motiv: "FACILITY", tekst: "Struktur omkring dine bygninger.", src: facility, fokus: "52% 52%" },
  { id: "planning", motiv: "PLANNING", tekst: "Overblik over næste opgave.", src: planning, fokus: "56% 52%" },
  { id: "procure", motiv: "PROCURE", tekst: "Fra behov til levering.", src: procure, fokus: "50% 48%" },
  { id: "fakturacenter", motiv: "FAKTURACENTER", tekst: "Overblik over bilag og omkostninger.", src: fakturacenter, fokus: "68% 52%" },
  { id: "workforce", motiv: "WORKFORCE", tekst: "Mennesker og opgaver i balance.", src: workforce, fokus: "50% 45%" },
  { id: "warehouse", motiv: "WAREHOUSE", tekst: "Plads til overblik.", src: warehouse, fokus: "67% 50%" },
  { id: "unit-booking", motiv: "UNIT BOOKING", tekst: "Styr på enhedernes vej.", src: unitBooking, fokus: "52% 50%" },
  { id: "samlet-drift", motiv: "Samlet drift", tekst: "Din arbejdsdag samlet ét sted.", src: samletDrift, fokus: "50% 48%" },
]);

export const LOGIN_SENESTE_BILLEDE_NOGLE = "veyro:login:seneste-billede:v1";

export function vaelgLoginBillede({
  billeder = LOGIN_BILLEDER,
  forrigeId = null,
  tilfældig = Math.random,
} = {}) {
  if (!billeder.length) return null;
  const mulige = billeder.length > 1
    ? billeder.filter((billede) => billede.id !== forrigeId)
    : billeder;
  const indeks = Math.min(
    mulige.length - 1,
    Math.max(0, Math.floor(tilfældig() * mulige.length)),
  );
  return mulige[indeks];
}

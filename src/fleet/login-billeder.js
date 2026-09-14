import fleet1 from "../assets/login/web/fleet.jpg";
import fleet2 from "../assets/login/web/samlet-drift.jpg";
import facility1 from "../assets/login/web/facility.jpg";
import facility2 from "../assets/login/web/facility-2.jpg";
import planning1 from "../assets/login/web/planning.jpg";
import planning2 from "../assets/login/web/planning-2.jpg";
import procure1 from "../assets/login/web/procure.jpg";
import procure2 from "../assets/login/web/procure-2.jpg";
import fakturacenter1 from "../assets/login/web/fakturacenter.jpg";
import fakturacenter2 from "../assets/login/web/fakturacenter-2.jpg";
import workforce1 from "../assets/login/web/workforce.jpg";
import workforce2 from "../assets/login/web/workforce-2.jpg";
import warehouse1 from "../assets/login/web/warehouse.jpg";
import warehouse2 from "../assets/login/web/warehouse-2.jpg";
import unitBooking1 from "../assets/login/web/unit-booking.jpg";
import unitBooking2 from "../assets/login/web/unit-booking-2.jpg";

export const LOGIN_MODULER = Object.freeze([
  "fleet", "facility", "planning", "procure", "fakturacenter",
  "workforce", "warehouse", "unit-booking",
]);

/** Generelle illustrationer, som først filtreres efter valideret loginkontekst. */
export const LOGIN_BILLEDER = Object.freeze([
  { id: "fleet-1", modul: "fleet", nummer: 1, motiv: "FLEET", tekst: "Overblik over flåden.", src: fleet1, fokus: "50% 52%" },
  { id: "fleet-2", modul: "fleet", nummer: 2, motiv: "FLEET", tekst: "Din arbejdsdag samlet ét sted.", src: fleet2, fokus: "50% 48%" },
  { id: "facility-1", modul: "facility", nummer: 1, motiv: "FACILITY", tekst: "Struktur omkring dine bygninger.", src: facility1, fokus: "52% 52%" },
  { id: "facility-2", modul: "facility", nummer: 2, motiv: "FACILITY", tekst: "Styr på teknik og installationer.", src: facility2, fokus: "52% 48%" },
  { id: "planning-1", modul: "planning", nummer: 1, motiv: "PLANNING", tekst: "Overblik over næste opgave.", src: planning1, fokus: "56% 52%" },
  { id: "planning-2", modul: "planning", nummer: 2, motiv: "PLANNING", tekst: "Planen samlet på én skærm.", src: planning2, fokus: "50% 48%" },
  { id: "procure-1", modul: "procure", nummer: 1, motiv: "PROCURE", tekst: "Fra behov til levering.", src: procure1, fokus: "50% 48%" },
  { id: "procure-2", modul: "procure", nummer: 2, motiv: "PROCURE", tekst: "Fra behov til det rigtige indkøb.", src: procure2, fokus: "50% 48%" },
  { id: "fakturacenter-1", modul: "fakturacenter", nummer: 1, motiv: "FAKTURACENTER", tekst: "Overblik over bilag og omkostninger.", src: fakturacenter1, fokus: "68% 52%" },
  { id: "fakturacenter-2", modul: "fakturacenter", nummer: 2, motiv: "FAKTURACENTER", tekst: "Fra bilag til overblik.", src: fakturacenter2, fokus: "50% 50%" },
  { id: "workforce-1", modul: "workforce", nummer: 1, motiv: "WORKFORCE", tekst: "Mennesker og opgaver i balance.", src: workforce1, fokus: "50% 45%" },
  { id: "workforce-2", modul: "workforce", nummer: 2, motiv: "WORKFORCE", tekst: "Samarbejde omkring arbejdsdagen.", src: workforce2, fokus: "50% 48%" },
  { id: "warehouse-1", modul: "warehouse", nummer: 1, motiv: "WAREHOUSE", tekst: "Plads til overblik.", src: warehouse1, fokus: "67% 50%" },
  { id: "warehouse-2", modul: "warehouse", nummer: 2, motiv: "WAREHOUSE", tekst: "Varer på rette plads.", src: warehouse2, fokus: "50% 52%" },
  { id: "unit-booking-1", modul: "unit-booking", nummer: 1, motiv: "UNIT BOOKING", tekst: "Styr på enhedernes vej.", src: unitBooking1, fokus: "52% 50%" },
  { id: "unit-booking-2", modul: "unit-booking", nummer: 2, motiv: "UNIT BOOKING", tekst: "Klar til næste udlån.", src: unitBooking2, fokus: "52% 50%" },
]);

export function loginBillederForModuler(moduler = []) {
  const tilladte = new Set(moduler.filter((modul) => LOGIN_MODULER.includes(modul)));
  return LOGIN_BILLEDER.filter((billede) => tilladte.has(billede.modul));
}

export function loginSenesteBilledeNøgle(contextId) {
  return `veyro:login:seneste-billede:v2:${contextId}`;
}

export function vaelgLoginBillede({ billeder = [], forrigeId = null, tilfældig = Math.random } = {}) {
  if (!billeder.length) return null;
  const mulige = billeder.length > 1 ? billeder.filter((billede) => billede.id !== forrigeId) : billeder;
  const indeks = Math.min(mulige.length - 1, Math.max(0, Math.floor(tilfældig() * mulige.length)));
  return mulige[indeks];
}

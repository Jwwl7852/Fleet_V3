export const MOBILE_DEMO_USERS = [
  { id: "mobile-mette", name: "Mette Larsen", role: "Mobil indberetter", departments: ["Service", "Varelevering"], fullFleet: false },
  { id: "mobile-sara", name: "Sara Nielsen", role: "Flådeansvarlig", departments: [], fullFleet: true },
];

export const QR_PREFIX = "VEYRO-UNIT:";

export const mobileUnitsForUser = (units, user) => user?.fullFleet
  ? units
  : units.filter((unit) => user?.departments?.includes(unit.department));

export function unitCode(unitId) {
  return `${QR_PREFIX}${unitId}`;
}

export function resolveUnitCode(raw, units, user) {
  const value = String(raw || "").trim();
  const allowed = mobileUnitsForUser(units, user);
  let unitId = value.toUpperCase().startsWith(QR_PREFIX) ? value.slice(QR_PREFIX.length) : null;
  if (!unitId && !value.includes(":")) {
    const direct = units.find((unit) => unit.id === value || unit.number.toLocaleLowerCase("da-DK") === value.toLocaleLowerCase("da-DK"));
    unitId = direct?.id || null;
  }
  if (!unitId) return { error: "Koden er ukendt. Brug manuel søgning." };
  const unit = units.find((item) => item.id === unitId);
  if (!unit) return { error: "Koden henviser ikke til en kendt enhed." };
  if (!allowed.some((item) => item.id === unit.id)) return { error: "Du har ikke adgang til denne enhed med den valgte demo-profil." };
  return { unit };
}

export const reporterVisibleEvents = (events, caseItem) => (events || []).filter((event) => {
  if (event.caseId !== caseItem?.id) return false;
  return ["created", "status", "workshop", "work_completed", "closed", "reopened"].includes(event.type)
    && event.title !== "Intern note";
});

export const reporterProgressLabel = (caseItem, workshopTasks = []) => {
  const task = workshopTasks.find((item) => item.caseId === caseItem?.id && item.status !== "cancelled");
  if (task?.status === "completed") return "Arbejdet er udført";
  const labels = { new: "Modtaget", assessing: "Under vurdering", waiting: "Afventer oplysninger", ready: "Klar til værksted", workshop: "På værksted", invoice_pending: "Arbejdet er udført", ready_to_close: "Arbejdet er udført", completed: "Afsluttet", rejected: "Afvist" };
  return labels[caseItem?.status] || "Modtaget";
};

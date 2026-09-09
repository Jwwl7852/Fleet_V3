const clone = (value) => structuredClone(value);
const task = (values) => ({ status: "I_KOE", flexible: true, requiredSkill: null, requiredVehicleType: null, requiredCapacity: null, thread: [], ...values });

const BASE_TASKS = [
  task({ id: "week-task-01", name: "Fiktiv serviceopgave 01", customer: "Demo-bestiller Nord", stopCount: 1, allowedFrom: "2032-09-13", allowedTo: "2032-09-17", timeWindow: { from: "09:00", to: "15:30" }, durationMin: 45, returnTravelMin: 20, requiredSkill: "SERVICE", priority: "HOEJ", type: "SERVICE", stops: [{ id: "week-stop-01", order: 1, type: "SERVICE", name: "Fiktivt servicestop" }], thread: [{ id: "thread-01", kind: "BESTILLING", timestamp: "13.09.2032 · 08:00", text: "Oprindelig syntetisk bestilling modtaget via demoportal.", synthetic: true }] }),
  task({ id: "week-task-02", name: "Demo afhentning og levering", customer: "Fiktiv transportbestiller", stopCount: 2, allowedFrom: "2032-09-14", allowedTo: "2032-09-16", timeWindow: { from: "10:00", to: "16:00" }, durationMin: 90, returnTravelMin: 30, requiredVehicleType: "VAREBIL", requiredCapacity: 800, priority: "NORMAL", flexible: false, type: "TRANSPORT", stops: [{ id: "week-stop-02-a", order: 1, type: "AFHENTNING", name: "Syntetisk afhentning" }, { id: "week-stop-02-b", order: 2, type: "LEVERING", name: "Syntetisk levering" }], thread: [{ id: "thread-02", kind: "IMPORT", timestamp: "13.09.2032 · 08:10", text: "Importeret fra lokal syntetisk CSV-fixture.", synthetic: true }] }),
  task({ id: "week-task-03", name: "Fiktivt hjemmebesøg", customer: "Demo-bestiller Kommune", stopCount: 1, allowedFrom: "2032-09-13", allowedTo: "2032-09-19", timeWindow: { from: "13:00", to: "16:00" }, durationMin: 30, returnTravelMin: 15, requiredSkill: "PLEJE", priority: "AKUT", type: "BESOEG", stops: [{ id: "week-stop-03", order: 1, type: "BESOEG", name: "Fiktivt besøg" }], thread: [{ id: "thread-03", kind: "BESTILLING", timestamp: "13.09.2032 · 08:20", text: "Syntetisk kommunal bestilling.", synthetic: true }] }),
  task({ id: "week-task-04", name: "Demo kapacitetslevering", customer: "Fiktiv bestiller Vest", stopCount: 1, allowedFrom: "2032-09-15", allowedTo: "2032-09-18", timeWindow: null, durationMin: 60, returnTravelMin: 25, requiredVehicleType: "LASTBIL", requiredCapacity: 3200, priority: "NORMAL", type: "LEVERING", stops: [{ id: "week-stop-04", order: 1, type: "LEVERING", name: "Syntetisk godsstop" }], thread: [{ id: "thread-04", kind: "PORTAL", timestamp: "13.09.2032 · 08:30", text: "Oprindelig syntetisk portalreference DEMO-WEEK-04.", synthetic: true }] }),
];

const BASE_RESOURCES = [
  { id: "week-route-nord", type: "rute", label: "Rute Nord", capabilities: { skills: ["SERVICE", "PLEJE"], vehicleType: "VAREBIL", capacity: 1200 } },
  { id: "week-route-syd", type: "rute", label: "Rute Syd", capabilities: { skills: ["SERVICE"], vehicleType: "LASTBIL", capacity: 5000 } },
  { id: "week-employee-anna", type: "medarbejder", label: "Anna Demo", capabilities: { skills: ["SERVICE", "PLEJE"], vehicleType: null, capacity: 0 } },
  { id: "week-employee-bo", type: "medarbejder", label: "Bo Fiktiv", capabilities: { skills: ["SERVICE"], vehicleType: null, capacity: 0 } },
  { id: "week-vehicle-van", type: "koeretoej", label: "DEMO VAN 38", capabilities: { skills: [], vehicleType: "VAREBIL", capacity: 1200 } },
  { id: "week-vehicle-truck", type: "koeretoej", label: "DEMO TRUCK 38", capabilities: { skills: [], vehicleType: "LASTBIL", capacity: 5000 } },
];

const MULTIDAY = [{
  id: "week-multiday-01", name: "Flerdagsrute · Demo Europa", startDate: "2032-09-13", endDate: "2032-09-17", vehicle: "DEMO TRUCK 38", crew: "Anna Demo + Bo Fiktiv", totalStops: 17, completedStops: 8, nextStop: "Fiktivt stop 09", delayMin: 22,
  days: [
    { date: "2032-09-13", overnight: "Demo-hotel A", stops: [{ id: "md-01", order: 1, name: "Fiktivt stop 01", status: "udfoert", planned: "08:30", actual: "08:34" }, { id: "md-02", order: 2, name: "Fiktivt stop 02", status: "udfoert", planned: "11:10", actual: "11:18" }] },
    { date: "2032-09-14", overnight: "Demo-hotel B", stops: [{ id: "md-03", order: 3, name: "Fiktivt stop 03", status: "udfoert", planned: "09:00", actual: "09:08" }, { id: "md-04", order: 4, name: "Fiktivt stop 04", status: "udfoert", planned: "13:20", actual: "13:31" }] },
    { date: "2032-09-15", overnight: "Demo-hotel C", stops: [{ id: "md-05", order: 5, name: "Fiktivt stop 09", status: "aktuel", planned: "10:00", actual: null }, { id: "md-06", order: 6, name: "Fiktivt stop 10", status: "kommende", planned: "14:15", actual: null }] },
    { date: "2032-09-16", overnight: "Demo-hotel D", stops: [{ id: "md-07", order: 7, name: "Fiktivt stop 11", status: "kommende", planned: "09:30", actual: null }, { id: "md-08", order: 8, name: "Fiktivt stop 12", status: "kommende", planned: "13:45", actual: null }] },
    { date: "2032-09-17", overnight: "Retur til demo-depot", stops: [{ id: "md-09", order: 9, name: "Fiktivt stop 17", status: "kommende", planned: "11:00", actual: null }] },
  ],
}];

const REQUEST_PERIODS = [
  { art: "ISO_UGE", niveau: "OENSKET", uge: 37, aar: 2032 },
  { art: "ISO_UGE", niveau: "OENSKET", uge: 38, aar: 2032 },
  { art: "ISO_UGE", niveau: "OENSKET", uge: 39, aar: 2032 },
  { art: "DATO_INTERVAL", niveau: "OENSKET", fraDato: "2032-09-11", tilDato: "2032-09-22" },
  { art: "UDEN_DATO_OENSKE", niveau: "OENSKET" },
  { art: "TIDSVINDUE", niveau: "SKAL_OVERHOLDES", dato: "2032-09-17", fra: "10:00", til: "14:00" },
  { art: "DATO_TID", niveau: "OENSKET", dato: "2032-09-14", tid: "11:00" },
];

const generatedTasks = Array.from({ length: 40 - BASE_TASKS.length }, (_, index) => {
  const number = index + BASE_TASKS.length + 1;
  const type = ["SERVICE", "TRANSPORT", "BESOEG", "LEVERING"][index % 4];
  const requestPeriod = REQUEST_PERIODS[index % REQUEST_PERIODS.length];
  const isMulti = number % 9 === 2;
  const stops = isMulti
    ? [{ id: `week-stop-${number}-a`, order: 1, type: "AFHENTNING", name: "Syntetisk afhentning" }, { id: `week-stop-${number}-b`, order: 2, type: "LEVERING", name: "Syntetisk levering" }]
    : [{ id: `week-stop-${number}`, order: 1, type: type === "TRANSPORT" ? "AFHENTNING" : type, name: `Fiktivt stop ${String(number).padStart(2, "0")}` }];
  const weekStart = requestPeriod.uge === 37 ? "2032-09-06" : requestPeriod.uge === 39 ? "2032-09-20" : "2032-09-13";
  const weekEnd = requestPeriod.uge === 37 ? "2032-09-12" : requestPeriod.uge === 39 ? "2032-09-26" : "2032-09-19";
  return task({ id: `week-task-${String(number).padStart(2, "0")}`, reference: `DEMO-WEEK-${String(number).padStart(3, "0")}`, name: isMulti ? `Demo afhentning og levering ${String(number).padStart(2, "0")}` : `Fiktiv ${type.toLocaleLowerCase("da-DK")}opgave ${String(number).padStart(2, "0")}`, customer: `Demo-bestiller ${String((index % 8) + 1).padStart(2, "0")}`, stopCount: stops.length, allowedFrom: requestPeriod.fraDato || requestPeriod.dato || (requestPeriod.art === "UDEN_DATO_OENSKE" ? "2032-09-01" : weekStart), allowedTo: requestPeriod.tilDato || requestPeriod.dato || (requestPeriod.art === "UDEN_DATO_OENSKE" ? "2032-10-03" : weekEnd), timeWindow: requestPeriod.art === "TIDSVINDUE" ? { from: requestPeriod.fra, to: requestPeriod.til } : null, requestPeriod: clone(requestPeriod), durationMin: isMulti ? 90 : 30 + (number % 4) * 15, returnTravelMin: 15 + (number % 3) * 5, requiredSkill: type === "BESOEG" ? "PLEJE" : type === "SERVICE" ? "SERVICE" : null, requiredVehicleType: ["TRANSPORT", "LEVERING"].includes(type) ? (number % 8 === 0 ? "LASTBIL" : "VAREBIL") : null, requiredCapacity: ["TRANSPORT", "LEVERING"].includes(type) ? (number % 8 === 0 ? 3200 : 800) : null, priority: number % 11 === 0 ? "AKUT" : number % 3 === 0 ? "HOEJ" : "NORMAL", type, stops, thread: [{ id: `thread-${number}`, kind: number % 2 ? "BESTILLING" : "IMPORT", timestamp: "13.09.2032 · 08:00", text: `Oprindelig syntetisk bestilling ${String(number).padStart(2, "0")}.`, synthetic: true }] });
});
const TASKS = [...BASE_TASKS.map((item, index) => ({ ...item, reference: `DEMO-WEEK-${String(index + 1).padStart(3, "0")}`, requestPeriod: REQUEST_PERIODS[index + 1] })), ...generatedTasks].map((item) => ({
  ...item,
  confirmationMode: item.type === "BESOEG" ? "INTERN_PLANLAEGNING" : item.type === "SERVICE" ? "KRAEV_BEKRAEFTELSE" : "ORIENTER_BESTILLER",
}));
const routeResources = Array.from({ length: 30 }, (_, index) => ({ id: `week-route-${String(index + 1).padStart(2, "0")}`, type: "rute", label: `Demo-rute ${String(index + 1).padStart(2, "0")}`, capabilities: { skills: index % 3 === 0 ? ["SERVICE", "PLEJE"] : index % 2 === 0 ? ["PLEJE"] : ["SERVICE"], vehicleType: index % 6 === 0 ? "LASTBIL" : "VAREBIL", capacity: index % 6 === 0 ? 5000 : 1200 } }));
const employeeResources = Array.from({ length: 12 }, (_, index) => ({ id: `week-employee-${String(index + 1).padStart(2, "0")}`, type: "medarbejder", label: `Demo-medarbejder ${String(index + 1).padStart(2, "0")}`, capabilities: { skills: index % 2 ? ["SERVICE"] : ["SERVICE", "PLEJE"], vehicleType: null, capacity: 0 } }));
const vehicleResources = Array.from({ length: 12 }, (_, index) => ({ id: `week-vehicle-${String(index + 1).padStart(2, "0")}`, type: "koeretoej", label: `DEMO ${index % 4 === 0 ? "TRUCK" : "VAN"} ${String(index + 1).padStart(2, "0")}`, capabilities: { skills: [], vehicleType: index % 4 === 0 ? "LASTBIL" : "VAREBIL", capacity: index % 4 === 0 ? 5000 : 1200 } }));
const RESOURCES = [...BASE_RESOURCES, ...routeResources.filter((item) => !BASE_RESOURCES.some((base) => base.id === item.id)), ...employeeResources, ...vehicleResources];

export function opretDemoPlanlaegning() {
  return clone({ weekNumber: 38, weekStart: "2032-09-13", weekEnd: "2032-09-19", tasks: TASKS, resources: RESOURCES, placements: [], notifications: [], multiDayRoutes: MULTIDAY, selectedTaskId: null, focusRequest: null, revision: 1 });
}

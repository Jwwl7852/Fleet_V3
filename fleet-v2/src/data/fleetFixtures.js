export const DEMO_TENANT_ID = "tenant-demo-nordic";

export const UNIT_TYPES = {
  vehicle: { label: "Køretøj", plural: "Køretøjer" },
  scooter: { label: "Scooter", plural: "Scootere" },
  machine: { label: "Maskine", plural: "Maskiner" },
  equipment: { label: "Udstyr", plural: "Udstyr" },
};

export const UNIT_STATUSES = {
  operation: { label: "I drift", tone: "success" },
  workshop: { label: "På værksted", tone: "danger" },
  action: { label: "Kræver handling", tone: "warning" },
  offline: { label: "Offline", tone: "neutral" },
};

const unit = (id, number, type, make, model, department, meter, status, extra = {}) => ({
  id,
  tenantId: DEMO_TENANT_ID,
  number,
  type,
  make,
  model,
  department,
  meterType: extra.meterType || "km",
  meter,
  status,
  registration: extra.registration || null,
  serialNumber: extra.serialNumber || null,
  year: extra.year || null,
  nextServiceDate: extra.nextServiceDate || null,
  nextServiceMeter: extra.nextServiceMeter ?? null,
  notes: extra.notes || "",
  noteCount: extra.noteCount || 0,
  energy: extra.energy || null,
  batteryPct: extra.batteryPct ?? null,
  rangeKm: extra.rangeKm ?? null,
  fuelPct: extra.fuelPct ?? null,
  assignee: extra.assignee || null,
  location: extra.location || null,
  updatedAt: extra.updatedAt || "2025-03-12T10:24:00.000Z",
});

export const fixtureUnits = [
  unit("unit-sc-104", "SC-104", "scooter", "Silence", "S04", "Varelevering", 12458, "workshop", { registration: "KB 39217", serialNumber: "VSSS04E23R1043287", year: 2023, nextServiceDate: "2025-03-17", nextServiceMeter: 15000, noteCount: 2, energy: "electric", batteryPct: 78, rangeKm: 68, assignee: "Jonas Mikkelsen", location: "VEYRO Værksted Øst · København", notes: "Diagnose af bremsesystem igang." }),
  unit("unit-nb-001", "NB-001", "vehicle", "Ford", "Transit", "Byggeri", 124532, "operation", { registration: "DM 12 345", serialNumber: "WF0XXXTTGXNB00101", year: 2021, nextServiceDate: "2025-03-20", nextServiceMeter: 132000, fuelPct: 64, assignee: "Lars Jensen", location: "København S", noteCount: 2 }),
  unit("unit-nb-002", "NB-002", "vehicle", "Mercedes", "Sprinter", "Service", 98210, "operation", { registration: "DX 98 765", serialNumber: "W1V9076331P982102", year: 2022, nextServiceDate: "2025-04-03", nextServiceMeter: 104000, fuelPct: 82, assignee: "Anne Petersen", location: "Rødovre", noteCount: 1 }),
  unit("unit-nb-003", "NB-003", "vehicle", "Volvo", "FH 500", "Transport", 412980, "action", { registration: "CM 45 678", serialNumber: "YV2RT40A1PB123456", year: 2020, nextServiceDate: "2025-03-18", nextServiceMeter: 416000, fuelPct: 41, assignee: "Mikkel Sørensen", location: "KLT Terminal", noteCount: 3, notes: "AdBlue-advarsel skal undersøges." }),
  unit("unit-nb-004", "NB-004", "vehicle", "Toyota", "Proace", "El", 67321, "operation", { registration: "EA 23 456", serialNumber: "YARVFEHS30Z067321", year: 2022, nextServiceDate: "2025-05-02", nextServiceMeter: 79000, energy: "electric", batteryPct: 72, rangeKm: 214, assignee: "Thomas Nielsen", location: "Hvidovre" }),
  unit("unit-nb-005", "NB-005", "vehicle", "Volkswagen", "ID.4", "Ledelse", 38445, "operation", { registration: "EE 56 789", serialNumber: "WVGZZZE2ZNP038445", year: 2023, nextServiceDate: "2025-04-10", nextServiceMeter: 45200, energy: "electric", batteryPct: 86, rangeKm: 331, assignee: "Sofie Holm", location: "Frederiksberg", noteCount: 1 }),
  unit("unit-nb-006", "NB-006", "scooter", "Yamaha", "NMAX", "Service", 12450, "offline", { registration: "FA 34 567", serialNumber: "MH3SEC7100K012450", year: 2021, nextServiceDate: null, nextServiceMeter: 14000, fuelPct: 36, assignee: "Jonas K. Pedersen", location: "Senest kendt: Valby", noteCount: 1, notes: "Intet GPS-signal siden kl. 08.12." }),
  unit("unit-nb-007", "NB-007", "machine", "Bobcat", "T590", "Byggeri", 1982, "operation", { serialNumber: "BCT590DK01982", year: 2019, meterType: "hours", nextServiceDate: "2025-03-25", nextServiceMeter: 2200, assignee: "Byggeri Øst", location: "Byggeplads Nord" }),
  unit("unit-nb-008", "NB-008", "machine", "Still", "RX 20", "Lager", 8421, "action", { serialNumber: "STILLRX20-8421", year: 2018, meterType: "hours", nextServiceDate: "2025-04-14", nextServiceMeter: 8800, assignee: "Lagerteamet", location: "Lager 2", notes: "Hydraulikservice nærmer sig." }),
  unit("unit-nb-009", "NB-009", "vehicle", "Iveco", "Daily", "Service", 201332, "operation", { registration: "FB 12 345", serialNumber: "ZCFC735B502013329", year: 2020, nextServiceDate: "2025-05-06", nextServiceMeter: 210500, fuelPct: 59, assignee: "Kasper Andersen", location: "Herlev", noteCount: 1 }),
  unit("unit-nb-010", "NB-010", "equipment", "Kärcher", "HDS 10/20", "Ejendomme", 320, "operation", { serialNumber: "KAR-HDS-2020-320", year: 2020, meterType: "hours", nextServiceDate: "2025-04-01", nextServiceMeter: 420, assignee: "Ejendomme", location: "Depot Syd" }),
  unit("unit-nb-011", "NB-011", "vehicle", "MAN", "TGE", "Transport", 174220, "workshop", { registration: "GC 44 210", serialNumber: "WMA03VUY2M1742201", year: 2021, nextServiceDate: "2025-03-14", nextServiceMeter: 175000, fuelPct: 23, assignee: "Transport Vest", location: "Værksted Vest", notes: "Udskiftning af kobling." }),
  unit("unit-nb-012", "NB-012", "scooter", "NIU", "NQi Cargo", "Varelevering", 8730, "operation", { registration: "GF 82 119", serialNumber: "NIUNQI-CARGO-8730", year: 2024, nextServiceDate: "2025-06-12", nextServiceMeter: 12000, energy: "electric", batteryPct: 91, rangeKm: 75, assignee: "Varelevering Nord", location: "Østerbro" }),
  unit("unit-nb-013", "NB-013", "machine", "JCB", "3CX", "Byggeri", 4480, "operation", { serialNumber: "JCB3CX20204480", year: 2020, meterType: "hours", nextServiceDate: "2025-05-21", nextServiceMeter: 4750, assignee: "Byggeri Vest", location: "Glostrup" }),
  unit("unit-nb-014", "NB-014", "equipment", "Hilti", "TE 3000-AVR", "Byggeri", 618, "action", { serialNumber: "HILTI-TE3K-0618", year: 2022, meterType: "hours", nextServiceDate: "2025-03-19", nextServiceMeter: 650, assignee: "Materieldepot", location: "Depot Nord", noteCount: 2, notes: "Slidt strømkabel – må ikke udleveres." }),
  unit("unit-nb-015", "NB-015", "vehicle", "Scania", "R450", "Transport", 334180, "operation", { registration: "HK 31 772", serialNumber: "YS2R4X20005334180", year: 2021, nextServiceDate: "2025-04-28", nextServiceMeter: 341000, fuelPct: 77, assignee: "Transport Nord", location: "Taastrup" }),
  unit("unit-nb-016", "NB-016", "scooter", "Silence", "S01", "Varelevering", 15420, "operation", { registration: "HL 20 143", serialNumber: "VSSS01E24R015420", year: 2024, nextServiceDate: "2025-07-02", nextServiceMeter: 20000, energy: "electric", batteryPct: 66, rangeKm: 55, assignee: "Varelevering Syd", location: "Amager" }),
  unit("unit-nb-017", "NB-017", "machine", "Manitou", "MT 625", "Byggeri", 6250, "workshop", { serialNumber: "MANITOU-MT625-6250", year: 2017, meterType: "hours", nextServiceDate: "2025-03-13", nextServiceMeter: 6300, assignee: "Byggeri Øst", location: "Værksted Øst", notes: "Fejl i styretøj." }),
  unit("unit-nb-018", "NB-018", "equipment", "Husqvarna", "K 770", "Service", 884, "operation", { serialNumber: "HQ-K770-00884", year: 2021, meterType: "hours", nextServiceDate: null, nextServiceMeter: 1000, assignee: "Servicelager", location: "Rødovre" }),
];

const costs = [
  ["unit-sc-104", 18742], ["unit-nb-001", 12340], ["unit-nb-002", 9875], ["unit-nb-003", 28450],
  ["unit-nb-004", 7210], ["unit-nb-005", 5980], ["unit-nb-006", 1230], ["unit-nb-007", 4560],
  ["unit-nb-008", 3890], ["unit-nb-009", 14220], ["unit-nb-010", 980], ["unit-nb-011", 32450],
  ["unit-nb-012", 1660], ["unit-nb-013", 10840], ["unit-nb-014", 2720], ["unit-nb-015", 22160],
  ["unit-nb-016", 1380], ["unit-nb-017", 19700], ["unit-nb-018", 1120],
];

export const fixtureRelations = {
  activities: [
    { id: "activity-sc-1", unitId: "unit-sc-104", at: "2025-03-12T10:24:00Z", title: "På værksted", text: "Fejl på bremser – diagnosticering igangsat.", tone: "danger", category: "Værksted" },
    { id: "activity-sc-2", unitId: "unit-sc-104", at: "2025-03-10T08:17:00Z", title: "Indberetning", text: "Bruger har indberettet knirkende bremser.", tone: "info", category: "Indberetning" },
    { id: "activity-sc-3", unitId: "unit-sc-104", at: "2025-02-28T14:32:00Z", title: "Service udført", text: "Planlagt service ved 12.000 km.", tone: "success", category: "Service" },
    { id: "activity-sc-4", unitId: "unit-sc-104", at: "2025-02-14T09:11:00Z", title: "Omkostning registreret", text: "Serviceomkostning · 1.842 kr.", tone: "neutral", category: "Økonomi" },
    { id: "activity-sc-5", unitId: "unit-sc-104", at: "2025-01-03T11:03:00Z", title: "Dokument tilføjet", text: "Forsikringspolice 2025.", tone: "info", category: "Dokumenter" },
    { id: "activity-sc-6", unitId: "unit-sc-104", at: "2024-12-17T16:20:00Z", title: "Placering opdateret", text: "Rykket til VEYRO Værksted Øst.", tone: "info", category: "GPS" },
    ...fixtureUnits.filter((item) => item.id !== "unit-sc-104").map((item, index) => ({ id: `activity-${item.id}`, unitId: item.id, at: `2025-03-${String(11 - (index % 8)).padStart(2, "0")}T09:15:00Z`, title: "Målerstand opdateret", text: `${item.meter.toLocaleString("da-DK")} ${item.meterType === "hours" ? "t" : "km"} registreret.`, tone: "info", category: "Historik" })),
  ],
  service: [
    { id: "service-sc-1", unitId: "unit-sc-104", date: "2025-02-28", title: "Planlagt service", meter: 12000, result: "Udført", cost: 1842 },
    { id: "service-sc-2", unitId: "unit-sc-104", date: "2024-08-16", title: "Batterikontrol", meter: 8250, result: "OK", cost: 695 },
    ...fixtureUnits.slice(1, 9).map((item, index) => ({ id: `service-${item.id}`, unitId: item.id, date: `2024-${String(12 - (index % 5)).padStart(2, "0")}-12`, title: item.meterType === "hours" ? "Driftstimeeftersyn" : "Serviceeftersyn", meter: Math.max(0, item.meter - 4200), result: "Udført", cost: 1200 + index * 185 })),
  ],
  damages: [
    { id: "damage-sc-1", unitId: "unit-sc-104", date: "2025-03-10", title: "Knirkende bremser", severity: "Høj", status: "Under behandling" },
    { id: "damage-nb-003", unitId: "unit-nb-003", date: "2025-03-11", title: "AdBlue-advarsel", severity: "Moderat", status: "Ny" },
    { id: "damage-nb-014", unitId: "unit-nb-014", date: "2025-03-09", title: "Beskadiget strømkabel", severity: "Høj", status: "Ny" },
  ],
  documents: [
    { id: "doc-sc-1", unitId: "unit-sc-104", title: "Forsikringspolice 2025.pdf", category: "Forsikring", date: "2025-01-03" },
    { id: "doc-sc-2", unitId: "unit-sc-104", title: "Registreringsattest.pdf", category: "Registrering", date: "2023-08-21" },
    { id: "doc-sc-3", unitId: "unit-sc-104", title: "Servicebilag-12000km.pdf", category: "Service", date: "2025-02-28" },
    ...fixtureUnits.filter((item) => item.id !== "unit-sc-104" && item.registration).slice(0, 8).map((item) => ({ id: `doc-${item.id}`, unitId: item.id, title: "Registreringsattest.pdf", category: "Registrering", date: "2024-01-12" })),
  ],
  costs: costs.flatMap(([unitId, total], unitIndex) => [0, 1, 2].map((monthOffset) => ({
    id: `cost-${unitId}-${monthOffset}`,
    unitId,
    month: ["2025-01", "2025-02", "2025-03"][monthOffset],
    category: ["Service", "Energi", "Forsikring"][(unitIndex + monthOffset) % 3],
    amount: Math.round(total * [0.31, 0.29, 0.4][monthOffset]),
  }))),
  gps: fixtureUnits.map((item, index) => ({
    id: `gps-${item.id}`,
    unitId: item.id,
    label: item.location || "Ikke oplyst",
    updatedAt: item.status === "offline" ? "2025-03-12T08:12:00Z" : "2025-03-12T10:24:00Z",
    latitude: 55.61 + (index % 6) * 0.035,
    longitude: 12.31 + (index % 5) * 0.055,
    live: false,
  })),
};

export const createFixtureDataset = () => ({
  tenantId: DEMO_TENANT_ID,
  units: structuredClone(fixtureUnits),
  relations: structuredClone(fixtureRelations),
  prototype: true,
  version: 2,
});

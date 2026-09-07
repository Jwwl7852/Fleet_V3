export const fleetNavigation = [
  { id: "overview", label: "Overblik", icon: "dashboard", implemented: true, path: "/" },
  { id: "units", label: "Enheder", icon: "unit", implemented: true, path: "/enheder" },
  { id: "reports", label: "Indberetninger", icon: "report" },
  { id: "queue", label: "Arbejdskø", icon: "queue", badge: 5 },
  { id: "workshop", label: "Værksted", icon: "workshop" },
  { id: "service", label: "Service", icon: "service" },
  { id: "map", label: "Livekort", icon: "map" },
  { id: "documents", label: "Dokumenter", icon: "document" },
  { id: "leasing", label: "Leasing", icon: "leasing" },
  { id: "mobile", label: "Mobil indberetning", icon: "mobile" },
  { id: "economy", label: "Økonomi og flådestatistik", icon: "economy" },
];

export const platformNavigation = [
  {
    id: "common",
    label: "Fælles",
    items: [
      { id: "dashboard", label: "Dashboard", icon: "dashboard" },
      { id: "invoices", label: "Fakturaer & bilag", icon: "document" },
    ],
  },
  {
    id: "operations",
    label: "Driftsmoduler",
    items: [
      { id: "planning", label: "Planning", icon: "queue" },
      { id: "fleet", label: "FLEET", icon: "unit", children: fleetNavigation },
      { id: "facility", label: "Facility", icon: "building" },
      { id: "procure", label: "Procure", icon: "report" },
      { id: "warehouse", label: "Warehouse", icon: "workshop" },
      { id: "unitbooking", label: "Unitbooking", icon: "service" },
      { id: "workforce", label: "Workforce", icon: "mobile" },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    items: [
      { id: "customers", label: "Kunder", icon: "building" },
      { id: "suppliers", label: "Leverandører", icon: "unit" },
      { id: "settings", label: "Opsætning", icon: "service" },
    ],
  },
  {
    id: "help",
    label: "Hjælp",
    items: [{ id: "help-center", label: "Hjælp", icon: "info" }],
  },
];

export const fleetDemo = {
  meta: {
    company: "Nordic Transport A/S",
    user: "Dennis Sørensen",
    initials: "DS",
    role: "Fleet Manager",
    dateLabel: "tirsdag den 12. marts 2024",
    period: "Marts 2025",
    demoLabel: "Fiktive demodata · ikke live",
  },
  totals: { units: 0, inOperation: 0, workshop: 0, needsAction: 0, reports: 0, upcomingService: 0, monthlyCost: 0, downtimePct: 0 },
  operationDays: [
    [124, 11, 7], [125, 10, 7], [126, 9, 7], [126, 9, 7],
    [127, 9, 6], [128, 8, 6], [128, 8, 6], [127, 9, 6],
    [128, 9, 5], [127, 10, 5], [128, 9, 5], [129, 8, 5],
    [127, 10, 5], [128, 9, 5],
  ].map(([operation, workshop, action], index) => ({
    label: ["29. feb", "1. mar", "2. mar", "3. mar", "4. mar", "5. mar", "6. mar", "7. mar", "8. mar", "9. mar", "10. mar", "11. mar", "12. mar", "I dag"][index],
    operation,
    workshop,
    action,
  })),
  actionItems: [
    { unit: "NT-458", title: "Kritisk fejl – motorstyring", time: "22 min siden", level: "critical" },
    { unit: "NT-320", title: "Lavt dæktryk (1,8 bar)", time: "48 min siden", level: "critical" },
    { unit: "NT-671", title: "Service over 500 km", time: "2 timer siden", level: "warning" },
    { unit: "NT-118", title: "Syn udløber om 7 dage", time: "4 timer siden", level: "warning" },
    { unit: "NT-903", title: "Intet GPS-signal i 6 timer", time: "6 timer siden", level: "warning" },
  ],
  serviceItems: [
    { unit: "NT-118", type: "Syn", date: "19. mar 2024", meter: "—", status: "Om 7 dage" },
    { unit: "NT-245", type: "Service", date: "21. mar 2024", meter: "146.000", status: "Om 9 dage" },
    { unit: "NT-671", type: "Service", date: "25. mar 2024", meter: "198.500", status: "Om 13 dage" },
    { unit: "NT-310", type: "Syn", date: "28. mar 2024", meter: "—", status: "Om 16 dage" },
    { unit: "NT-904", type: "Service", date: "2. apr 2024", meter: "212.400", status: "Om 20 dage" },
  ],
  reportItems: [
    { icon: "warning", color: "red", label: "Skader", count: 3, latest: "2 timer siden" },
    { icon: "warning", color: "amber", label: "Tekniske fejl", count: 2, latest: "6 timer siden" },
    { icon: "document", color: "blue", label: "Servicebehov", count: 1, latest: "1 dag siden" },
    { icon: "info", color: "slate", label: "GPS/forbindelse", count: 2, latest: "1 dag siden" },
  ],
  costByMonth: [301200, 287800, 326400, 443100, 392800, 482360],
  downtimeByMonth: [3.4, 2.7, 2.9, 1.8, 1.8, 2.8],
  mapPoints: [
    { x: 43, y: 28, status: "operation", label: "Aalborg" },
    { x: 51, y: 54, status: "operation", label: "Aarhus" },
    { x: 38, y: 69, status: "critical", label: "Esbjerg" },
    { x: 54, y: 74, status: "operation", label: "Odense" },
    { x: 76, y: 70, status: "operation", label: "København" },
    { x: 47, y: 47, status: "warning" },
    { x: 68, y: 62, status: "operation" },
    { x: 58, y: 63, status: "operation" },
    { x: 35, y: 47, status: "operation" },
  ],
};

export function demoDataIsConsistent(data = fleetDemo) {
  const current = data.operationDays.at(-1);
  const reportCount = data.reportItems.reduce((sum, item) => sum + item.count, 0);
  return data.totals.units === data.totals.inOperation + data.totals.workshop + data.totals.needsAction
    && current.operation === data.totals.inOperation
    && current.workshop === data.totals.workshop
    && current.action === data.totals.needsAction
    && data.actionItems.length === data.totals.needsAction
    && reportCount === data.totals.reports
    && data.costByMonth.at(-1) === data.totals.monthlyCost
    && data.downtimeByMonth.at(-1) === data.totals.downtimePct;
}

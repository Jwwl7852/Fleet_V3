import { addLocalDays, endExclusiveForDay, localDateTimeMs, startOfWeek } from "../domain/workforceDomain.js";

export function createSeedState({ tenantId = "demo-transport", now = Date.now() } = {}) {
  const week = startOfWeek(now);
  const date = (day) => {
    const value = new Date(addLocalDays(week, day));
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  };
  const shift = (id, employeeId, day, start, end, status = "published", extra = {}) => {
    const startMs = localDateTimeMs(date(day), start);
    let endMs = localDateTimeMs(date(day), end);
    if (endMs <= startMs) endMs = addLocalDays(endMs, 1);
    return { id, employeeId, startMs, endMs, breakMinutes: 30, status, workplace: "Kolding", ...extra };
  };
  const futureDate = date(3);
  return {
    version: 2, tenantId,
    employees: [
      { id: "emp-anne", name: "Anne Krogh", status: "active", employment: "Fastansat", functions: ["Chauffør"], workplace: "Kolding", team: "Distribution", department: "Drift", managerId: "emp-dennis", phone: "31 55 92 40", email: "anne.krogh@demo.dk", hiredAtMs: localDateTimeMs("2021-03-01", "00:00"), userId: "user-anne" },
      { id: "emp-benjamin", name: "Benjamin Holm", status: "active", employment: "Fastansat", functions: ["Lagermedarbejder"], workplace: "Kolding", team: "Lager", department: "Drift", managerId: "emp-dennis", phone: "27 33 19 84", email: "benjamin.holm@demo.dk", hiredAtMs: localDateTimeMs("2022-08-15", "00:00") },
      { id: "emp-camilla", name: "Camilla Storm", status: "active", employment: "Vikar", functions: ["Buschauffør"], workplace: "Aarhus", team: "Persontransport", department: "Drift", managerId: "emp-dennis", phone: "51 46 08 22", email: "camilla.storm@demo.dk", hiredAtMs: localDateTimeMs("2024-02-01", "00:00") },
      { id: "emp-dennis", name: "Dennis Christensen", status: "active", employment: "Fastansat", functions: ["Disponent", "Administration"], workplace: "Kolding", team: "Planlægning", department: "Administration", managerId: null, phone: "42 88 10 45", email: "dennis@demo.dk", hiredAtMs: localDateTimeMs("2019-01-01", "00:00"), userId: "user-manager" },
      { id: "emp-emil", name: "Emil Brandt", status: "active", employment: "Fastansat", functions: ["Mekaniker"], workplace: "Kolding", team: "Værksted", department: "Drift", managerId: "emp-dennis", phone: "24 19 73 55", email: "emil.brandt@demo.dk", hiredAtMs: localDateTimeMs("2020-06-01", "00:00") },
      { id: "emp-frank", name: "Frank Uhrskov", status: "terminated", employment: "Fastansat", functions: ["Chauffør"], workplace: "Kolding", team: "Distribution", department: "Drift", managerId: "emp-dennis", terminatedAtMs: localDateTimeMs("2026-08-31", "23:59"), hiredAtMs: localDateTimeMs("2018-05-01", "00:00") },
    ],
    shifts: [shift("shift-a1", "emp-anne", 0, "06:00", "14:00"), shift("shift-a2", "emp-anne", 1, "06:00", "14:00"),
      shift("shift-a3", "emp-anne", 2, "06:00", "14:00"), shift("shift-a4", "emp-anne", 3, "06:00", "14:00", "draft"),
      shift("shift-b1", "emp-benjamin", 0, "07:00", "15:00"), shift("shift-b2", "emp-benjamin", 1, "07:00", "15:00"),
      shift("shift-c1", "emp-camilla", 0, "20:00", "04:00", "published", { breakMinutes: 45 }), shift("shift-e1", "emp-emil", 0, "08:00", "16:00")],
    leaves: [
      { id: "leave-pending", employeeId: "emp-benjamin", fromMs: localDateTimeMs(futureDate, "00:00"), toMs: endExclusiveForDay(futureDate), partialDay: false, requestedType: "personal", status: "pending", requestedAtMs: now - 3_600_000, employeeNote: "Familieaftale" },
      { id: "leave-approved", employeeId: "emp-camilla", fromMs: localDateTimeMs(date(2), "12:00"), toMs: localDateTimeMs(date(2), "18:00"), partialDay: true, requestedType: "timeOff", type: "timeOff", status: "approved", requestedAtMs: now - 86_400_000, decidedAtMs: now - 43_200_000, response: "Godkendt" },
    ],
    sensitiveLeave: { "leave-approved": { type: "timeOff", note: "Afspadsering efter weekendvagt" } },
    skills: [
      { id: "skill-a-ce", employeeId: "emp-anne", type: "Kørekort C/E", validUntilMs: localDateTimeMs("2028-06-30", "23:59"), documentName: "koerekort-anne.pdf" },
      { id: "skill-a-adr", employeeId: "emp-anne", type: "ADR", validUntilMs: localDateTimeMs("2026-10-10", "23:59"), documentName: "adr-anne.pdf" },
      { id: "skill-c-d", employeeId: "emp-camilla", type: "Kørekort D", validUntilMs: localDateTimeMs("2029-01-31", "23:59") },
      { id: "skill-e-cert", employeeId: "emp-emil", type: "Liftcertifikat", validUntilMs: localDateTimeMs("2026-09-01", "23:59") },
    ],
    timeEntries: [
      { id: "time-a1", employeeId: "emp-anne", inMs: shift("x", "emp-anne", 0, "06:04", "13:57").startMs, outMs: shift("x", "emp-anne", 0, "06:04", "13:57").endMs, breakMinutes: 30, source: "clock" },
      { id: "time-b-open", employeeId: "emp-benjamin", inMs: localDateTimeMs(date(0), "07:02"), outMs: null, breakMinutes: 0, source: "clock" },
    ],
    reservations: [{ id: "leave:leave-approved", resourceType: "employee", resourceId: "emp-camilla", fromMs: localDateTimeMs(date(2), "12:00"), toMs: localDateTimeMs(date(2), "18:00"), source: { type: "leave", id: "leave-approved" } }],
    planningAssignments: [
      { id: "task-101", employeeId: "emp-anne", title: "Tur 1042 · Kolding–Aarhus", startMs: localDateTimeMs(date(1), "08:00"), endMs: localDateTimeMs(date(1), "11:30"), status: "assigned", requirements: { blocking: ["Kørekort C/E"], warnings: [] } },
      { id: "task-202", employeeId: "emp-benjamin", title: "Varemodtagelse PO-183", startMs: localDateTimeMs(futureDate, "09:00"), endMs: localDateTimeMs(futureDate, "11:00"), status: "assigned", requirements: { blocking: [], warnings: ["Truckcertifikat"] } },
    ],
    history: [],
  };
}

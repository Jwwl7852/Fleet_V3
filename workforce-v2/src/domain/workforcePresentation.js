import { addLocalDays, startOfLocalDay, toLocalDateKey } from "./workforceDomain.js";

const dateFormatter = new Intl.DateTimeFormat("da-DK", { day: "2-digit", month: "short", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit" });

export function formatLeavePeriod(leave) {
  if (leave.partialDay) {
    const sameDay = toLocalDateKey(leave.fromMs) === toLocalDateKey(leave.toMs);
    return sameDay
      ? `${dateFormatter.format(leave.fromMs)} kl. ${timeFormatter.format(leave.fromMs)}–${timeFormatter.format(leave.toMs)}`
      : `${dateFormatter.format(leave.fromMs)} kl. ${timeFormatter.format(leave.fromMs)} – ${dateFormatter.format(leave.toMs)} kl. ${timeFormatter.format(leave.toMs)}`;
  }
  const inclusiveEndMs = addLocalDays(startOfLocalDay(leave.toMs), -1);
  const sameDay = toLocalDateKey(leave.fromMs) === toLocalDateKey(inclusiveEndMs);
  return sameDay
    ? `${dateFormatter.format(leave.fromMs)} · hele dagen`
    : `${dateFormatter.format(leave.fromMs)} – ${dateFormatter.format(inclusiveEndMs)} · hele dage`;
}

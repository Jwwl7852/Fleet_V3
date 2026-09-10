import { db } from "../firebase.js";

export async function hentEjerOekonomi() {
  if (!db) throw new Error("Firebase er ikke konfigureret. Økonomioverblikket blev ikke hentet.");
  const stier = ["udbyder/fakturagrundlag", "udbyder/fakturajobs", "udbyder/kreditnotaer", "udbyder/kreditjobs", "udbyder/dinero", "udbyder/bilagsindbakke/poster", "udbyder/aftaler", "udbyder/crm/virksomheder"];
  const svar = await Promise.all(stier.map((sti) => db.ref(sti).once("value")));
  const [fakturagrundlag, fakturajobs, kreditnotaer, kreditjobs, dinero, bilag, aftaler, crm] = svar.map((s) => s.val() || {});
  return { fakturagrundlag, fakturajobs, kreditnotaer, kreditjobs, dinero, bilag, aftaler, crm };
}
